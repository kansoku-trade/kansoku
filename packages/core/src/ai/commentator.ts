import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { CockpitComment } from "@kansoku/shared/types";
import { easternDate } from "../services/session.js";
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import { buildCommentUpdate, type CommentPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import { COMMENTATOR_PROMPT, COMMENTATOR_RETRY_PROMPT } from "./prompts.js";
import { composeWithDiscipline, OBSERVER_CONTRACT } from "./promptPolicy.js";
import { createRunLock } from "./runLock.js";
import type { Trigger } from "./triggers.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 24_000;
// Session recycling guards: a per-symbol session lives at most one trading day;
// recycle earlier once the transcript grows past either bound so the cached
// prefix cost does not outgrow the cache savings.
const SESSION_MAX_RUNS = 40;
const SESSION_MAX_SENT_CHARS = 120_000;

// Observer, not judge: it narrates observable change on a scheduler tick. It gets the compact
// observer contract, not the full shared discipline — the GAAP trap and QoQ rules are pure cost
// to an agent that never reads a financial statement.
const SYSTEM_PROMPT = composeWithDiscipline(OBSERVER_CONTRACT, COMMENTATOR_PROMPT);

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

    let sentChars = promptText.length;
    if (escalate === null) {
      await session.agentSession.runTurn(COMMENTATOR_RETRY_PROMPT, timeoutMs);
      sentChars += COMMENTATOR_RETRY_PROMPT.length;
    }

    if (escalate === null) {
      // The agent ignored the tool contract even after a nudge; drop the
      // session rather than carry the non-compliant exchange into the
      // cached prefix.
      sessions.delete(symbol);
      await writeError("点评员重试一次后仍未调用 submit_comment，本次无结论。");
      return { escalate: false };
    }

    session.runCount += 1;
    session.sentChars += sentChars;
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
