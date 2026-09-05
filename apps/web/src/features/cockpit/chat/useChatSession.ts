import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { trackFeatureUsed } from '@web/lib/analytics';
import { subscribeChannel } from '@web/lib/ws/wsHub';
import { applyLiveBeat } from './liveBeats.js';

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

type ChatWsEvent =
  | { event: 'delta'; text: string }
  | { event: 'reasoning'; text: string }
  | { event: 'tool'; label: string; status: 'start' | 'end'; input?: string; output?: string }
  | { event: 'title'; title: string }
  | { event: 'done' }
  | { event: 'aborted' }
  | { event: 'error'; message: string };

type ChatWsEnvelope =
  { type: 'init'; busy: boolean; partial: string } | { type: 'event'; event: ChatWsEvent };

const STREAM_SETTLE_MS = 800;

const isErrorBody = (value: unknown): value is { error: string; hint?: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { error?: unknown }).error === 'string';

export const usageFromEnvelope = (env: { usage?: ChatUsage }): ChatUsage | null =>
  env.usage ?? null;

export function lastUserRow(rows: readonly ChatRow[]): ChatRow | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.kind === 'user' && row.text?.trim()) return row;
  }
  return undefined;
}

export function postMessageInput(
  text: string,
  options?: { replaceLast?: boolean },
): { text: string; replaceLast?: boolean } {
  return options?.replaceLast ? { text, replaceLast: true } : { text };
}

type ConversationKind = 'chart' | 'research' | 'assistant';

interface ConversationAdapter {
  fetchChat: (id: string) => Promise<ChatEnvelope>;
  send: (
    id: string,
    text: string,
    options?: { replaceLast?: boolean },
  ) => Promise<{ status: number; body: unknown }>;
  abort: (id: string) => Promise<unknown>;
  channel: (id: string) => Parameters<typeof subscribeChannel>[0];
  suggest: ((id: string) => Promise<{ suggestions: string[] }>) | null;
}

