import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { CockpitComment } from "../../../shared/types.js";
import { appendComment as defaultAppendComment } from "./comments.js";
import type { CommentPack } from "./datapack.js";
import type { AiModel } from "./models.js";
import type { Trigger } from "./triggers.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 24_000;

const SYSTEM_PROMPT = [
  "你是盘中点评员。你会收到一份 JSON 快照，包含：实时报价、5 分钟 K 线与 MACD、资金流、已归档的日内预测摘要、最近几条点评，以及本次触发原因。",
  "请据此判断当前盘中状态，并调用 submit_comment 恰好一次给出结论。",
  "纪律：",
  "- text 用中文白话，最多两句，说清楚现在发生了什么、意味着什么。",
  "- level：一般观察用 info；值得留意的变化用 warn；触及止损或目标、或与预测明显相反用 alert。",
  "- escalate 只有在你的结论与已归档预测相反、或价格触及止损/目标时才设为 true，其余一律 false。",
  "- 必须调用 submit_comment，不要只用文字回复。",
].join("\n");

export interface CommentatorAgent {
  prompt(text: string): Promise<unknown>;
  abort(): void;
}

export type AgentFactory = (config: {
  systemPrompt: string;
  model: AiModel;
  tools: AgentTool[];
}) => CommentatorAgent;

export interface CommentatorDeps {
  model: AiModel;
  agentFactory?: AgentFactory;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  timeoutMs?: number;
}

export interface RunCommentatorInput {
  symbol: string;
  pack: CommentPack;
  trigger: Trigger;
  deps: CommentatorDeps;
}

const runningCommentators = new Set<string>();

const defaultAgentFactory: AgentFactory = (config) =>
  new Agent({
    initialState: {
      systemPrompt: config.systemPrompt,
      model: config.model,
      tools: config.tools,
    },
  });

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

interface RunState {
  done: boolean;
}

class CommentatorTimeoutError extends Error {}

async function runWithTimeout(
  agent: CommentatorAgent,
  prompt: string,
  timeoutMs: number,
  state: RunState,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.done) return;
      state.done = true;
      agent.abort();
      reject(new CommentatorTimeoutError(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    agent.prompt(prompt).then(
      () => {
        if (state.done) return;
        state.done = true;
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        if (state.done) return;
        state.done = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export async function runCommentator({
  symbol,
  pack,
  trigger,
  deps,
}: RunCommentatorInput): Promise<{ escalate: boolean }> {
  if (runningCommentators.has(symbol)) return { escalate: false };
  runningCommentators.add(symbol);

  const append = deps.appendComment ?? defaultAppendComment;
  const factory = deps.agentFactory ?? defaultAgentFactory;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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

  const state: RunState = { done: false };

  try {
    let escalate: boolean | null = null;
    const tool = buildSubmitTool(
      symbol,
      reason,
      append,
      (value) => {
        escalate = value;
      },
      () => state.done,
    );
    const agent = factory({ systemPrompt: SYSTEM_PROMPT, model: deps.model, tools: [tool] });
    const promptText = JSON.stringify({ pack, trigger }).slice(0, MAX_PROMPT_CHARS);

    await runWithTimeout(agent, promptText, timeoutMs, state);

    if (escalate === null) {
      await writeError("点评员未调用 submit_comment，本次无结论。");
      return { escalate: false };
    }
    return { escalate };
  } catch (err) {
    const text =
      err instanceof CommentatorTimeoutError
        ? `点评员超时未产出结论（${timeoutMs}ms）。`
        : `点评员运行失败：${err instanceof Error ? err.message : String(err)}`;
    await writeError(text);
    return { escalate: false };
  } finally {
    runningCommentators.delete(symbol);
  }
}
