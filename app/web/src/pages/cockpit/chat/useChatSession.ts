import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../../api";
import { subscribeChannel } from "../../../wsHub";

export interface ChatSessionInfo {
  id: string;
  chartId: string;
  symbol: string;
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
}

export interface ChatLiveTool {
  id: string;
  label: string;
}

interface ChatEnvelope {
  session: ChatSessionInfo | null;
  messages: ChatRow[];
  busy: boolean;
  partial: string;
}

type ChatWsEvent =
  | { event: "delta"; text: string }
  | { event: "tool"; label: string; status: "start" | "end" }
  | { event: "done" }
  | { event: "error"; message: string };

type ChatWsEnvelope = { type: "init"; busy: boolean; partial: string } | { type: "event"; event: ChatWsEvent };

const isErrorBody = (value: unknown): value is { error: string; hint?: string } =>
  typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string";

async function fetchChat(chartId: string): Promise<ChatEnvelope> {
  const res = await fetch(`/api/charts/${encodeURIComponent(chartId)}/chat`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface ChatSendResult {
  ok: boolean;
  error?: string;
}

export interface ChatSessionState {
  session: ChatSessionInfo | null;
  rows: ChatRow[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  hint: string | null;
  loaded: boolean;
  send: (text: string) => Promise<ChatSendResult>;
}

export function useChatSession(chartId: string): ChatSessionState {
  const [session, setSession] = useState<ChatSessionInfo | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [liveTools, setLiveTools] = useState<ChatLiveTool[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const requestSeqRef = useRef(0);
  const toolSeqRef = useRef(0);
  const errorSeqRef = useRef(0);
  const sendPendingRef = useRef(false);

  const reload = useCallback(
    (markError?: string) => {
      const seq = ++requestSeqRef.current;
      fetchChat(chartId)
        .then((env) => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setSession(env.session);
          setRows(
            markError
              ? [...env.messages, { id: `error-${chartId}-${errorSeqRef.current++}`, ts: new Date().toISOString(), kind: "error", text: markError }]
              : env.messages,
          );
          setBusy(env.busy);
          setStreamText(env.busy ? env.partial : "");
          setLoaded(true);
        })
        .catch(() => {
          if (requestSeqRef.current !== seq || sendPendingRef.current) return;
          setLoaded(true);
          setHint("对话记录加载失败");
        });
    },
    [chartId],
  );

  useEffect(() => {
    sendPendingRef.current = false;
    setSession(null);
    setRows([]);
    setBusy(false);
    setStreamText("");
    setLiveTools([]);
    setHint(null);
    setLoaded(false);
    reload();
  }, [chartId, reload]);

  useEffect(() => {
    let connectedOnce = false;
    const off = subscribeChannel(
      { kind: "chat", id: chartId },
      (payload) => {
        const env = payload as ChatWsEnvelope;
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
            setLiveTools((prev) => [...prev, { id: `tool-${toolSeqRef.current++}`, label: evt.label }]);
          }
          return;
        }
        if (evt.event === "done") {
          setBusy(false);
          setStreamText("");
          setLiveTools([]);
          reload();
          return;
        }
        setBusy(false);
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
  }, [chartId, reload]);

  const send = useCallback(
    async (text: string): Promise<ChatSendResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "内容不能为空" };
      const optimisticId = `optimistic-${Date.now()}`;
      sendPendingRef.current = true;
      setHint(null);
      setBusy(true);
      setRows((prev) => [...prev, { id: optimisticId, ts: new Date().toISOString(), kind: "user", text: trimmed }]);
      try {
        const res = await fetch(`/api/charts/${encodeURIComponent(chartId)}/chat/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        if (res.status === 202) {
          sendPendingRef.current = false;
          return { ok: true };
        }
        let message = `HTTP ${res.status}`;
        try {
          const body: unknown = await res.json();
          if (isErrorBody(body)) message = body.hint ? `${body.error} (${body.hint})` : body.error;
        } catch {}
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
    [chartId],
  );

  return { session, rows, busy, streamText, liveTools, hint, loaded, send };
}