export const conversationAdapters: Record<ConversationKind, ConversationAdapter> = {
  chart: {
    fetchChat: async (id) => (await client.chat.get({ id })) as unknown as ChatEnvelope,
    send: (id, text, options) => client.chat.postMessage({ id, ...postMessageInput(text, options) }),
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

interface ChatSendResult {
  ok: boolean;
  error?: string;
}

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

function useConversationSession(
  kind: ConversationKind,
  id: string,
  enabled = true,
): ChatSessionState {
  const adapter = conversationAdapters[kind];
  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [liveBeats, setLiveBeats] = useState<ChatLiveBeat[]>([]);
  const liveTools = useMemo(
    () =>
      liveBeats
        .filter((beat): beat is { kind: 'tool'; tool: ChatLiveTool } => beat.kind === 'tool')
        .map((beat) => beat.tool),
    [liveBeats],
  );
  const [hint, setHint] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const requestSeqRef = useRef(0);
  const toolSeqRef = useRef(0);
  const errorSeqRef = useRef(0);
  const sendPendingRef = useRef(false);
  const suggestionsRequestedRef = useRef(false);

  const reload = useCallback(
    (markError?: string, after?: () => void) => {
      const seq = ++requestSeqRef.current;
      adapter
        .fetchChat(id)
        .then((env) => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) {
            after?.();
            return;
          }
          setSession(env.session);
          setRows(
            markError
              ? [
                  ...env.messages,
                  {
                    id: `error-${id}-${errorSeqRef.current++}`,
                    ts: new Date().toISOString(),
                    kind: 'error',
                    text: markError,
                  },
                ]
              : env.messages,
          );
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : '');
          setUsage(usageFromEnvelope(env));
          setLoaded(true);
          setHint((prev) => (prev === '对话记录加载失败' ? null : prev));
          after?.();
        })
        .catch(() => {
          after?.();
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setLoaded(true);
          setHint('对话记录加载失败');
        });
    },
    [adapter, id],
  );

  useEffect(() => {
    if (!enabled) return;
    sendPendingRef.current = false;
    suggestionsRequestedRef.current = false;
    setSession(null);
    setRows([]);
    setBusy(false);
    setAborting(false);
    setStreamText('');
    setLiveBeats([]);
    setHint(null);
    setLoaded(false);
    setSuggestions([]);
    setUsage(null);
    reload();
  }, [id, enabled, reload]);

  useEffect(() => {
    if (!enabled) return;
    let connectedOnce = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeChannel(
      adapter.channel(id),
      (payload) => {
        const env = payload as ChatWsEnvelope;
        if (env.type !== 'init' && env.type !== 'event') return;
        if (env.type === 'init') {
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : '');
          setLiveBeats(env.busy && env.partial ? [{ kind: 'text', text: env.partial }] : []);
          return;
        }
        const evt = env.event;
        if (evt.event === 'delta') {
          setBusy(true);
          setStreamText((prev) => prev + evt.text);
          setLiveBeats((prev) => applyLiveBeat(prev, evt, `tool-${toolSeqRef.current}`));
          return;
        }
        if (evt.event === 'reasoning') {
          setBusy(true);
          setLiveBeats((prev) => applyLiveBeat(prev, evt, `tool-${toolSeqRef.current}`));
          return;
        }
        if (evt.event === 'tool') {
          if (evt.status === 'start') {
            setStreamText('');
            const toolId = `tool-${toolSeqRef.current++}`;
            setLiveBeats((prev) => applyLiveBeat(prev, evt, toolId));
            return;
          }
          setLiveBeats((prev) => applyLiveBeat(prev, evt, `tool-${toolSeqRef.current}`));
          return;
        }
        if (evt.event === 'title') {
          setSession((prev) => (prev ? { ...prev, title: evt.title } : prev));
          return;
        }
        if (evt.event === 'aborted') {
          setBusy(false);
          setAborting(false);
          reload(undefined, () => {
            setLiveBeats([]);
            setStreamText('');
          });
          return;
        }
        const markError = evt.event === 'done' ? undefined : evt.message;
        // Streamdown keeps revealing after the last delta; swapping to the static
        // renderer before it settles snaps the tail in and cuts the fade.
        settleTimer = setTimeout(() => {
          settleTimer = null;
          setAborting(false);
          suggestionsRequestedRef.current = false;
          reload(markError, () => {
            setBusy(false);
            setLiveBeats([]);
            setStreamText('');
          });
        }, STREAM_SETTLE_MS);
      },
      (connected) => {
        if (!connected) return;
        if (connectedOnce) reload();
        connectedOnce = true;
      },
    );
    return () => {
      off();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [adapter, id, enabled, reload]);

  const send = useCallback(
    async (text: string, options?: { replaceLast?: boolean }): Promise<ChatSendResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: '内容不能为空' };
      const optimisticId = `optimistic-${Date.now()}`;
      const replaceLast = options?.replaceLast === true;
      // Counted on intent, not on delivery: a message the backend then refuses is still the
      // trader having reached for the assistant, which is what the feature column measures.
      trackFeatureUsed('ai_chat', { surface: kind });
      sendPendingRef.current = true;
      setHint(null);
      setBusy(true);
      setLiveBeats([]);
      setSuggestions([]);
      setRows((prev) => {
        if (!replaceLast) {
          return [
            ...prev,
            {
              id: optimisticId,
              ts: new Date().toISOString(),
              kind: 'user',
              text: trimmed,
              optimistic: true,
            },
          ];
        }
        const last = lastUserRow(prev);
        if (!last) return prev;
        const lastIndex = prev.lastIndexOf(last);
        const kept = prev.slice(0, lastIndex + 1);
        if (last.text === trimmed) return kept;
        return [...kept.slice(0, lastIndex), { ...last, text: trimmed }];
      });
      try {
        const result = await adapter.send(id, trimmed, options);
        if (result.status === 202) {
          sendPendingRef.current = false;
          return { ok: true };
        }
        const message = isErrorBody(result.body)
          ? result.body.hint
            ? `${result.body.error} (${result.body.hint})`
            : result.body.error
          : `HTTP ${result.status}`;
        setBusy(false);
        setHint(message);
        if (replaceLast) reload(message);
        else setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      } catch (err) {
        const message = errorMessage(err);
        setBusy(false);
        setHint(message);
        if (replaceLast) reload(message);
        else setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      }
    },
    [adapter, id, kind, reload],
  );

  const abort = useCallback(async (): Promise<void> => {
    setAborting(true);
    try {
      await adapter.abort(id);
    } catch {
      setAborting(false);
    }
  }, [adapter, id]);

  const retryLast = useCallback((): Promise<ChatSendResult> => {
    const lastUser = lastUserRow(rows);
    if (!lastUser?.text) return Promise.resolve({ ok: false, error: '没有可重试的问题' });
    return send(lastUser.text, { replaceLast: true });
  }, [rows, send]);

  const replaceLast = useCallback(
    (text: string): Promise<ChatSendResult> => send(text, { replaceLast: true }),
    [send],
  );

  const ensureSuggestions = useCallback(() => {
    if (suggestionsRequestedRef.current) return;
    suggestionsRequestedRef.current = true;
    if (!adapter.suggest) return;
    const seq = requestSeqRef.current;
    adapter
      .suggest(id)
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        setSuggestions(res.suggestions);
      })
      .catch(() => {
        setSuggestions([]);
      });
  }, [adapter, id]);

  return {
    session,
    rows,
    busy,
    aborting,
    streamText,
    liveTools,
    liveBeats,
    hint,
    loaded,
    suggestions,
    usage,
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
