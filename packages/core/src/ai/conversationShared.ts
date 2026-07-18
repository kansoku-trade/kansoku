import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Db } from "../db/index.js";
import type { AiAgentHandle } from "./agentSession.js";
import type { AiModel } from "./models.js";

export const TOOL_TEXT_CAP = 4000;

export function truncate(text: string): string {
  return text.length > TOOL_TEXT_CAP ? `${text.slice(0, TOOL_TEXT_CAP)}…（已截断）` : text;
}

export function stringifyPayload(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value ? truncate(value) : undefined;
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

export function textOf(block: { type: string; text?: string }): string {
  return block.type === "text" && typeof block.text === "string" ? block.text : "";
}

export function agentToolResultText(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  return content.map((block) => textOf(block as { type: string; text?: string })).join("");
}

export function concatAssistantText(message: AgentMessage): string {
  return message.role === "assistant" ? message.content.map(textOf).join("") : "";
}

export function hasAssistantText(messages: AgentMessage[]): boolean {
  return messages.some((message) => concatAssistantText(message).length > 0);
}

export const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function synthesizePartialAssistantMessage(
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

type AppendFn = (sessionId: string, messages: AgentMessage[], db?: Db) => Promise<void>;

export async function persistIncrement(
  append: AppendFn,
  sessionId: string,
  agent: AiAgentHandle,
  historyLength: number,
  db?: Db,
): Promise<AgentMessage[]> {
  const messages = agent.state?.messages ?? [];
  const increment = messages.slice(historyLength + 1);
  if (increment.length) await append(sessionId, increment, db);
  return increment;
}

export async function persistFailureIncrement(
  append: AppendFn,
  logMessage: string,
  sessionId: string,
  agent: AiAgentHandle,
  historyLength: number,
  partial: string,
  model: AiModel,
  timestamp: number,
  db?: Db,
): Promise<AgentMessage[]> {
  try {
    const increment = await persistIncrement(append, sessionId, agent, historyLength, db);
    if (hasAssistantText(increment) || !partial) return increment;
    const synthesized = synthesizePartialAssistantMessage(model, partial, timestamp);
    await append(sessionId, [synthesized], db);
    return [...increment, synthesized];
  } catch (err) {
    console.error(logMessage, err);
    return [];
  }
}
