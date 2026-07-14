import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { ChartDoc, CockpitComment, IntradayPrediction, NewsItem, RawBar } from "../../../../shared/types.js";
import { PROJECT_ROOT } from "../env.js";
import { getProvider } from "../services/marketdata/registry.js";
import { easternDate } from "../services/session.js";
import { loadChart as defaultLoadChart } from "../services/store.js";
import { AgentTimeoutError, type AiAgentFactory, type AiAgentHandle, createAgentSession } from "./agentSession.js";
import {
  appendMessages,
  type ChatMessageRow,
  createSession,
  getSessionByChartId,
  listMessages,
  titleFromText,
} from "./chatStore.js";
import { listComments as defaultListComments } from "./comments.js";
import { buildDataPackTool, buildKlineTool, buildNewsTool, textResult } from "./dataTools.js";
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { CHAT_DIALOG_RULES, CHAT_GATED_RETRY_INSTRUCTION, CHAT_GATED_TURN_INSTRUCTION } from "./prompts.js";
import { composeWithDiscipline, DisciplineMissingError, loadSharedDiscipline } from "./promptPolicy.js";
import { createRunLock } from "./runLock.js";
import {
  type DirectionalVerification,
  isDirectionalClaim,
  rejectAnswer,
  verifyDirectionalRead,
} from "./verifyRead.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const COMMENT_CAP = 20;
const RELEVANT_COMMENT_SOURCES = new Set(["analyst", "system"]);
const TOOL_TEXT_CAP = 4000;


export type ChatEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end"; input?: string; output?: string }
  | { event: "done" }
  | { event: "aborted" }
  | { event: "error"; message: string };

export interface ChatDisplayMessage {
  id: string;
  ts: string;
  kind: "user" | "assistant" | "tool";
  text?: string;
  label?: string;
  input?: string;
  output?: string;
}

export interface ChatDeps {
  model: AiModel | null;
  loadChart?: (chartId: string) => Promise<ChartDoc | null>;
  listComments?: (symbol: string, date: string) => Promise<CockpitComment[]>;
  buildPack?: (symbol: string) => Promise<ReassessPack>;
  fetchKline?: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  fetchNews?: (symbol: string) => Promise<NewsItem[]>;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
  now?: () => number;
  repoRoot?: string;
  disciplineText?: string;
}

export type ChatStartResult =
  | { started: false; reason: "busy" | "chart_not_found" | "not_intraday" | "no_model" }
  | { started: true; done: Promise<void> };

interface TurnState {
  busy: boolean;
  partial: string;
  aborted: boolean;
  abort: (() => void) | null;
}

const chatRunLock = createRunLock();
const turnStates = new Map<string, TurnState>();
const listeners = new Map<string, Set<(event: ChatEvent) => void>>();

