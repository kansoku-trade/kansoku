import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { AfterSystemPromptLanguageInjector } from './injectors/afterSystemPromptLanguageInjector.js';

export interface MessagePipelineMetadata {
  [key: string]: unknown;
}

export interface MessagePipelineContext {
  readonly initialMessages: readonly AgentMessage[];
  messages: AgentMessage[];
  metadata: MessagePipelineMetadata;
  afterSystemPromptInjectionIndex?: number;
  firstUserInjectionIndex?: number;
}

export interface MessageProcessor {
  readonly name: string;
  process(
    context: MessagePipelineContext,
  ): Promise<MessagePipelineContext> | MessagePipelineContext;
}

export interface MessagesEngineResult {
  messages: AgentMessage[];
  metadata: MessagePipelineMetadata;
  stats: {
    processedCount: number;
    processorDurations: Record<string, number>;
    totalDuration: number;
  };
}

/**
 * Builds an ephemeral provider-facing message view from the raw Agent transcript.
 * Processors must never mutate initialMessages: injected context is recomputed for
 * every provider request and is not persisted in Agent.state.messages.
 */
export class MessagesEngine {
  constructor(private readonly processors: MessageProcessor[]) {}

  async process(messages: readonly AgentMessage[]): Promise<MessagesEngineResult> {
    const startedAt = Date.now();
    const processorDurations: Record<string, number> = {};
    let context: MessagePipelineContext = {
      initialMessages: messages,
      messages: [...messages],
      metadata: {},
    };

    const processors = [new AfterSystemPromptLanguageInjector(), ...this.processors];
    for (const processor of processors) {
      const processorStartedAt = Date.now();
      context = await processor.process(context);
      processorDurations[processor.name] = Date.now() - processorStartedAt;
    }

    return {
      messages: context.messages,
      metadata: context.metadata,
      stats: {
        processedCount: processors.length,
        processorDurations,
        totalDuration: Date.now() - startedAt,
      },
    };
  }
}
