import type { OverviewRecap, RecapSettlementRow } from '@kansoku/shared/types';
import { signed } from '@web/lib/format';
import { client } from '@web/lib/client';
import { openModal } from '@web/ui';
import { useIntervalFetch } from '../cockpit/useIntervalFetch';
import { RecapBoard } from './RecapBoard';

interface RecapSummary {
  hits: number;
  resolved: number;
  avgPct: number | null;
}

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
      className="recap-cell"
      onClick={open}
      title={`${date} 复盘 · 点击查看详情`}
    >
      <span className="idx-sym recap-label">复盘</span>
      {summary ? (
        <span className={`num recap-stat ${tone}`}>
          {summary.hits}/{summary.resolved}
          {summary.avgPct != null && (
            <>
              {' · '}
              {signed(summary.avgPct)}%
            </>
          )}
        </span>
      ) : (
        <span className="num recap-stat">—</span>
      )}
    </button>
  );
}
