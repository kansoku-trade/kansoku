import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../api";
import { client } from "../../../client";
import { subscribeChannel } from "../../../wsHub";

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
}

export interface ChatLiveTool {
  id: string;
  label: string;
  status: "start" | "end";
  input?: string;
  output?: string;
}

interface ChatEnvelope {
  session: ChatSessionInfo | null;
  messages: ChatRow[];
  busy: boolean;
  partial: string;
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

type ConversationKind = "chart" | "research";

async function fetchChat(kind: ConversationKind, id: string): Promise<ChatEnvelope> {
  const state = kind === "chart" ? await client.chat.get({ id }) : await client.research.getChat({ path: id });
  return state as unknown as ChatEnvelope;
}

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
  send: (text: string) => Promise<ChatSendResult>;
  abort: () => Promise<void>;
  ensureSuggestions: () => void;
}

function useConversationSession(kind: ConversationKind, id: string): ChatSessionState {
  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [liveTools, setLiveTools] = useState<ChatLiveTool[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const requestSeqRef = useRef(0);
  const toolSeqRef = useRef(0);
  const errorSeqRef = useRef(0);
  const sendPendingRef = useRef(false);
  const suggestionsRequestedRef = useRef(false);

  const reload = useCallback(
    (markError?: string) => {
      const seq = ++requestSeqRef.current;
      fetchChat(kind, id)
        .then((env) => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setSession(env.session);
          setRows(
            markError
              ? [...env.messages, { id: `error-${id}-${errorSeqRef.current++}`, ts: new Date().toISOString(), kind: "error", text: markError }]
              : env.messages,
          );
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : "");
          setLoaded(true);
          setHint((prev) => (prev === "对话记录加载失败" ? null : prev));
        })
        .catch(() => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setLoaded(true);
          setHint("对话记录加载失败");
        });
    },
    [id, kind],
  );

  useEffect(() => {
    sendPendingRef.current = false;
    suggestionsRequestedRef.current = false;
    setSession(null);
    setRows([]);
    setBusy(false);
    setAborting(false);
    setStreamText("");
    setLiveTools([]);
    setHint(null);
    setLoaded(false);
    setSuggestions([]);
    reload();
  }, [id, reload]);

  useEffect(() => {
    let connectedOnce = false;
    const off = subscribeChannel(
      kind === "chart" ? { kind: "chat", id } : { kind: "research-chat", path: id },
      (payload) => {
        const env = payload as ChatWsEnvelope;
        if (env.type !== "init" && env.type !== "event") return;
        if (env.type === "init") {
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : "");
          if (!env.busy) setLiveTools([]);
          return;
        }
        const evt = env.event;
        if (evt.event === "delta") {
          setBusy(true);
          setStreamText((prev) => prev + evt.text);
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
        if (evt.event === "done" || evt.event === "aborted") {
          setBusy(false);
          setAborting(false);
          setStreamText("");
          setLiveTools([]);
          reload();
          return;
        }
        setBusy(false);
        setAborting(false);
        setStreamText("");
        setLiveTools([]);
        reload(evt.message);
      },
      (connected) => {
        if (!connected) return;
        if (connectedOnce) reload();
        connectedOnce = true;
      },
    );
    return off;
  }, [id, kind, reload]);

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
        const result =
          kind === "chart"
            ? await client.chat.postMessage({ id, text: trimmed })
            : await client.research.postMessage({ path: id, text: trimmed });
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
    [id, kind],
  );

  const abort = useCallback(async (): Promise<void> => {
    setAborting(true);
    try {
      if (kind === "chart") await client.chat.abort({ id });
      else await client.research.abortChat({ path: id });
    } catch {
      setAborting(false);
    }
  }, [id, kind]);

  const ensureSuggestions = useCallback(() => {
    if (suggestionsRequestedRef.current) return;
    suggestionsRequestedRef.current = true;
    const seq = requestSeqRef.current;
    const request = kind === "chart" ? client.chat.suggestions({ id }) : client.research.suggestions({ path: id });
    request
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        setSuggestions(res.suggestions);
      })
      .catch(() => {
        setSuggestions([]);
      });
  }, [id, kind]);

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
    send,
    abort,
    ensureSuggestions,
  };
}

export function useChatSession(chartId: string): ChatSessionState {
  return useConversationSession("chart", chartId);
}

export function useResearchChatSession(path: string): ChatSessionState {
  return useConversationSession("research", path);
}
