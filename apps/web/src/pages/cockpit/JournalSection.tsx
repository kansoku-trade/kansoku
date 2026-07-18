import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@web/api";
import { client } from "@web/client";
import { Button, ErrorBox, Spinner } from "@web/ui";
import { AnalysisRunDetails } from "./AnalysisRunDetails";
import { openMarkdownModal } from "./markdown";
import { useAnalystRun } from "./useAnalystRun";

const RUN_POLL_MS = 5_000;

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
  const run = useAnalystRun(symbol);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    if (!run.running) return;
    const timer = window.setInterval(reloadJournal, RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [run.running, reloadJournal]);

  useEffect(() => {
    if (wasRunningRef.current && !run.running) reloadJournal();
    wasRunningRef.current = run.running;
  }, [run.running, reloadJournal]);

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
          documentPath: `journal/${data.name}`,
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
      <div className="ai-run-control">
        <div className="ai-reassess">
          <Button onClick={run.start} disabled={run.pending || run.running}>
            {run.running && <Spinner />}
            {run.running ? "分析进行中…" : "跑一次分析"}
          </Button>
          {run.hint && <span className="ai-hint">{run.hint}</span>}
        </div>
        {run.status && <AnalysisRunDetails status={run.status} />}
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
