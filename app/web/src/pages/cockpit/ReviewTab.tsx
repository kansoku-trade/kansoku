import type { SymbolAnalysisRow } from "../../../../shared/types";
import { HistoryTab } from "./HistoryTab";
import { JournalSection, type JournalEntryMeta } from "./JournalSection";
import { NoteTab } from "./NoteTab";

export type ReviewSection = "history" | "journal" | "note";

const SECTIONS: { key: ReviewSection; label: string }[] = [
  { key: "history", label: "历史" },
  { key: "journal", label: "日志" },
  { key: "note", label: "笔记" },
];

export function ReviewTab({
  symbol,
  rows,
  currentId,
  journal,
  section,
  onSectionChange,
  selectedJournal,
  onSelectJournal,
  reloadJournal,
}: {
  symbol: string;
  rows: SymbolAnalysisRow[];
  currentId: string | null;
  journal: JournalEntryMeta[];
  section: ReviewSection;
  onSectionChange: (section: ReviewSection) => void;
  selectedJournal: string | null;
  onSelectJournal: (name: string | null) => void;
  reloadJournal: () => void;
}) {
  const journalByDate = new Map(journal.map((e) => [e.date, e.name] as [string, string]));
  const openJournal = (name: string) => {
    onSelectJournal(name);
    onSectionChange("journal");
  };

  return (
    <div className="review-tab">
      <div className="review-switch">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`review-switch-item${section === s.key ? " active" : ""}`}
            onClick={() => onSectionChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "history" &&
        (rows.length === 0 ? (
          <p className="note-block">还没有历史分析</p>
        ) : (
          <HistoryTab
            symbol={symbol}
            rows={rows}
            currentId={currentId}
            journalByDate={journalByDate}
            onOpenJournal={openJournal}
          />
        ))}
      {section === "journal" && (
        <JournalSection
          symbol={symbol}
          entries={journal}
          selected={selectedJournal}
          onSelect={onSelectJournal}
          reloadJournal={reloadJournal}
        />
      )}
      {section === "note" && <NoteTab symbol={symbol} />}
    </div>
  );
}
