import type { CSSProperties } from "react";
import { Check, CircleX, Clock } from "lucide-react";
import type { OutcomeStatus, SymbolAnalysisRow } from "../../../../shared/types";
import { formatMarketDateTime } from "../../../../shared/time";
import { fmt, signed } from "../../format";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "../../charts/intraday/directionLabels";
import { theme } from "../../theme";
import { Badge, SectionTitle } from "../../ui";

const OUTCOME_LABEL: Record<OutcomeStatus, { icon: typeof Check; tone: string; label: string }> = {
  hit_target: { icon: Check, tone: "up", label: "到目标" },
  hit_stop: { icon: CircleX, tone: "down", label: "到止损" },
  open: { icon: Clock, tone: "", label: "进行中" },
};

function OutcomeText({ status }: { status: OutcomeStatus }) {
  const { icon: Icon, tone, label } = OUTCOME_LABEL[status];
  return (
    <span className={tone}>
      <Icon className="icon" size={13} /> {label}
    </span>
  );
}

interface HistoryTabProps {
  rows: SymbolAnalysisRow[];
  currentId: string | null;
}

export function HistoryTab({ rows, currentId }: HistoryTabProps) {
  return (
    <>
      <SectionTitle>历史分析</SectionTitle>
      {rows.map((row) => (
        <a
          key={row.id}
          className="zone-item"
          style={{ "--zc": DIRECTION_COLOR[row.direction ?? ""] ?? theme.textSecondary } as CSSProperties}
          href={`#/charts/${encodeURIComponent(row.id)}`}
        >
          <div className="zone-head">
            <span className="zone-label plain">
              {formatMarketDateTime(row.created_at)}
              {row.id === currentId && <Badge tone="up" className="p123-badge">当前</Badge>}
            </span>
            <span className="zone-range">{row.direction ? DIRECTION_LABEL[row.direction] : "—"}</span>
          </div>
          <div className="zone-meta md">
            {row.anchor ? `锚点 $${fmt(row.anchor.price)}` : "无锚点"}
            {" · "}
            {row.outcome ? <OutcomeText status={row.outcome.status} /> : "—"}
            {row.outcome && ` · ${signed(row.outcome.pct_since_anchor)}%`}
          </div>
        </a>
      ))}
    </>
  );
}
