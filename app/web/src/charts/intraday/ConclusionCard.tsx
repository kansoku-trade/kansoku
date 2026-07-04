import type { CSSProperties } from "react";
import type { IntradayContext } from "../../../../shared/types";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "./directionLabels";
import { predictionAgeText } from "./predictionAge";

interface ConclusionCardProps {
  context: IntradayContext | null;
  predictionStale?: boolean;
}

export function ConclusionCard({ context, predictionStale }: ConclusionCardProps) {
  if (!context) return null;
  const { stance, summary, action } = context.conclusion;

  return (
    <div className="verdict conclusion-card" style={{ "--vc": DIRECTION_COLOR[stance] ?? "#8b949e" } as CSSProperties}>
      <div className="verdict-label">
        综合结论
        {predictionStale ? (
          <span className="stale-badge">⚠ 盘中已过期</span>
        ) : (
          <span className="prediction-age">{predictionAgeText(context.generated_at)}</span>
        )}
      </div>
      <div className="verdict-text">{DIRECTION_LABEL[stance] ?? "🤔 观望"}</div>
      <div className="verdict-reason">{summary}</div>
      <div className="verdict-reason conclusion-action">{action}</div>
    </div>
  );
}
