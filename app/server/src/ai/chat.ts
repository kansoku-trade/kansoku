import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { ChartDoc, CockpitComment, IntradayPrediction, NewsItem, RawBar } from "../../../shared/types.js";
import { getProvider } from "../services/marketdata/registry.js";
import { easternDate } from "../services/session.js";
import { loadChart as defaultLoadChart } from "../services/store.js";
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from "./agentSession.js";
import {
  appendMessages,
  type ChatMessageRow,
  createSession,
  getSessionByChartId,
  listMessages,
  titleFromText,
} from "./chatStore.js";
import { listComments as defaultListComments } from "./comments.js";
import { buildDataPackTool, buildKlineTool, buildNewsTool } from "./dataTools.js";
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { createRunLock } from "./runLock.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const COMMENT_CAP = 20;
const RELEVANT_COMMENT_SOURCES = new Set(["analyst", "system"]);

export type ChatEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end" }
  | { event: "done" }
  | { event: "error"; message: string };

export interface ChatDisplayMessage {
  id: string;
  ts: string;
  kind: "user" | "assistant" | "tool";
  text?: string;
  label?: string;
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
}

export type ChatStartResult =
  | { started: false; reason: "busy" | "chart_not_found" | "not_intraday" | "no_model" }
  | { started: true; done: Promise<void> };

interface TurnState {
  busy: boolean;
  partial: string;
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

function textOf(block: { type: string; text?: string }): string {
  return block.type === "text" && typeof block.text === "string" ? block.text : "";
}

function concatAssistantText(message: AgentMessage): string {
  if (message.role !== "assistant") return "";
  return message.content.map(textOf).join("");
}

export function toDisplayMessages(rows: ChatMessageRow[]): ChatDisplayMessage[] {
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
          out.push({ id, ts: row.ts, kind: "tool", label: block.name });
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

export function buildChatSystemPrompt(doc: ChartDoc, analysisDayComments: CockpitComment[]): string {
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;
  const predictionText = prediction ? JSON.stringify(prediction) : "该分析未附带预测结论";

  const commentLines = analysisDayComments
    .filter((c) => RELEVANT_COMMENT_SOURCES.has(c.source))
    .slice(-COMMENT_CAP)
    .map((c) => `${etClock(c.ts)} ${c.text}`);

  return [
    "你是短线技术分析员的对话模式，用户在一份已归档的日内分析上向你追问。",
    "",
    `标的：${doc.symbol}`,
    `分析创建时间：${doc.created_at}`,
    `已归档预测：${predictionText}`,
    commentLines.length ? `当日分析员点评：\n${commentLines.join("\n")}` : "当日暂无分析员点评。",
    "",
    "对话纪律：",
    "- 已归档的预测是冻结记录：不要修改、不要重新提交结论；用户要新结论就让他点「重新分析」。",
    "- 回答里引用任何数字都要注明口径：是分析时点的快照，还是刚用工具拉的实时数据。",
    "- 需要最新行情/消息就调用工具，不要凭记忆猜；拿不到数据就直说。",
    "- 不给仓位建议（股数/金额）。",
    "- 全程中文白话，只做美股。",
  ].join("\n");
}

interface TranslatorCtx {
  emittedLen: number;
}

function translateEvent(
  event: AgentEvent,
  ctx: TranslatorCtx,
  toolLabels: Map<string, string>,
  state: TurnState,
  emit: (event: ChatEvent) => void,
): void {
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
      emit({ event: "delta", text: delta });
    }
    return;
  }
  if (event.type === "tool_execution_start") {
    emit({ event: "tool", label: toolLabels.get(event.toolName) ?? event.toolName, status: "start" });
    return;
  }
  if (event.type === "tool_execution_end") {
    emit({ event: "tool", label: toolLabels.get(event.toolName) ?? event.toolName, status: "end" });
  }
}

function buildTools(
  symbol: string,
  deps: {
    buildPack: (symbol: string) => Promise<ReassessPack>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
  },
): AgentTool[] {
  return [
    buildDataPackTool(symbol, { buildPack: deps.buildPack }),
    buildKlineTool(symbol, deps.fetchKline),
    buildNewsTool(symbol, deps.fetchNews),
  ];
}

async function persistIncrement(
  sessionId: string,
  agent: ReturnType<typeof createAgentSession>["agent"],
  historyLength: number,
): Promise<void> {
  const messages = agent.state?.messages ?? [];
  const increment = messages.slice(historyLength + 1);
  if (increment.length) await appendMessages(sessionId, increment);
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
  const systemPrompt = buildChatSystemPrompt(doc, analysisDayComments);

  const tools = buildTools(symbol, { buildPack: buildPackFn, fetchKline: fetchKlineFn, fetchNews: fetchNewsFn });
  const toolLabels = new Map(tools.map((tool) => [tool.name, tool.label]));

  const translatorCtx: TranslatorCtx = { emittedLen: 0 };

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

  try {
    await agentSession.runTurn(text, timeoutMs);
    await persistIncrement(chatSession.id, agentSession.agent, history.length);
    broadcast(chartId, { event: "done" });
  } catch (err) {
    await persistIncrement(chatSession.id, agentSession.agent, history.length);
    const message =
      err instanceof AgentTimeoutError
        ? `回答超时（${timeoutMs}ms）`
        : err instanceof Error
          ? err.message
          : String(err);
    broadcast(chartId, { event: "error", message });
  }
}

export async function runChatTurn(chartId: string, text: string, deps: ChatDeps): Promise<ChatStartResult> {
  if (!chatRunLock.tryAcquire(chartId)) return { started: false, reason: "busy" };

  const loadChartFn = deps.loadChart ?? defaultLoadChart;
  const doc = await loadChartFn(chartId);
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
  const state: TurnState = { busy: true, partial: "" };
  turnStates.set(chartId, state);

  const done = executeChatTurn(chartId, text, doc, symbol, model, deps, state).finally(() => {
    chatRunLock.release(chartId);
    turnStates.delete(chartId);
  });

  return { started: true, done };
}
