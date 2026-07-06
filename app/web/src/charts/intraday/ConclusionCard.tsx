import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import type { IntradayContext } from "../../../../shared/types";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "./directionLabels";
import { useMinutesAgo } from "./predictionAge";
import { theme } from "../../theme";
import { MarketTime } from "../../ui";

interface ConclusionCardProps {
  context: IntradayContext | null;
  predictionStale?: boolean;
}

export function ConclusionCard({ context, predictionStale }: ConclusionCardProps) {
  const minutesAgo = useMinutesAgo(context?.generated_at);
  if (!context) return null;
  const { stance, summary, action } = context.conclusion;

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
            更新于 <MarketTime value={context.generated_at} format="clock" includeZone />（{minutesAgo} 分钟前）
          </span>
        )}
      </div>
      <div className="verdict-text">{DIRECTION_LABEL[stance] ?? "🤔 观望"}</div>
      <div className="verdict-reason">{summary}</div>
      <div className="verdict-reason conclusion-action">{action}</div>
    </div>
  );
}
