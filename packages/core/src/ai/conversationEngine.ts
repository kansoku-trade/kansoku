import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { AgentTimeoutError, type AiAgentFactory, createAgentSession } from "./agentSession.js";
import {
  agentToolResultText,
  concatAssistantText,
  hasAssistantText,
  persistFailureIncrement,
  persistIncrement,
  stringifyPayload,
  synthesizePartialAssistantMessage,
} from "./conversationShared.js";
import { type ConversationMessageRow, titleFromText } from "./conversationStore.js";
import type { AiModel } from "./models.js";
import { createRunLock } from "./runLock.js";
import type { AiUsageLogContext } from "./usage.js";

const DEFAULT_TIMEOUT_MS = 180_000;

export type ConversationEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end"; input?: string; output?: string }
  | { event: "done" }
  | { event: "aborted" }
  | { event: "error"; message: string };

// Methods are passed around as free functions — implementations must not depend on `this`.
export interface ConversationTurnStore {
  getSession(): Promise<{ id: string } | null>;
  createSession(title: string): Promise<{ id: string }>;
  listMessages(sessionId: string): Promise<ConversationMessageRow[]>;
  appendMessages(sessionId: string, messages: AgentMessage[]): Promise<void>;
}

export interface ConversationTurnGate {
  instruction: string;
  retryInstruction: string;
  failClosedMessage: string;
  answer(): string | null;
}

export interface ConversationTurnPlan {
  symbol: string;
  origin?: string;
  systemPrompt: string;
  tools: AgentTool[];
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  gate?: ConversationTurnGate;
}

export interface ConversationPreparedTurn {
  model: AiModel;
  store: ConversationTurnStore;
  buildTurn(sessionId: string): Promise<ConversationTurnPlan>;
  agentFactory?: AiAgentFactory;
  timeoutMs?: number;
  now?: () => number;
}

export type ConversationPrepareResult<TReason extends string> =
  | { ok: false; reason: TReason }
  | { ok: true; turn: ConversationPreparedTurn };

export type ConversationStartResult<TReason extends string> =
  | { started: false; reason: "busy" | TReason }
  | { started: true; done: Promise<void> };

export interface ConversationEngineConfig<TInput, TReason extends string> {
  layer: AiUsageLogContext["layer"];
  logLabels: { persistFailure: string; preTurnFailure: string };
  defaultTimeoutMs?: number;
  prepare(key: string, text: string, input: TInput): Promise<ConversationPrepareResult<TReason>>;
}

export interface ConversationEngine<TInput, TReason extends string> {
  onEvent(key: string, listener: (event: ConversationEvent) => void): () => void;
  turnState(key: string): { busy: boolean; partial: string };
  abort(key: string): boolean;
  run(key: string, text: string, input: TInput): Promise<ConversationStartResult<TReason>>;
}

interface TurnState {
  busy: boolean;
  partial: string;
  aborted: boolean;
  abort: (() => void) | null;
}

interface TranslatorCtx {
  emittedLen: number;
  settled: boolean;
  // On a gated turn the model's free text is suppressed until the gate has passed. Streaming it
  // live would defeat the gate entirely — the words are already on the user's screen by the time
  // a post-hoc check could reject them.
  buffered: boolean;
}

function translateEvent(
  event: AgentEvent,
  ctx: TranslatorCtx,
  toolLabels: Map<string, string>,
  state: TurnState,
  emit: (event: ConversationEvent) => void,
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
      input: stringifyPayload(event.args),
    });
    return;
  }
  if (event.type === "tool_execution_end") {
    emit({
      event: "tool",
      label: toolLabels.get(event.toolName) ?? event.toolName,
      status: "end",
      output: stringifyPayload(agentToolResultText(event.result)),
    });
  }
}

