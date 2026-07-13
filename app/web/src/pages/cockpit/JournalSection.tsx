import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api";
import { client } from "../../client";
import { Button, ErrorBox, Spinner } from "../../ui";
import { openMarkdownModal } from "./markdown";
import { REASON_TEXT, useReassessSymbol } from "./useReassessSymbol";

const RUN_POLL_MS = 5_000;
const RUN_TIMEOUT_MS = 10 * 60_000;

export interface JournalEntryMeta {
  name: string;
  date: string;
}

export function JournalSection({
  symbol,
  entries,
  selected,
  onSelect,
  reloadJournal,
}: {
  symbol: string;
  entries: JournalEntryMeta[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  reloadJournal: () => void;
}) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { pending, reassess } = useReassessSymbol(symbol);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const baselineRef = useRef<Set<string>>(new Set());
  const startedAtRef = useRef(0);

  useEffect(() => {
    setRunning(false);
    setHint(null);
  }, [symbol]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reloadJournal, RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, reloadJournal]);

  useEffect(() => {
    if (!running) return;
    if (entries.some((e) => !baselineRef.current.has(e.name))) {
      setRunning(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setRunning(false);
      setHint("等待超时——分析可能失败了，稍后刷新页面看看");
    }, Math.max(0, RUN_TIMEOUT_MS - (Date.now() - startedAtRef.current)));
    return () => window.clearTimeout(timer);
  }, [running, entries]);

  const startRun = async () => {
    setHint(null);
    const result = await reassess();
    if (!result.ok) {
      if (!result.aborted) setHint(result.error);
      return;
    }
    if (result.data.started) {
      baselineRef.current = new Set(entries.map((e) => e.name));
      startedAtRef.current = Date.now();
      setRunning(true);
    } else {
      const reason = result.data.reason ?? "";
      setHint(REASON_TEXT[reason] ?? (reason || "未能启动分析"));
    }
  };

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoadingName(selected);
    setErr(null);
    client.symbols
      .journalEntry({ sym: symbol, name: selected })
      .then((data) => {
        if (!alive) return;
        setLoadingName(null);
        openMarkdownModal({
          title: data.name,
          markdown: data.markdown,
          onClose: () => onSelect(null),
        });
      })
      .catch((e) => {
        if (!alive) return;
        setLoadingName(null);
        setErr(errorMessage(e));
        onSelect(null);
      });
    return () => {
      alive = false;
    };
  }, [selected, symbol, onSelect]);

  return (
    <div className="journal-section">
      <div className="ai-reassess">
        <Button onClick={startRun} disabled={pending || running}>
          {running && <Spinner />}
          {running ? "分析中，写完日志会自动出现…" : "跑一次分析"}
        </Button>
        {hint && <span className="ai-hint">{hint}</span>}
      </div>
      {entries.length === 0 ? (
        <p className="note-block">还没有分析日志——点上面的按钮跑一次</p>
      ) : (
        <div className="journal-list">
          {entries.map((e) => {
            const busy = loadingName === e.name;
            return (
              <button
                key={e.name}
                className={`journal-entry${busy ? " loading" : ""}`}
                onClick={() => onSelect(e.name)}
                disabled={busy}
              >
                <span>{e.date}</span>
                <span className="journal-entry-name">{e.name}</span>
                {busy && <Spinner />}
              </button>
            );
          })}
        </div>
      )}
      {err && <ErrorBox>{err}</ErrorBox>}
    </div>
  );
}
