import type { SymbolAnalysisRow } from "../../../../shared/types";
import { formatMarketMonthDayTime } from "../../../../shared/time";
import { DIRECTION_LABEL } from "../../charts/intraday/directionLabels";

export function AnalysisTimeline({
  rows,
  activeId,
  mode,
  onSelect,
}: {
  rows: SymbolAnalysisRow[];
  activeId: string | null;
  mode: "latest" | "pinned";
  onSelect: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <select
      className="ai-date-select analysis-timeline-select"
      value={mode === "latest" ? "latest" : (activeId ?? "latest")}
      onChange={(e) => onSelect(e.target.value === "latest" ? null : e.target.value)}
    >
      <option value="latest">最新</option>
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {formatMarketMonthDayTime(row.created_at)}
          {row.direction ? ` · ${DIRECTION_LABEL[row.direction]}` : ""}
        </option>
      ))}
    </select>
  );
}
