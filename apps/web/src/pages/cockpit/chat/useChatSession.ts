import { client } from '@web/client';
import { subscribeChannel } from '@web/wsHub';
import {
  createConversationAdapters,
  useConversationSession,
  useResearchConversationSession,
  type ChatTransport,
} from './conversationSession.js';
import type { ChatSessionState, ResearchChatTransport } from './conversationSession.js';

export type {
  ChatLiveTool,
  ChatRow,
  ChatRowKind,
  ChatSendResult,
  ChatSessionInfo,
  ChatSessionState,
  ChatSubscribe,
  ChatTransport,
  ChatTransportClient,
  ChatUsage,
  ResearchChatTransport,
} from './conversationSession.js';
export { usageFromEnvelope } from './conversationSession.js';

const defaultTransport: ChatTransport = { client, subscribe: subscribeChannel };

export const conversationAdapters = createConversationAdapters(client);

export function useChatSession(chartId: string): ChatSessionState {
  return useConversationSession('chart', chartId, true, defaultTransport);
}

export function useResearchChatSession(
  path: string,
  enabled = true,
  transport?: ResearchChatTransport,
): ChatSessionState {
  return useResearchConversationSession(
    path,
    enabled,
    transport ?? { client: client.research, subscribe: subscribeChannel },
  );
}

export function useAssistantChatSession(sessionId: string): ChatSessionState {
  return useConversationSession('assistant', sessionId, true, defaultTransport);
}
