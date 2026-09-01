import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Dot, MarketTime } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import type { RunningReassessStatus } from './useAnalystRun';

export const PHASE_LABEL: Record<RunningReassessStatus['phase'], string> = {
  preparing: '准备环境',
  researching: '收集资料',
  writing: '写入复盘',
  finalizing: '生成结论',
};

const ORIGIN_LABEL: Record<RunningReassessStatus['origin'], string> = {
  manual: '手动分析',
  escalation: '自动升级分析',
};

const styles = stylex.create({
  root: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'grid',
    fontVariantNumeric: 'tabular-nums',
    gap: '9px',
    gridTemplateColumns: '7px minmax(0, 1fr)',
    marginTop: '14px',
    paddingTop: '12px',
    textAlign: 'left',
  },
  indicator: {
    display: 'flex',
    paddingTop: '4px',
  },
  body: {
    minWidth: 0,
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 10px',
    fontSize: fontSizes.sm,
    justifyContent: 'flex-start',
  },
  phase: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  elapsed: {
    color: colors.textMuted,
    whiteSpace: 'nowrap',
  },
  activity: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.45,
    marginTop: '6px',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '4px',
  },
});

export function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds} 秒`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
  return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分 ${String(seconds).padStart(2, '0')} 秒`;
}

export function AnalysisRunDetails({ status }: { status: RunningReassessStatus }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status.startedAt]);

  const startedAt = Date.parse(status.startedAt);
  const elapsed = Number.isFinite(startedAt) ? formatElapsedDuration(now - startedAt) : '时间未知';

  return (
    <div className={`ai-run-status ${stylex.props(styles.root).className}`}>
      <span
        className={`ai-run-status-indicator ${stylex.props(styles.indicator).className}`}
        aria-hidden="true"
      >
        <Dot tone="accent" pulse />
      </span>
      <div className={`ai-run-status-body ${stylex.props(styles.body).className}`}>
        <div className={`ai-run-status-head ${stylex.props(styles.head).className}`}>
          <span className={`ai-run-status-phase ${stylex.props(styles.phase).className}`}>
            {PHASE_LABEL[status.phase]}
          </span>
          <span className={`ai-run-status-elapsed ${stylex.props(styles.elapsed).className}`}>
            {ORIGIN_LABEL[status.origin]} · 已运行 {elapsed}
          </span>
        </div>
        <div
          className={`ai-run-status-activity ${stylex.props(styles.activity).className}`}
          aria-live="polite"
        >
          {status.activity}
        </div>
        <div className={`ai-run-status-meta ${stylex.props(styles.meta).className}`}>
          开始于 <MarketTime value={status.startedAt} format="clock" includeZone /> · 最近动作{' '}
          <MarketTime value={status.updatedAt} format="clock" includeZone />
        </div>
      </div>
    </div>
  );
}
