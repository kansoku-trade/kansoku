import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "@web/api";
import { client } from "@web/client";

export const bareSymbol = (value: string) => value.toUpperCase().replace(/\.US$/, "");

export interface DeepDiveStatus {
  running: boolean;
  symbol?: string;
  startedAt?: string;
  lastResult?: { symbol: string; ok: boolean; finishedAt: string; error?: string; dirtyWarning?: boolean };
}

const STATUS_POLL_MS = 10_000;

export function useDeepDive(symbol: string, onNoteReady: () => void) {
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [runningSymbol, setRunningSymbol] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const seenFinishedAtRef = useRef<string | null>(null);
  const [initialStatusChecked, setInitialStatusChecked] = useState(false);

  useEffect(() => {
    let active = true;
    client.symbols
      .deepDiveStatus({ sym: symbol })
      .then((status) => {
        if (!active) return;
        if (status.running) {
          setRunning(true);
          setRunningSymbol(status.symbol ?? null);
          setStartedAt(status.startedAt ?? null);
        }
        if (status.lastResult) seenFinishedAtRef.current = status.lastResult.finishedAt;
      })
      .catch(() => {})
      .finally(() => {
        if (active) setInitialStatusChecked(true);
      });
    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    if (!running) return;
    let active = true;

    const poll = async () => {
      try {
        const status = await client.symbols.deepDiveStatus({ sym: symbol });
        if (!active) return;
        if (status.running) {
          setRunning(true);
          setRunningSymbol(status.symbol ?? null);
          setStartedAt(status.startedAt ?? null);
          return;
        }
        setRunning(false);
        setRunningSymbol(null);
        setStartedAt(null);
        const result = status.lastResult;
        if (result && bareSymbol(result.symbol) === bareSymbol(symbol) && result.finishedAt !== seenFinishedAtRef.current) {
          seenFinishedAtRef.current = result.finishedAt;
          if (result.ok) {
            setSuccessNote(result.dirtyWarning ? "分析完成 ⚠️ 检测到笔记之外的改动" : "分析完成");
            onNoteReady();
          } else {
            setInlineMessage(result.error ?? "分析失败");
          }
        }
      } catch {
        if (!active) return;
      }
    };

    const timer = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [running, symbol, onNoteReady]);

  const start = useCallback(async () => {
    setInlineMessage(null);
    setSuccessNote(null);
    setPending(true);
    try {
      await client.symbols.deepDive({ sym: symbol });
      setRunning(true);
      setRunningSymbol(symbol);
      setStartedAt(new Date().toISOString());
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setInlineMessage("已有分析进行中");
      } else if (error instanceof ApiError && error.status === 503) {
        setDisabled(true);
        setInlineMessage("未配置深度研究模型，请在 /settings 配置");
      } else {
        setInlineMessage(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }, [symbol]);

  return {
    pending,
    running,
    runningSymbol,
    startedAt,
    disabled,
    inlineMessage,
    successNote,
    start,
    initialStatusChecked,
  };
}
