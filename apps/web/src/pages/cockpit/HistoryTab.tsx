import type { CSSProperties } from "react";
import { Check, CircleX, Clock, NotebookText } from "lucide-react";
import type { OutcomeStatus, SymbolAnalysisRow } from "@kansoku/shared/types";
import { marketDate } from "@kansoku/shared/time";
import { fmt, signed } from "@web/format";
import { marketOfSymbol } from "@web/lib/market";
import { symbolUrl } from "./analysisMode";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "@web/charts/intraday/directionLabels";
import { theme } from "@web/theme";
import { Badge, MarketTime, SectionTitle } from "@web/ui";

const OUTCOME_LABEL: Record<OutcomeStatus, { icon: typeof Check; tone: string; label: string }> = {
  hit_target: { icon: Check, tone: "up", label: "到目标" },
  hit_stop: { icon: CircleX, tone: "down", label: "到止损" },
  held_range: { icon: Check, tone: "up", label: "守住区间" },
  broke_range: { icon: CircleX, tone: "down", label: "破区间" },
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
  symbol: string;
  rows: SymbolAnalysisRow[];
  currentId: string | null;
  journalByDate?: Map<string, string>;
  onOpenJournal?: (name: string) => void;
}

export function HistoryTab({ symbol, rows, currentId, journalByDate, onOpenJournal }: HistoryTabProps) {
  const market = marketOfSymbol(symbol);
  const journalFor = (row: SymbolAnalysisRow): string | undefined =>
    journalByDate?.get(marketDate(row.created_at));
  return (
    <>
      <SectionTitle>历史分析</SectionTitle>
      {rows.map((row) => (
        <a
          key={row.id}
          className="zone-item"
          style={{ "--zc": DIRECTION_COLOR[row.direction ?? ""] ?? theme.textSecondary } as CSSProperties}
          href={symbolUrl(symbol, row.id)}
        >
          <div className="zone-head">
            <span className="zone-label plain">
              <MarketTime value={row.created_at} market={market} />
              {row.id === currentId && <Badge tone="up" className="p123-badge">当前</Badge>}
            </span>
            <span className="zone-range">{row.direction ? DIRECTION_LABEL[row.direction] : "—"}</span>
          </div>
          <div className="zone-meta md">
            {row.anchor ? `锚点 $${fmt(row.anchor.price)}` : "无锚点"}
            {" · "}
            {row.outcome ? <OutcomeText status={row.outcome.status} /> : "—"}
            {row.outcome && ` · ${signed(row.outcome.pct_since_anchor)}%`}
            {journalFor(row) && onOpenJournal && (
              <>
                {" · "}
                <button
                  className="link-button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenJournal(journalFor(row)!);
                  }}
                >
                  <NotebookText className="icon" size={13} /> 日志
                </button>
              </>
            )}
          </div>
        </a>
      ))}
    </>
  );
}
