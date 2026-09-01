import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { marketDate } from '@kansoku/shared/time';
import type { ContextStance, IntradayContext } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { DIRECTION_LABEL } from './directionLabels';
import { Button, MarketTime, Spinner, TimeAgo } from '@web/ui';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  card: {
    marginBottom: '14px',
    padding: '12px',
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  longCard: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.up} 14%, transparent), color-mix(in srgb, ${colors.up} 4%, transparent))`,
    borderColor: colors.up,
  },
  shortCard: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.down} 14%, transparent), color-mix(in srgb, ${colors.down} 4%, transparent))`,
    borderColor: colors.down,
  },
  neutralCard: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.textSecondary} 14%, transparent), color-mix(in srgb, ${colors.textSecondary} 4%, transparent))`,
    borderColor: colors.textSecondary,
  },
  longText: { color: colors.up },
  shortText: { color: colors.down },
  neutralText: { color: colors.textSecondary },
  verdictLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  predictionAge: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 'normal',
    marginLeft: '6px',
    textTransform: 'none',
  },
  staleBadge: {
    backgroundColor: 'rgba(255, 176, 0, 0.15)',
    borderColor: 'rgba(255, 176, 0, 0.4)',
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    fontSize: fontSizes.sm,
    fontWeight: 600,
    letterSpacing: 'normal',
    marginLeft: '6px',
    padding: '1px 6px',
    textTransform: 'none',
  },
  verdictText: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: '4px',
  },
  verdictReason: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    marginTop: '6px',
  },
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
  longRefresh: { borderTopColor: `color-mix(in srgb, ${colors.up} 40%, transparent)` },
  shortRefresh: { borderTopColor: `color-mix(in srgb, ${colors.down} 40%, transparent)` },
  neutralRefresh: {
    borderTopColor: `color-mix(in srgb, ${colors.textSecondary} 40%, transparent)`,
  },
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
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  icon: {
    verticalAlign: '-2px',
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
            <TriangleAlert className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
            这条结论已过时，走势可能早已变化
          </span>
          <Button onClick={reassess.start} disabled={reassess.busy}>
            {reassess.busy && <Spinner />}
            {reassess.busy ? '重估进行中…' : '重新分析'}
          </Button>
          {reassess.hint && (
            <span className={`ai-hint ${stylex.props(styles.hint).className}`}>
              {reassess.hint}
            </span>
          )}
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
      <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
        综合结论
        {predictionStale ? (
          <span className={`stale-badge ${stylex.props(styles.staleBadge).className}`}>
            <TriangleAlert className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
            盘中已过期
          </span>
        ) : (
          <span className={`prediction-age ${stylex.props(styles.predictionAge).className}`}>
            更新于 <MarketTime value={context.generated_at} format="clock" includeZone />（
            <TimeAgo since={context.generated_at} />）
          </span>
        )}
      </div>
      <div className={`verdict-text ${stylex.props(styles.verdictText, tone.text).className}`}>
        {DIRECTION_LABEL[stance] ?? '🤔 观望'}
      </div>
      <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
        {summary}
      </div>
      <div
        className={`verdict-reason conclusion-action ${stylex.props(styles.verdictReason, styles.action).className}`}
      >
        {action}
      </div>
      {outdated && reassess && <ReassessCta reassess={reassess} tone={stance} />}
    </div>
  );
}
