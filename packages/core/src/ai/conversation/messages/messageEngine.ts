import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  type MessagePipelineContext as PublishedMessagePipelineContext,
  type MessageProcessor as PublishedMessageProcessor,
  type MessagesEngineResult as PublishedMessagesEngineResult,
  type SessionMessagesEngine,
} from '@innei/message-engine';
import { createPiMessageEngine } from '@innei/message-engine/adapters/pi';
import { AfterSystemPromptLanguageInjector } from './injectors/afterSystemPromptLanguageInjector.js';

export interface MessagePipelineMetadata {
  [key: string]: unknown;
  afterSystemPromptInjectionIndex?: number;
  firstUserInjectionIndex?: number;
}

type EmptyContext = Record<string, never>;
export type MessagePipelineContext = PublishedMessagePipelineContext<
  AgentMessage,
  EmptyContext,
  EmptyContext,
  EmptyContext,
  MessagePipelineMetadata
>;
export type MessageProcessor = PublishedMessageProcessor<
  AgentMessage,
  EmptyContext,
  EmptyContext,
  EmptyContext,
  MessagePipelineMetadata
>;
type PublishedEngine = SessionMessagesEngine<
  AgentMessage,
  EmptyContext,
  EmptyContext,
  EmptyContext,
  MessagePipelineMetadata
>;

export type MessagesEngineResult = PublishedMessagesEngineResult<
  AgentMessage,
  MessagePipelineMetadata
>;

let engineSequence = 0;

function createSessionId(): string {
  engineSequence += 1;
  return ['kansoku-message-engine', Date.now(), engineSequence].join('-');
}

/**
 * Builds an ephemeral provider-facing message view from the raw Agent transcript.
 * Processors must never mutate rawMessages: injected context is recomputed for
 * every provider request and is not persisted in Agent.state.messages.
 */
export class MessagesEngine {
  private readonly engine: PublishedEngine;
  readonly transformContext: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;

  constructor(processors: MessageProcessor[], sessionId: string = createSessionId()) {
    const pipeline = [new AfterSystemPromptLanguageInjector(), ...processors];

    this.engine = createPiMessageEngine<
      EmptyContext,
      EmptyContext,
      EmptyContext,
      MessagePipelineMetadata
    >({
      initial: {},
      modules: [
        {
          id: 'kansoku.context',
          processors: pipeline,
        },
      ],
      services: {},
      sessionId,
    });
    this.transformContext = async (messages, signal) =>
      (
        await this.engine.process(messages, {
          ...(signal ? { signal } : {}),
          step: {},
        })
      ).messages;
  }

  async process(messages: readonly AgentMessage[]): Promise<MessagesEngineResult> {
    return this.engine.process(messages, { step: {} });
  }

  destroy(): Promise<unknown> {
    return this.engine.destroy();
  }
}

// ponytail: LRU cap only, no idle sweep; add one if desktop sessions pile up past the cap
const SESSION_ENGINE_CAP = 32;
const sessionEngines = new Map<string, MessagesEngine>();

export function sessionMessagesEngine(
  sessionId: string,
  processors: () => MessageProcessor[],
): MessagesEngine {
  const existing = sessionEngines.get(sessionId);
  if (existing) {
    sessionEngines.delete(sessionId);
    sessionEngines.set(sessionId, existing);
    return existing;
  }
  const engine = new MessagesEngine(processors(), sessionId);
  sessionEngines.set(sessionId, engine);
  if (sessionEngines.size > SESSION_ENGINE_CAP) {
    const oldest = sessionEngines.keys().next().value;
    if (oldest !== undefined) disposeSessionMessagesEngine(oldest);
  }
  return engine;
}

export function disposeSessionMessagesEngine(sessionId: string): void {
  const engine = sessionEngines.get(sessionId);
  if (!engine) return;
  sessionEngines.delete(sessionId);
  void engine.destroy().catch(() => undefined);
}

export function resetSessionMessagesEnginesForTests(): void {
  for (const sessionId of [...sessionEngines.keys()]) disposeSessionMessagesEngine(sessionId);
}
