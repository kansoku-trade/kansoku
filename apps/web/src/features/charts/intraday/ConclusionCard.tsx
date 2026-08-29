import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { marketDate } from '@kansoku/shared/time';
import type { ContextStance, IntradayContext } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { DIRECTION_LABEL } from './directionLabels';
import { Button, MarketTime, Spinner, TimeAgo } from '@web/ui';
import { colors, fontSizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  card: {
    marginBottom: '14px',
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  longCard: {
    borderColor: colors.up,
    backgroundImage: 'linear-gradient(135deg, rgb(38 166 154 / 0.14), rgb(38 166 154 / 0.04))',
  },
  shortCard: {
    borderColor: colors.down,
    backgroundImage: 'linear-gradient(135deg, rgb(239 83 80 / 0.14), rgb(239 83 80 / 0.04))',
  },
  neutralCard: {
    borderColor: colors.textSecondary,
    backgroundImage: 'linear-gradient(135deg, rgb(154 154 154 / 0.14), rgb(154 154 154 / 0.04))',
  },
  longText: { color: colors.up },
  shortText: { color: colors.down },
  neutralText: { color: colors.textSecondary },
  action: {
    color: colors.textPrimary,
    fontWeight: 500,
  },
  refresh: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTopStyle: 'dashed',
    borderTopWidth: '1px',
  },
  longRefresh: { borderTopColor: 'rgb(38 166 154 / 0.4)' },
  shortRefresh: { borderTopColor: 'rgb(239 83 80 / 0.4)' },
  neutralRefresh: { borderTopColor: 'rgb(154 154 154 / 0.4)' },
  refreshRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  refreshNote: {
    fontSize: fontSizes.sm,
    color: colors.accent,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  refreshDetails: {
    marginTop: '8px',
  },
});

function stanceStyles(stance: ContextStance) {
  if (stance === 'long') {
    return { card: styles.longCard, text: styles.longText, refresh: styles.longRefresh };
  }
  if (stance === 'short') {
    return { card: styles.shortCard, text: styles.shortText, refresh: styles.shortRefresh };
  }
  return { card: styles.neutralCard, text: styles.neutralText, refresh: styles.neutralRefresh };
}

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

export function ReassessCta({
  reassess,
  tone,
}: {
  reassess: ConclusionReassess;
  tone?: ContextStance;
}) {
  const toneStyle = tone ? stanceStyles(tone).refresh : undefined;
  return (
    <>
      <div className={`conclusion-refresh ${stylex.props(styles.refresh, toneStyle).className}`}>
        <div className={`conclusion-refresh-row ${stylex.props(styles.refreshRow).className}`}>
          <span className={`conclusion-refresh-note ${stylex.props(styles.refreshNote).className}`}>
            <TriangleAlert className="icon" size={13} /> 这条结论已过时，走势可能早已变化
          </span>
          <Button onClick={reassess.start} disabled={reassess.busy}>
            {reassess.busy && <Spinner />}
            {reassess.busy ? '重估进行中…' : '重新分析'}
          </Button>
          {reassess.hint && <span className="ai-hint">{reassess.hint}</span>}
        </div>
      </div>
      {reassess.details && (
        <div
          className={`conclusion-refresh-details ${stylex.props(styles.refreshDetails).className}`}
        >
          {reassess.details}
        </div>
      )}
    </>
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
  const tone = stanceStyles(stance);

  return (
    <div className={`verdict conclusion-card ${stylex.props(styles.card, tone.card).className}`}>
      <div className="verdict-label">
        综合结论
        {predictionStale ? (
          <span className="stale-badge">
            <TriangleAlert className="icon" size={13} /> 盘中已过期
          </span>
        ) : (
          <span className="prediction-age">
            更新于 <MarketTime value={context.generated_at} format="clock" includeZone />（
            <TimeAgo since={context.generated_at} />）
          </span>
        )}
      </div>
      <div className={`verdict-text ${stylex.props(tone.text).className}`}>
        {DIRECTION_LABEL[stance] ?? '🤔 观望'}
      </div>
      <div className="verdict-reason">{summary}</div>
      <div className={`verdict-reason conclusion-action ${stylex.props(styles.action).className}`}>
        {action}
      </div>
      {outdated && reassess && <ReassessCta reassess={reassess} tone={stance} />}
    </div>
  );
}
