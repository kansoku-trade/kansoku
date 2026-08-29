import type { OverviewRecap, RecapSettlementRow } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { signed } from '@web/lib/format';
import { client } from '@web/lib/client';
import { openModal } from '@web/ui';
import { colors } from '../../theme/tokens.stylex';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
import { RecapBoard } from './RecapBoard';

interface RecapSummary {
  hits: number;
  resolved: number;
  avgPct: number | null;
}

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderLeftColor: colors.border,
    borderLeftWidth: '1px',
    borderStyle: 'solid',
    borderWidth: 0,
    color: colors.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    font: 'inherit',
    fontVariantNumeric: 'tabular-nums',
    gap: '6px',
    padding: '0 0 0 14px',
    ':hover': {
      color: colors.textPrimary,
    },
  },
  label: {
    color: colors.accent,
    fontWeight: 600,
  },
  stat: {
    color: colors.textSecondary,
  },
  up: {
    color: colors.up,
  },
  down: {
    color: colors.down,
  },
});

function summarizeRecap(recap: OverviewRecap | null | undefined): RecapSummary | null {
  if (!recap) return null;
  const resolved = recap.settlements.filter(
    (s: RecapSettlementRow) => s.outcome != null && s.outcome.status !== 'open',
  );
  if (!resolved.length) return null;
  const hits = resolved.filter(
    (s: RecapSettlementRow) =>
      s.outcome != null && (s.outcome.status === 'hit_target' || s.outcome.status === 'held_range'),
  ).length;
  const pcts = resolved.map((s) => s.day_pct).filter((p): p is number => p != null);
  const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  return { hits, resolved: resolved.length, avgPct };
}

export function RecapCell({ date }: { date: string }) {
  const { data } = useIntervalFetch<OverviewRecap>(
    `overview.recap:${date}`,
    () => client.overview.recap({ date }),
    30 * 60_000,
  );
  const summary = summarizeRecap(data);
  const tone =
    summary?.avgPct == null ? '' : summary.avgPct > 0 ? 'up' : summary.avgPct < 0 ? 'down' : '';
  const open = () =>
    openModal({
      title: `复盘 · ${date}`,
      body: <RecapBoard date={date} defaultExpanded />,
    });
  return (
    <button
      type="button"
      className={`recap-cell ${stylex.props(styles.root).className}`}
      onClick={open}
      title={`${date} 复盘 · 点击查看详情`}
    >
      <span className={`idx-sym recap-label ${stylex.props(styles.label).className}`}>复盘</span>
      {summary ? (
        <span
          className={`num ${stylex.props(styles.stat, tone === 'up' && styles.up, tone === 'down' && styles.down).className}`}
        >
          {summary.hits}/{summary.resolved}
          {summary.avgPct != null && (
            <>
              {' · '}
              {signed(summary.avgPct)}%
            </>
          )}
        </span>
      ) : (
        <span className={`num ${stylex.props(styles.stat).className}`}>—</span>
      )}
    </button>
  );
}
