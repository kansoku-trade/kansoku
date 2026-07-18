import type { CSSProperties, ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { marketDate } from "@kansoku/shared/time";
import type { IntradayContext } from "@kansoku/shared/types";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "./directionLabels";
import { theme } from "@web/theme";
import { Button, MarketTime, Spinner, TimeAgo } from "@web/ui";

export function conclusionOutdated(
  generatedAt: string | null | undefined,
  predictionStale: boolean | undefined,
  now: number,
): boolean {
  if (predictionStale) return true;
  if (!generatedAt) return false;
  return marketDate(generatedAt) < marketDate(new Date(now));
}

export interface ConclusionReassess {
  start: () => void | Promise<void>;
  busy: boolean;
  hint?: string | null;
  details?: ReactNode;
}

export function ReassessCta({ reassess }: { reassess: ConclusionReassess }) {
  return (
    <div className="conclusion-refresh">
      <div className="conclusion-refresh-row">
        <span className="conclusion-refresh-note">
          <TriangleAlert className="icon" size={13} /> 这条结论已过时，走势可能早已变化
        </span>
        <Button onClick={reassess.start} disabled={reassess.busy}>
          {reassess.busy && <Spinner />}
          {reassess.busy ? "重估进行中…" : "重新分析"}
        </Button>
        {reassess.hint && <span className="ai-hint">{reassess.hint}</span>}
      </div>
      {reassess.details}
    </div>
  );
}

interface ConclusionCardProps {
  context: IntradayContext | null;
  predictionStale?: boolean;
  reassess?: ConclusionReassess;
}

export function ConclusionCard({ context, predictionStale, reassess }: ConclusionCardProps) {
  if (!context) return null;
  const { stance, summary, action } = context.conclusion;
  const outdated = conclusionOutdated(context.generated_at, predictionStale, Date.now());

  return (
    <div className="verdict conclusion-card" style={{ "--vc": DIRECTION_COLOR[stance] ?? theme.textSecondary } as CSSProperties}>
      <div className="verdict-label">
        综合结论
        {predictionStale ? (
          <span className="stale-badge">
            <TriangleAlert className="icon" size={13} /> 盘中已过期
          </span>
        ) : (
          <span className="prediction-age">
            更新于 <MarketTime value={context.generated_at} format="clock" includeZone />（<TimeAgo since={context.generated_at} />）
          </span>
        )}
      </div>
      <div className="verdict-text">{DIRECTION_LABEL[stance] ?? "🤔 观望"}</div>
      <div className="verdict-reason">{summary}</div>
      <div className="verdict-reason conclusion-action">{action}</div>
      {outdated && reassess && <ReassessCta reassess={reassess} />}
    </div>
  );
}
