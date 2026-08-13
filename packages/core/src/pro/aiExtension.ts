import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ProAiExtension, ProAiTranscriptMessage, ProAiTurnContext } from '@kansoku/pro-api';
import type { FsReadMount } from '../ai/agents/agentTools/fsMounts.js';
import { textOf } from '../ai/conversation/conversationShared.js';
import { BaseFirstUserContentProvider } from '../ai/conversation/messages/injectors/baseFirstUserContentProvider.js';
import {
  type MessagePipelineContext,
  type MessageProcessor,
} from '../ai/conversation/messages/messageEngine.js';

let activeExtension: ProAiExtension | null = null;

export function registerProAiExtension(extension: ProAiExtension): void {
  activeExtension = extension;
}

export function resetProAiExtensionForTests(): void {
  activeExtension = null;
}

class ProPromptContextProvider extends BaseFirstUserContentProvider {
  readonly id = 'ProPromptContextProvider';

  constructor(private readonly content: string) {
    super();
  }

  protected buildContent(_context: MessagePipelineContext): string {
    return this.content;
  }
}

export interface PreparedProAiTurn {
  readMounts: FsReadMount[];
  processors: MessageProcessor[];
  onTurnComplete?: (messages: readonly AgentMessage[]) => void;
}

function messageText(message: AgentMessage): string {
  if (message.role === 'user') {
    return typeof message.content === 'string'
      ? message.content
      : message.content.map(textOf).join('');
  }
  if (message.role === 'assistant') return message.content.map(textOf).join('');
  if (message.role === 'toolResult') return message.content.map(textOf).join('');
  return '';
}

export function normalizeProTranscript(
  messages: readonly AgentMessage[],
): ProAiTranscriptMessage[] {
  const normalized: ProAiTranscriptMessage[] = [];
  for (const message of messages) {
    const role =
      message.role === 'toolResult'
        ? 'tool'
        : message.role === 'user' || message.role === 'assistant'
          ? message.role
          : null;
    if (!role) continue;
    const text = messageText(message).trim();
    if (!text) continue;
    normalized.push({ role, text });
  }
  return normalized;
}

export async function prepareProAiTurn(context: ProAiTurnContext): Promise<PreparedProAiTurn> {
  const extension = activeExtension;
  if (!extension) return { readMounts: [], processors: [] };

  try {
    const prepared = await extension.prepareTurn(context);
    return {
      readMounts: prepared.readMounts?.map((mount) => ({ ...mount })) ?? [],
      processors: prepared.promptContext
        ? [new ProPromptContextProvider(prepared.promptContext)]
        : [],
      ...(extension.afterTurn
        ? {
            onTurnComplete: (messages: readonly AgentMessage[]) => {
              const normalized = normalizeProTranscript(messages);
              if (normalized.length === 0) return;
              void Promise.resolve(
                extension.afterTurn?.({ ...context, messages: normalized }),
              ).catch((error) => console.warn('pro AI extension: after-turn hook failed', error));
            },
          }
        : {}),
    };
  } catch (error) {
    console.warn('pro AI extension: turn preparation failed; continuing without extension', error);
    return { readMounts: [], processors: [] };
  }
}
