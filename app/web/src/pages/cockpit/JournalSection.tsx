import { useEffect, useState } from "react";
import { errorMessage } from "../../api";
import { client } from "../../client";
import { ErrorBox, Spinner } from "../../ui";
import { openMarkdownModal } from "./markdown";

export interface JournalEntryMeta {
  name: string;
  date: string;
}

export function JournalSection({
  symbol,
  entries,
  selected,
  onSelect,
}: {
  symbol: string;
  entries: JournalEntryMeta[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      {entries.length === 0 ? (
        <p className="note-block">还没有分析日志——跑一次 intraday-signal 会写入 journal/</p>
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
