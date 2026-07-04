import type { CSSProperties } from "react";
import type { OutcomeStatus, SymbolAnalysisRow } from "../../../../shared/types";
import { formatMarketDateTime } from "../../../../shared/time";
import { fmt, signed } from "../../format";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "../../charts/intraday/directionLabels";

const OUTCOME_LABEL: Record<OutcomeStatus, string> = {
  hit_target: "✅ 到目标",
  hit_stop: "⛔ 到止损",
  open: "⏳ 进行中",
};

interface HistoryTabProps {
  rows: SymbolAnalysisRow[];
  currentId: string | null;
}

export function HistoryTab({ rows, currentId }: HistoryTabProps) {
  return (
    <>
      <div className="section-title">历史分析</div>
      {rows.map((row) => (
        <a
          key={row.id}
          className="zone-item"
          style={{ "--zc": DIRECTION_COLOR[row.direction ?? ""] ?? "#8b949e" } as CSSProperties}
          href={`#/charts/${encodeURIComponent(row.id)}`}
        >
          <div className="zone-head">
            <span className="zone-label plain">
              {formatMarketDateTime(row.created_at)}
              {row.id === currentId && <span className="p123-badge confirmed">当前</span>}
            </span>
            <span className="zone-range">{row.direction ? DIRECTION_LABEL[row.direction] : "—"}</span>
          </div>
          <div className="zone-meta md">
            {row.anchor ? `锚点 $${fmt(row.anchor.price)}` : "无锚点"}
            {" · "}
            {row.outcome ? OUTCOME_LABEL[row.outcome.status] : "—"}
            {row.outcome && ` · ${signed(row.outcome.pct_since_anchor)}%`}
          </div>
        </a>
      ))}
    </>
  );
}