export function onChatEvent(chartId: string, listener: (event: ChatEvent) => void): () => void {
  let set = listeners.get(chartId);
  if (!set) {
    set = new Set();
    listeners.set(chartId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(chartId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(chartId);
  };
}

function broadcast(chartId: string, event: ChatEvent): void {
  const set = listeners.get(chartId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(event);
    } catch {
      continue;
    }
  }
}

export function chatTurnState(chartId: string): { busy: boolean; partial: string } {
  const state = turnStates.get(chartId);
  return state ? { busy: state.busy, partial: state.partial } : { busy: false, partial: "" };
}

export function abortChatTurn(chartId: string): boolean {
  const state = turnStates.get(chartId);
  if (!state?.busy || !state.abort) return false;
  state.aborted = true;
  state.abort();
  return true;
}

function truncate(text: string): string {
  return text.length > TOOL_TEXT_CAP ? `${text.slice(0, TOOL_TEXT_CAP)}…（已截断）` : text;
}

function stringifyToolPayload(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value ? truncate(value) : undefined;
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function textOf(block: { type: string; text?: string }): string {
  return block.type === "text" && typeof block.text === "string" ? block.text : "";
}

function toolResultText(message: Extract<AgentMessage, { role: "toolResult" }>): string {
  return message.content.map(textOf).join("");
}

function agentToolResultText(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  return content.map((block) => textOf(block as { type: string; text?: string })).join("");
}

function concatAssistantText(message: AgentMessage): string {
  if (message.role !== "assistant") return "";
  return message.content.map(textOf).join("");
}

export function toDisplayMessages(rows: ChatMessageRow[]): ChatDisplayMessage[] {
  const outputs = new Map<string, string>();
  for (const row of rows) {
    const message = row.payload;
    if (message.role === "toolResult") outputs.set(message.toolCallId, toolResultText(message));
  }

  const out: ChatDisplayMessage[] = [];
  for (const row of rows) {
    const message = row.payload;
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content : message.content.map(textOf).join("");
      out.push({ id: row.id, ts: row.ts, kind: "user", text });
      continue;
    }
    if (message.role === "assistant") {
      message.content.forEach((block, idx) => {
        const id = idx === 0 ? row.id : `${row.id}:${idx}`;
        if (block.type === "text") {
          out.push({ id, ts: row.ts, kind: "assistant", text: block.text });
        } else if (block.type === "toolCall") {
          out.push({
            id,
            ts: row.ts,
            kind: "tool",
            label: block.name,
            input: stringifyToolPayload(block.arguments),
            output: stringifyToolPayload(outputs.get(block.id)),
          });
        }
      });
    }
  }
  return out;
}

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

function etClock(ts: string): string {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? clockFormatter.format(new Date(ms)) : ts;
}

export function buildChatSystemPrompt(
  doc: ChartDoc,
  analysisDayComments: CockpitComment[],
  disciplineText = "",
): string {
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;
  const predictionText = prediction ? JSON.stringify(prediction) : "该分析未附带预测结论";

  const commentLines = analysisDayComments
    .filter((c) => RELEVANT_COMMENT_SOURCES.has(c.source) && c.level !== "error")
    .slice(-COMMENT_CAP)
    .map((c) => `${etClock(c.ts)} ${c.text}`);

  const own = [
    "你是交易看盘应用 Kansoku 的短线技术分析员对话模式，用户正在 Kansoku 里的一份已归档日内分析上向你追问。",
    "",
    `标的：${doc.symbol}`,
    `分析创建时间：${doc.created_at}`,
    `已归档预测：${predictionText}`,
    commentLines.length ? `当日分析员点评：\n${commentLines.join("\n")}` : "当日暂无分析员点评。",
    "",
    CHAT_DIALOG_RULES,
  ].join("\n");

  // Chat is where the user pushes back on a call, so it is a judgment agent: the caller loads the
  // shared discipline and fails closed without it. Injected rather than read here so this stays a
  // pure function.
  return composeWithDiscipline(disciplineText, own);
}

interface TranslatorCtx {
  emittedLen: number;
  settled: boolean;
  /**
   * On a directional-claim turn the model's free text is suppressed until submit_chat_answer has
   * passed the mechanical gate. Streaming it live would defeat the gate entirely — the words are
   * already on the user's screen by the time a post-hoc check could reject them.
   */
  buffered: boolean;
}

function translateEvent(
  event: AgentEvent,
  ctx: TranslatorCtx,
  toolLabels: Map<string, string>,
  state: TurnState,
  emit: (event: ChatEvent) => void,
): void {
  if (ctx.settled) return;
  if (event.type === "message_start") {
    if (event.message.role === "assistant") {
      ctx.emittedLen = 0;
      state.partial = "";
    }
    return;
  }
  if (event.type === "message_update") {
    if (event.message.role !== "assistant") return;
    const full = concatAssistantText(event.message);
    if (full.length > ctx.emittedLen) {
      const delta = full.slice(ctx.emittedLen);
      ctx.emittedLen = full.length;
      state.partial = full;
      if (!ctx.buffered) emit({ event: "delta", text: delta });
    }
    return;
  }
  if (event.type === "tool_execution_start") {
    emit({
      event: "tool",
      label: toolLabels.get(event.toolName) ?? event.toolName,
      status: "start",
      input: stringifyToolPayload(event.args),
    });
    return;
  }
  if (event.type === "tool_execution_end") {
    emit({
      event: "tool",
      label: toolLabels.get(event.toolName) ?? event.toolName,
      status: "end",
      output: stringifyToolPayload(agentToolResultText(event.result)),
    });
  }
}

const claimStatusSchema = Type.Union([
  Type.Literal("supported"),
  Type.Literal("partial"),
  Type.Literal("contradicted"),
  Type.Literal("insufficient"),
]);

const submitChatAnswerSchema = Type.Object({
  claim_status: claimStatusSchema,
  verification_id: Type.Optional(Type.String()),
  answer: Type.String(),
});

const noArgsSchema = Type.Object({});

/** Per-turn verification ledger. A submitted answer may only cite an id minted in this turn. */
interface VerifyCtx {
  minted: Map<string, DirectionalVerification>;
  answer: string | null;
  seq: number;
}

function buildVerifyTools(
  symbol: string,
  ctx: VerifyCtx,
  deps: { buildPack: (symbol: string) => Promise<ReassessPack>; now: () => number },
): AgentTool[] {
  const verifyTool: AgentTool<typeof noArgsSchema> = {
    name: "verify_directional_read",
    label: "Verify Directional Read",
    description:
      "核验用户对走势的判断。重新拉取实时数据，由服务端算出现价、今日正常盘高/低、盘前高、前一日高/收，" +
      "并给出机械判定（现价是否真的过了盘前高）。用户说突破/见底/砸盘时必须先调用它。",
    parameters: noArgsSchema,
    execute: async () => {
      const pack = await deps.buildPack(symbol);
      ctx.seq += 1;
      const id = `v${ctx.seq}`;
      const verification = verifyDirectionalRead(pack, id, new Date(deps.now()));
      ctx.minted.set(id, verification);
      return textResult(JSON.stringify(verification));
    },
  };

  const submitTool: AgentTool<typeof submitChatAnswerSchema> = {
    name: "submit_chat_answer",
    label: "Submit Answer",
    description:
      "提交本轮回答。用户对走势下了判断时必须走这个工具，并带上本轮 verify_directional_read 返回的 verification_id。" +
      "claim_status 四选一：supported / partial / contradicted / insufficient。证据不足就填 insufficient，不要站队。",
    parameters: submitChatAnswerSchema,
    execute: async (_id, params) => {
      const rejection = rejectAnswer(params, ctx.minted);
      if (rejection) return textResult(rejection);
      if (!params.answer.trim()) return textResult("rejected: answer 不能为空。");
      ctx.answer = params.answer;
      return textResult("accepted");
    },
  };

  return [verifyTool, submitTool];
}

function buildTools(
  symbol: string,
  deps: {
    buildPack: (symbol: string) => Promise<ReassessPack>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    now: () => number;
  },
  verifyCtx: VerifyCtx | null,
): AgentTool[] {
  const base = [
    buildDataPackTool(symbol, { buildPack: deps.buildPack }),
    buildKlineTool(symbol, deps.fetchKline),
    buildNewsTool(symbol, deps.fetchNews),
  ];
  // The verification pair only exists on turns where the user actually made a directional claim.
  // Handing it to every turn would train the model to route ordinary questions through a gate
  // that has nothing to check.
  return verifyCtx ? [...base, ...buildVerifyTools(symbol, verifyCtx, deps)] : base;
}

async function persistIncrement(
  sessionId: string,
  agent: AiAgentHandle,
  historyLength: number,
): Promise<AgentMessage[]> {
  const messages = agent.state?.messages ?? [];
  const increment = messages.slice(historyLength + 1);
  if (increment.length) await appendMessages(sessionId, increment);
  return increment;
}

function hasAssistantText(messages: AgentMessage[]): boolean {
  return messages.some((message) => concatAssistantText(message).length > 0);
}

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function synthesizePartialAssistantMessage(
  model: AiModel,
  text: string,
  timestamp: number,
  stopReason: "aborted" | "stop" = "aborted",
): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: ZERO_USAGE,
    stopReason,
    timestamp,
  };
}

