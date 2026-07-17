import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../api";
import { client } from "../../../client";
import { subscribeChannel } from "../../../wsHub";
import { useSmoothStream } from "./useSmoothStream.js";

export interface ChatSessionInfo {
  id: string;
  chartId?: string;
  symbol?: string;
  path?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatRowKind = "user" | "assistant" | "tool" | "error";

export interface ChatRow {
  id: string;
  ts: string;
  kind: ChatRowKind;
  text?: string;
  label?: string;
  input?: string;
  output?: string;
  meta?: {
    provider: string;
    model: string;
    totalTokens: number;
    costTotal: number;
  };
}

export interface ChatLiveTool {
  id: string;
  label: string;
  status: "start" | "end";
  input?: string;
  output?: string;
}

export interface ChatUsage {
  totalTokens: number;
  costTotal: number;
  calls: number;
}

interface ChatEnvelope {
  session: ChatSessionInfo | null;
  messages: ChatRow[];
  busy: boolean;
  partial: string;
  usage?: ChatUsage;
}

type ChatWsEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end"; input?: string; output?: string }
  | { event: "done" }
  | { event: "aborted" }
  | { event: "error"; message: string };

type ChatWsEnvelope = { type: "init"; busy: boolean; partial: string } | { type: "event"; event: ChatWsEvent };

const isErrorBody = (value: unknown): value is { error: string; hint?: string } =>
  typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string";

export const usageFromEnvelope = (env: { usage?: ChatUsage }): ChatUsage | null => env.usage ?? null;

type ConversationKind = "chart" | "research" | "assistant";

interface ConversationAdapter {
  fetchChat: (id: string) => Promise<ChatEnvelope>;
  send: (id: string, text: string) => Promise<{ status: number; body: unknown }>;
  abort: (id: string) => Promise<unknown>;
  channel: (id: string) => Parameters<typeof subscribeChannel>[0];
  suggest: ((id: string) => Promise<{ suggestions: string[] }>) | null;
}

export const conversationAdapters: Record<ConversationKind, ConversationAdapter> = {
  chart: {
    fetchChat: async (id) => (await client.chat.get({ id })) as unknown as ChatEnvelope,
    send: (id, text) => client.chat.postMessage({ id, text }),
    abort: (id) => client.chat.abort({ id }),
    channel: (id) => ({ kind: "chat", id }),
    suggest: (id) => client.chat.suggestions({ id }),
  },
  research: {
    fetchChat: async (id) => (await client.research.getChat({ path: id })) as unknown as ChatEnvelope,
    send: (id, text) => client.research.postMessage({ path: id, text }),
    abort: (id) => client.research.abortChat({ path: id }),
    channel: (id) => ({ kind: "research-chat", path: id }),
    suggest: (id) => client.research.suggestions({ path: id }),
  },
  assistant: {
    fetchChat: async (id) => (await client.assistant.getChat({ id })) as unknown as ChatEnvelope,
    send: (id, text) => client.assistant.postMessage({ id, text }),
    abort: (id) => client.assistant.abortChat({ id }),
    channel: (id) => ({ kind: "assistant-chat", id }),
    suggest: null,
  },
};

export interface ChatSendResult {
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
  hint: string | null;
  loaded: boolean;
  suggestions: string[];
  usage: ChatUsage | null;
  send: (text: string) => Promise<ChatSendResult>;
  abort: () => Promise<void>;
  ensureSuggestions: () => void;
}

function useConversationSession(kind: ConversationKind, id: string, enabled = true): ChatSessionState {
  const adapter = conversationAdapters[kind];
  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [aborting, setAborting] = useState(false);
  const { text: streamText, push: streamPush, flush: streamFlush, finish: streamFinish, reset: streamReset } = useSmoothStream();
  const [liveTools, setLiveTools] = useState<ChatLiveTool[]>([]);
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
              ? [...env.messages, { id: `error-${id}-${errorSeqRef.current++}`, ts: new Date().toISOString(), kind: "error", text: markError }]
              : env.messages,
          );
          setBusy(env.busy);
          if (env.busy) streamFlush(env.partial);
          else streamReset();
          setUsage(usageFromEnvelope(env));
          setLoaded(true);
          setHint((prev) => (prev === "对话记录加载失败" ? null : prev));
          after?.();
        })
        .catch(() => {
          after?.();
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setLoaded(true);
          setHint("对话记录加载失败");
        });
    },
    [adapter, id, streamFlush, streamReset],
  );

  useEffect(() => {
    if (!enabled) return;
    sendPendingRef.current = false;
    suggestionsRequestedRef.current = false;
    setSession(null);
    setRows([]);
    setBusy(false);
    setAborting(false);
    streamReset();
    setLiveTools([]);
    setHint(null);
    setLoaded(false);
    setSuggestions([]);
    setUsage(null);
    reload();
  }, [id, enabled, reload, streamReset]);

  useEffect(() => {
    if (!enabled) return;
    let connectedOnce = false;
    const off = subscribeChannel(
      adapter.channel(id),
      (payload) => {
        const env = payload as ChatWsEnvelope;
        if (env.type !== "init" && env.type !== "event") return;
        if (env.type === "init") {
          setBusy(env.busy);
          if (env.busy) streamFlush(env.partial);
          else {
            streamReset();
            setLiveTools([]);
          }
          return;
        }
        const evt = env.event;
        if (evt.event === "delta") {
          setBusy(true);
          streamPush(evt.text);
          return;
        }
        if (evt.event === "tool") {
          if (evt.status === "start") {
            setLiveTools((prev) => [
              ...prev,
              { id: `tool-${toolSeqRef.current++}`, label: evt.label, status: "start", input: evt.input },
            ]);
            return;
          }
          setLiveTools((prev) => {
            const idx = prev.map((t) => t.label === evt.label && t.status === "start").lastIndexOf(true);
            if (idx === -1) return prev;
            return prev.map((t, i) => (i === idx ? { ...t, status: "end", output: evt.output } : t));
          });
          return;
        }
        if (evt.event === "aborted") {
          streamFlush();
          setBusy(false);
          setAborting(false);
          reload(undefined, () => {
            setLiveTools([]);
            streamReset();
          });
          return;
        }
        const markError = evt.event === "done" ? undefined : evt.message;
        streamFinish(() => {
          setAborting(false);
          reload(markError, () => {
            setBusy(false);
            setLiveTools([]);
            streamReset();
          });
        });
      },
      (connected) => {
        if (!connected) return;
        if (connectedOnce) reload();
        connectedOnce = true;
      },
    );
    return off;
  }, [adapter, id, enabled, reload, streamFlush, streamFinish, streamPush, streamReset]);

  const send = useCallback(
    async (text: string): Promise<ChatSendResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "内容不能为空" };
      const optimisticId = `optimistic-${Date.now()}`;
      sendPendingRef.current = true;
      setHint(null);
      setBusy(true);
      setSuggestions([]);
      setRows((prev) => [...prev, { id: optimisticId, ts: new Date().toISOString(), kind: "user", text: trimmed }]);
      try {
        const result = await adapter.send(id, trimmed);
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
        setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      } catch (err) {
        const message = errorMessage(err);
        setBusy(false);
        setHint(message);
        setRows((prev) => prev.filter((row) => row.id !== optimisticId));
        sendPendingRef.current = false;
        return { ok: false, error: message };
      }
    },
    [adapter, id],
  );

  const abort = useCallback(async (): Promise<void> => {
    setAborting(true);
    try {
      await adapter.abort(id);
    } catch {
      setAborting(false);
    }
  }, [adapter, id]);

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
    hint,
    loaded,
    suggestions,
    usage,
    send,
    abort,
    ensureSuggestions,
  };
}

export function useChatSession(chartId: string): ChatSessionState {
  return useConversationSession("chart", chartId);
}

export function useResearchChatSession(path: string, enabled = true): ChatSessionState {
  return useConversationSession("research", path, enabled);
}

export function useAssistantChatSession(sessionId: string): ChatSessionState {
  return useConversationSession("assistant", sessionId);
}
