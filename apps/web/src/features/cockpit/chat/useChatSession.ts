import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { client } from '@web/lib/client';
import {
  abortConversation,
  acquire,
  bindConversationAdapters,
  EMPTY_CONVERSATION,
  ensureSuggestions as requestSuggestions,
  getConversationSnapshot,
  lastUserRow,
  release,
  replaceLastConversation,
  retryLastConversation,
  sendConversation,
  subscribeConversation,
  usageFromEnvelope,
  type ChatSendResult,
  type ConversationAdapter,
  type ConversationKind,
} from './conversationStore.js';

export { lastUserRow, usageFromEnvelope };

export interface ChatSessionInfo {
  id: string;
  chartId?: string;
  symbol?: string;
  path?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

type ChatRowKind = 'user' | 'assistant' | 'tool' | 'error' | 'thinking';

export interface ChatRow {
  id: string;
  ts: string;
  kind: ChatRowKind;
  optimistic?: boolean;
  text?: string;
  label?: string;
  input?: string;
  output?: string;
  meta?: {
    provider: string;
    model: string;
    totalTokens: number;
    costTotal: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface ChatLiveTool {
  id: string;
  label: string;
  status: 'start' | 'end';
  input?: string;
  output?: string;
}

export type ChatLiveBeat =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; tool: ChatLiveTool };

export interface ChatUsage {
  totalTokens: number;
  costTotal: number;
  calls: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

interface ChatEnvelope {
  session: ChatSessionInfo | null;
  messages: ChatRow[];
  busy: boolean;
  partial: string;
  usage?: ChatUsage;
}

export function postMessageInput(
  text: string,
  options?: { replaceLast?: boolean },
): { text: string; replaceLast?: boolean } {
  return options?.replaceLast ? { text, replaceLast: true } : { text };
}

export const conversationAdapters: Record<ConversationKind, ConversationAdapter> = {
  chart: {
    fetchChat: async (id) => (await client.chat.get({ id })) as unknown as ChatEnvelope,
    send: (id, text, options) =>
      client.chat.postMessage({ id, ...postMessageInput(text, options) }),
    abort: (id) => client.chat.abort({ id }),
    channel: (id) => ({ kind: 'chat', id }),
    suggest: (id) => client.chat.suggestions({ id }),
  },
  research: {
    fetchChat: async (id) =>
      (await client.research.getChat({ path: id })) as unknown as ChatEnvelope,
    send: (id, text, options) =>
      client.research.postMessage({ path: id, ...postMessageInput(text, options) }),
    abort: (id) => client.research.abortChat({ path: id }),
    channel: (id) => ({ kind: 'research-chat', path: id }),
    suggest: (id) => client.research.suggestions({ path: id }),
  },
  assistant: {
    fetchChat: async (id) => (await client.assistant.getChat({ id })) as unknown as ChatEnvelope,
    send: (id, text, options) =>
      client.assistant.postMessage({ id, ...postMessageInput(text, options) }),
    abort: (id) => client.assistant.abortChat({ id }),
    channel: (id) => ({ kind: 'assistant-chat', id }),
    suggest: null,
  },
};

bindConversationAdapters(conversationAdapters);

export interface ChatSessionState {
  session: ChatSessionInfo | null;
  rows: ChatRow[];
  busy: boolean;
  aborting: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  liveBeats: ChatLiveBeat[];
  hint: string | null;
  loaded: boolean;
  suggestions: string[];
  usage: ChatUsage | null;
  send: (text: string, options?: { replaceLast?: boolean }) => Promise<ChatSendResult>;
  retryLast: () => Promise<ChatSendResult>;
  replaceLast: (text: string) => Promise<ChatSendResult>;
  abort: () => Promise<void>;
  ensureSuggestions: () => void;
}

const NOOP_SUBSCRIBE = () => () => {};

function useConversationSession(
  kind: ConversationKind,
  id: string,
  enabled = true,
): ChatSessionState {
  useEffect(() => {
    if (!enabled) return;
    acquire(kind, id);
    return () => release(kind, id);
  }, [kind, id, enabled]);

  const snapshot = useSyncExternalStore(
    enabled ? (listener) => subscribeConversation(kind, id, listener) : NOOP_SUBSCRIBE,
    () => (enabled ? getConversationSnapshot(kind, id) : null) ?? EMPTY_CONVERSATION,
  );

  const send = useCallback(
    (text: string, options?: { replaceLast?: boolean }) =>
      sendConversation(kind, id, text, options),
    [kind, id],
  );
  const retryLast = useCallback(() => retryLastConversation(kind, id), [kind, id]);
  const replaceLast = useCallback(
    (text: string) => replaceLastConversation(kind, id, text),
    [kind, id],
  );
  const abort = useCallback(() => abortConversation(kind, id), [kind, id]);
  const ensureSuggestions = useCallback(() => requestSuggestions(kind, id), [kind, id]);

  return {
    ...snapshot,
    send,
    retryLast,
    replaceLast,
    abort,
    ensureSuggestions,
  };
}

export function useChatSession(chartId: string): ChatSessionState {
  return useConversationSession('chart', chartId);
}

export function useResearchChatSession(path: string, enabled = true): ChatSessionState {
  return useConversationSession('research', path, enabled);
}

export function useAssistantChatSession(sessionId: string): ChatSessionState {
  return useConversationSession('assistant', sessionId);
}