export function createConversationEngine<TInput, TReason extends string>(
  config: ConversationEngineConfig<TInput, TReason>,
): ConversationEngine<TInput, TReason> {
  const lock = createRunLock();
  const turnStates = new Map<string, TurnState>();
  const listeners = new Map<string, Set<(event: ConversationEvent) => void>>();

  function onEvent(key: string, listener: (event: ConversationEvent) => void): () => void {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = listeners.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) listeners.delete(key);
    };
  }

  function broadcast(key: string, event: ConversationEvent): void {
    const set = listeners.get(key);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        continue;
      }
    }
  }

  function turnState(key: string): { busy: boolean; partial: string } {
    const state = turnStates.get(key);
    return state ? { busy: state.busy, partial: state.partial } : { busy: false, partial: "" };
  }

  function abort(key: string): boolean {
    const state = turnStates.get(key);
    if (!state?.busy || !state.abort) return false;
    state.aborted = true;
    state.abort();
    return true;
  }

  async function executeTurn(key: string, text: string, turn: ConversationPreparedTurn, state: TurnState): Promise<void> {
    const timeoutMs = turn.timeoutMs ?? config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const nowFn = turn.now ?? Date.now;

      let session = await turn.store.getSession();
      if (!session) session = await turn.store.createSession(titleFromText(text));

      const history = await turn.store.listMessages(session.id);
      const historyPayloads = history.map((row) => row.payload);

      const userMessage: AgentMessage = { role: "user", content: text, timestamp: nowFn() };
      await turn.store.appendMessages(session.id, [userMessage]);

      const plan = await turn.buildTurn(session.id);
      const toolLabels = new Map(plan.tools.map((tool) => [tool.name, tool.label]));
      const translatorCtx: TranslatorCtx = { emittedLen: 0, settled: false, buffered: Boolean(plan.gate) };

      const agentSession = createAgentSession({
        layer: config.layer,
        symbol: plan.symbol,
        ...(plan.origin ? { origin: plan.origin } : {}),
        model: turn.model,
        systemPrompt: plan.systemPrompt,
        tools: plan.tools,
        messages: historyPayloads,
        transformContext: plan.transformContext,
        agentFactory: turn.agentFactory,
        onEvent: (event) => translateEvent(event, translatorCtx, toolLabels, state, (e) => broadcast(key, e)),
      });

      state.abort = () => agentSession.agent.abort();

      const settleAborted = async (): Promise<void> => {
        await persistFailureIncrement(
          turn.store.appendMessages,
          config.logLabels.persistFailure,
          session.id,
          agentSession.agent,
          history.length,
          state.partial,
          turn.model,
          nowFn(),
        );
        broadcast(key, { event: "aborted" });
      };

      try {
        await agentSession.runTurn(plan.gate ? `${text}\n\n${plan.gate.instruction}` : text, timeoutMs);

        // One explicit retry: a rejected submit only returns a tool result, so without an outer
        // nudge the model is free to give up and ship nothing.
        if (plan.gate && !plan.gate.answer() && !state.aborted && !agentSession.agent.state?.errorMessage) {
          await agentSession.runTurn(plan.gate.retryInstruction, timeoutMs);
        }

        translatorCtx.settled = true;
        if (state.aborted) {
          await settleAborted();
          return;
        }
        const increment = await persistIncrement(turn.store.appendMessages, session.id, agentSession.agent, history.length);
        const errorMessage = agentSession.agent.state?.errorMessage;

        if (plan.gate) {
          if (errorMessage) {
            broadcast(key, { event: "error", message: errorMessage });
            return;
          }
          const answer = plan.gate.answer();
          if (!answer) {
            // Fail closed. An unverified answer is worse than no answer.
            broadcast(key, { event: "error", message: plan.gate.failClosedMessage });
            return;
          }
          await turn.store.appendMessages(session.id, [synthesizePartialAssistantMessage(turn.model, answer, nowFn(), "stop")]);
          broadcast(key, { event: "delta", text: answer });
          broadcast(key, { event: "done" });
          return;
        }

        if (errorMessage || !hasAssistantText(increment)) {
          broadcast(key, { event: "error", message: errorMessage ?? "模型未产出回答" });
        } else {
          broadcast(key, { event: "done" });
        }
      } catch (err) {
        translatorCtx.settled = true;
        if (state.aborted) {
          await settleAborted();
          return;
        }
        await persistFailureIncrement(
          turn.store.appendMessages,
          config.logLabels.persistFailure,
          session.id,
          agentSession.agent,
          history.length,
          state.partial,
          turn.model,
          nowFn(),
        );
        const message =
          err instanceof AgentTimeoutError
            ? `回答超时（${timeoutMs}ms）`
            : err instanceof Error
              ? err.message
              : String(err);
        broadcast(key, { event: "error", message });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(config.logLabels.preTurnFailure, err);
      broadcast(key, { event: "error", message });
    }
  }

  async function run(key: string, text: string, input: TInput): Promise<ConversationStartResult<TReason>> {
    if (!lock.tryAcquire(key)) return { started: false, reason: "busy" };

    let prepared: ConversationPrepareResult<TReason>;
    try {
      prepared = await config.prepare(key, text, input);
    } catch (err) {
      lock.release(key);
      throw err;
    }
    if (!prepared.ok) {
      lock.release(key);
      return { started: false, reason: prepared.reason };
    }

    const state: TurnState = { busy: true, partial: "", aborted: false, abort: null };
    turnStates.set(key, state);

    const done = executeTurn(key, text, prepared.turn, state).finally(() => {
      lock.release(key);
      turnStates.delete(key);
    });

    return { started: true, done };
  }

  return { onEvent, turnState, abort, run };
}
