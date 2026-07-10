import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { CockpitComment } from "../../../shared/types.js";
import { easternDate } from "../services/session.js";
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import { buildCommentUpdate, type CommentPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { createRunLock } from "./runLock.js";
import type { Trigger } from "./triggers.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 24_000;
// Session recycling guards: a per-symbol session lives at most one trading day;
// recycle earlier once the transcript grows past either bound so the cached
// prefix cost does not outgrow the cache savings.
const SESSION_MAX_RUNS = 40;
const SESSION_MAX_SENT_CHARS = 120_000;

const SYSTEM_PROMPT = [
  "你是盘中点评员。会话开始时你会收到一份 JSON 快照，包含：实时报价、5 分钟 K 线与 MACD、资金流、已归档的日内预测摘要、最近几条点评，以及本次触发原因。",
  "之后同一交易日内每次触发，你只会收到一份增量更新（最新报价、新增 K 线、资金流尾部等），此前的快照和你写过的点评都在本对话上文里，直接沿用。",
  "请据此判断当前盘中状态，并调用 submit_comment 恰好一次给出结论。",
  "纪律：",
  "- text 用中文白话，最多两句，说清楚现在发生了什么、意味着什么。",
  "- level：一般观察用 info；值得留意的变化用 warn；触及止损或目标、或与预测明显相反用 alert。",
  "- escalate 只有在你的结论与已归档预测相反、或价格触及止损/目标时才设为 true，其余一律 false。",
  "- 必须调用 submit_comment，不要只用文字回复。",
].join("\n");

export interface CommentatorDeps {
  model: AiModel;
  agentFactory?: AiAgentFactory;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  timeoutMs?: number;
  now?: () => Date;
}

export interface RunCommentatorInput {
  symbol: string;
  pack: CommentPack;
  trigger: Trigger;
  deps: CommentatorDeps;
}

interface CommentatorSession {
  agentSession: ReturnType<typeof createAgentSession>;
  easternDate: string;
  modelKey: string;
  runCount: number;
  sentChars: number;
  lastBarTime: string | null;
}

const commentatorRunLock = createRunLock();
const sessions = new Map<string, CommentatorSession>();

export function resetCommentatorSessions(): void {
  sessions.clear();
}

function modelKey(model: AiModel): string {
  const ref = model as { provider?: string; id?: string; thinkingLevel?: string };
  return `${ref.provider ?? "unknown"}/${ref.id ?? "unknown"}/${ref.thinkingLevel ?? "off"}`;
}

function triggerText(trigger: Trigger): string {
  return `${trigger.kind}: ${trigger.detail}`;
}

const submitSchema = Type.Object({
  level: Type.Union([Type.Literal("info"), Type.Literal("warn"), Type.Literal("alert")]),
  text: Type.String({ description: "中文白话，最多两句" }),
  escalate: Type.Boolean(),
});

type SubmitParams = Static<typeof submitSchema>;

function buildSubmitTool(
  symbol: string,
  trigger: string,
  append: (comment: CockpitComment) => Promise<void>,
  onSubmit: (escalate: boolean) => void,
  isTerminated: () => boolean,
): AgentTool<typeof submitSchema> {
  return {
    name: "submit_comment",
    label: "Submit Comment",
    description: "记录一条盘中点评。收到快照后必须调用且只调用一次。",
    parameters: submitSchema,
    execute: async (_id, params: SubmitParams) => {
      if (isTerminated()) {
        return { content: [{ type: "text", text: "skipped" }], details: {}, terminate: true };
      }
      await append({
        ts: new Date().toISOString(),
        symbol,
        level: params.level,
        text: params.text,
        trigger,
        source: "commentator",
        escalated: params.escalate,
      });
      onSubmit(params.escalate);
      return { content: [{ type: "text", text: "recorded" }], details: {}, terminate: true };
    },
  };
}

function getValidSession(symbol: string, today: string, key: string): CommentatorSession | null {
  const session = sessions.get(symbol);
  if (!session) return null;
  if (session.easternDate !== today || session.modelKey !== key) {
    sessions.delete(symbol);
    return null;
  }
  return session;
}

function lastBarTimeOf(pack: CommentPack): string | null {
  const bars = pack.m5.bars;
  return bars.length ? bars[bars.length - 1].time : null;
}

export async function runCommentator({
  symbol,
  pack,
  trigger,
  deps,
}: RunCommentatorInput): Promise<{ escalate: boolean }> {
  if (!commentatorRunLock.tryAcquire(symbol)) return { escalate: false };

  const append = deps.appendComment ?? defaultAppendComment;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());
  const reason = triggerText(trigger);

  const writeError = (text: string) =>
    append({
      ts: new Date().toISOString(),
      symbol,
      level: "error",
      text,
      trigger: reason,
      source: "system",
    });

  let session: CommentatorSession | null = null;

  try {
    let escalate: boolean | null = null;
    const tool = buildSubmitTool(
      symbol,
      reason,
      append,
      (value) => {
        escalate = value;
      },
      () => session?.agentSession.isDone() ?? false,
    );

    const today = easternDate(now());
    const key = modelKey(deps.model);
    session = getValidSession(symbol, today, key);
    let promptText: string;
    if (session) {
      session.agentSession.agent.setTools?.([tool]);
      const update = buildCommentUpdate(pack, session.lastBarTime);
      promptText = JSON.stringify({ update, trigger }).slice(0, MAX_PROMPT_CHARS);
    } else {
      const agentSession = createAgentSession({
        layer: "commentator",
        symbol,
        model: deps.model,
        systemPrompt: SYSTEM_PROMPT,
        tools: [tool],
        agentFactory: deps.agentFactory,
      });
      session = { agentSession, easternDate: today, modelKey: key, runCount: 0, sentChars: 0, lastBarTime: null };
      sessions.set(symbol, session);
      promptText = JSON.stringify({ pack, trigger }).slice(0, MAX_PROMPT_CHARS);
    }

    await session.agentSession.runTurn(promptText, timeoutMs);

    if (escalate === null) {
      // The agent ignored the tool contract; drop the session rather than
      // carry the non-compliant exchange into the cached prefix.
      sessions.delete(symbol);
      await writeError("点评员未调用 submit_comment，本次无结论。");
      return { escalate: false };
    }

    session.runCount += 1;
    session.sentChars += promptText.length;
    session.lastBarTime = lastBarTimeOf(pack) ?? session.lastBarTime;
    if (session.runCount >= SESSION_MAX_RUNS || session.sentChars >= SESSION_MAX_SENT_CHARS) {
      sessions.delete(symbol);
    }
    return { escalate };
  } catch (err) {
    sessions.delete(symbol);
    const text =
      err instanceof AgentTimeoutError
        ? `点评员超时未产出结论（${timeoutMs}ms）。`
        : `点评员运行失败：${err instanceof Error ? err.message : String(err)}`;
    await writeError(text);
    return { escalate: false };
  } finally {
    commentatorRunLock.release(symbol);
  }
}