async function persistFailureIncrement(
  sessionId: string,
  agent: AiAgentHandle,
  historyLength: number,
  partial: string,
  model: AiModel,
  timestamp: number,
): Promise<AgentMessage[]> {
  try {
    const increment = await persistIncrement(sessionId, agent, historyLength);
    if (hasAssistantText(increment) || !partial) return increment;
    const synthesized = synthesizePartialAssistantMessage(model, partial, timestamp);
    await appendMessages(sessionId, [synthesized]);
    return [...increment, synthesized];
  } catch (err) {
    console.error("chat: failed to persist failure-path increment", err);
    return [];
  }
}

async function executeChatTurn(
  chartId: string,
  text: string,
  doc: ChartDoc,
  symbol: string,
  model: AiModel,
  deps: ChatDeps,
  state: TurnState,
): Promise<void> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const listCommentsFn = deps.listComments ?? defaultListComments;
    const buildPackFn = deps.buildPack ?? defaultBuildReassessPack;
    const fetchKlineFn = deps.fetchKline ?? ((sym, period, count) => getProvider().getKline(sym, period, count));
    const fetchNewsFn = deps.fetchNews ?? ((sym) => getProvider().getNews(sym));

    let chatSession = await getSessionByChartId(chartId);
    if (!chatSession) {
      chatSession = await createSession({ chartId, symbol, title: titleFromText(text) });
    }

    const history = await listMessages(chatSession.id);
    const historyPayloads = history.map((row) => row.payload);

    const nowMs = deps.now ? deps.now() : Date.now();
    const userMessage: AgentMessage = { role: "user", content: text, timestamp: nowMs };
    await appendMessages(chatSession.id, [userMessage]);

    const analysisDayComments = await listCommentsFn(symbol, easternDate(new Date(doc.created_at)));
    const disciplineText = deps.disciplineText ?? loadSharedDiscipline(deps.repoRoot ?? PROJECT_ROOT);
    if (!disciplineText) throw new DisciplineMissingError();
    const systemPrompt = buildChatSystemPrompt(doc, analysisDayComments, disciplineText);

    const gated = isDirectionalClaim(text);
    const verifyCtx: VerifyCtx | null = gated ? { minted: new Map(), answer: null, seq: 0 } : null;

    const tools = buildTools(
      symbol,
      {
        buildPack: buildPackFn,
        fetchKline: fetchKlineFn,
        fetchNews: fetchNewsFn,
        now: () => (deps.now ? deps.now() : Date.now()),
      },
      verifyCtx,
    );
    const toolLabels = new Map(tools.map((tool) => [tool.name, tool.label]));

    const translatorCtx: TranslatorCtx = { emittedLen: 0, settled: false, buffered: gated };

    const agentSession = createAgentSession({
      layer: "chat",
      symbol,
      model,
      systemPrompt,
      tools,
      messages: historyPayloads,
      agentFactory: deps.agentFactory,
      onEvent: (event) => translateEvent(event, translatorCtx, toolLabels, state, (e) => broadcast(chartId, e)),
    });

    state.abort = () => agentSession.agent.abort();

    const settleAborted = async (): Promise<void> => {
      const abortedNowMs = deps.now ? deps.now() : Date.now();
      await persistFailureIncrement(
        chatSession.id,
        agentSession.agent,
        history.length,
        state.partial,
        model,
        abortedNowMs,
      );
      broadcast(chartId, { event: "aborted" });
    };

    try {
      await agentSession.runTurn(gated ? `${text}\n\n${CHAT_GATED_TURN_INSTRUCTION}` : text, timeoutMs);

      // One explicit retry, mirroring the commentator: a rejected submit only returns a tool
      // result, so without an outer nudge the model is free to give up and ship nothing.
      if (verifyCtx && !verifyCtx.answer && !state.aborted && !agentSession.agent.state?.errorMessage) {
        await agentSession.runTurn(CHAT_GATED_RETRY_INSTRUCTION, timeoutMs);
      }

      translatorCtx.settled = true;
      if (state.aborted) {
        await settleAborted();
        return;
      }
      const increment = await persistIncrement(chatSession.id, agentSession.agent, history.length);
      const errorMessage = agentSession.agent.state?.errorMessage;

      if (verifyCtx) {
        if (errorMessage) {
          broadcast(chartId, { event: "error", message: errorMessage });
          return;
        }
        if (!verifyCtx.answer) {
          // Fail closed. An unverified answer is worse than no answer.
          broadcast(chartId, { event: "error", message: "回答未通过走势核验，已拦截。请重试或改用「重新分析」。" });
          return;
        }
        const answerMs = deps.now ? deps.now() : Date.now();
        await appendMessages(chatSession.id, [
          synthesizePartialAssistantMessage(model, verifyCtx.answer, answerMs, "stop"),
        ]);
        broadcast(chartId, { event: "delta", text: verifyCtx.answer });
        broadcast(chartId, { event: "done" });
        return;
      }

      if (errorMessage || !hasAssistantText(increment)) {
        broadcast(chartId, { event: "error", message: errorMessage ?? "模型未产出回答" });
      } else {
        broadcast(chartId, { event: "done" });
      }
    } catch (err) {
      translatorCtx.settled = true;
      if (state.aborted) {
        await settleAborted();
        return;
      }
      const failureNowMs = deps.now ? deps.now() : Date.now();
      await persistFailureIncrement(
        chatSession.id,
        agentSession.agent,
        history.length,
        state.partial,
        model,
        failureNowMs,
      );
      const message =
        err instanceof AgentTimeoutError
          ? `回答超时（${timeoutMs}ms）`
          : err instanceof Error
            ? err.message
            : String(err);
      broadcast(chartId, { event: "error", message });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("chat: executeChatTurn failed before the agent turn started", err);
    broadcast(chartId, { event: "error", message });
  }
}

export async function runChatTurn(chartId: string, text: string, deps: ChatDeps): Promise<ChatStartResult> {
  if (!chatRunLock.tryAcquire(chartId)) return { started: false, reason: "busy" };

  let doc: ChartDoc | null;
  try {
    const loadChartFn = deps.loadChart ?? defaultLoadChart;
    doc = await loadChartFn(chartId);
  } catch (err) {
    chatRunLock.release(chartId);
    throw err;
  }
  if (!doc) {
    chatRunLock.release(chartId);
    return { started: false, reason: "chart_not_found" };
  }
  if (doc.built.kind !== "intraday" || !doc.symbol) {
    chatRunLock.release(chartId);
    return { started: false, reason: "not_intraday" };
  }
  if (!deps.model) {
    chatRunLock.release(chartId);
    return { started: false, reason: "no_model" };
  }

  const symbol = doc.symbol;
  const model = deps.model;
  const state: TurnState = { busy: true, partial: "", aborted: false, abort: null };
  turnStates.set(chartId, state);

  const done = executeChatTurn(chartId, text, doc, symbol, model, deps, state).finally(() => {
    chatRunLock.release(chartId);
    turnStates.delete(chartId);
  });

  return { started: true, done };
}
