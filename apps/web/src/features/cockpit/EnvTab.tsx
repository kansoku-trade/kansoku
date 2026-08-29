import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BenchmarkSeries, CockpitPosition, RelativeVolume } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import {
  hhmm,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipTime,
} from '@web/features/charts/simple/theme';
import { fmt, signed, upDown } from '@web/lib/format';
import { seriesPalette, theme } from '@web/lib/theme';
import { Num, SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  grid: {
    display: 'grid',
    fontSize: fontSizes.base,
    gap: '6px 10px',
    gridTemplateColumns: 'auto 1fr',
  },
  key: {
    color: colors.textSecondary,
  },
  value: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  valueUp: {
    color: colors.up,
  },
  valueDown: {
    color: colors.down,
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
    marginTop: '6px',
  },
});

const valueClassName = (tone?: string) =>
  stylex.props(styles.value, tone === 'up' && styles.valueUp, tone === 'down' && styles.valueDown)
    .className;

const BENCHMARK_COLORS = [seriesPalette[0], seriesPalette[2], seriesPalette[3]];

function mergeBenchmark(series: BenchmarkSeries[]): Record<string, number>[] {
  const byTime = new Map<number, Record<string, number>>();
  for (const s of series) {
    for (const p of s.points) {
      const t = p.time;
      if (!Number.isFinite(t)) continue;
      const row = byTime.get(t) ?? { t };
      row[s.symbol] = p.pct;
      byTime.set(t, row);
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function BenchmarkChart({ series }: { series: BenchmarkSeries[] }) {
  const data = mergeBenchmark(series);
  return (
    <div style={{ width: '100%', height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.border} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={hhmm}
            tick={{ fill: theme.textSecondary, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: theme.borderStrong }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: theme.textSecondary, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Legend
            verticalAlign="top"
            height={20}
            wrapperStyle={{ fontSize: 11, color: theme.textSecondary }}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(t) => tooltipTime(Number(t))}
            formatter={(value) => `${Number(value).toFixed(2)}%`}
          />
          <ReferenceLine y={0} stroke={theme.borderStrong} />
          {series.map((s, i) => (
            <Line
              key={s.symbol}
              dataKey={s.symbol}
              stroke={BENCHMARK_COLORS[i % BENCHMARK_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EnvTabProps {
  position: CockpitPosition | null;
  positionError: string | null;
  benchmark: BenchmarkSeries[] | null;
  benchmarkError: string | null;
  relvol?: RelativeVolume | null;
}

function relvolTone(ratio: number): string {
  if (ratio >= 1.5) return 'up';
  if (ratio <= 0.6) return 'down';
  return '';
}

export function EnvTab({
  position,
  positionError,
  benchmark,
  benchmarkError,
  relvol,
}: EnvTabProps) {
  const relvolStatus = relvol ? relvolTone(relvol.ratio) : '';
  const positionStatus = position ? upDown(position.unrealized) : '';

  return (
    <>
      {relvol && (
        <>
          <SectionTitle>量能对比（对齐前 {relvol.days_used} 日同时段）</SectionTitle>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            <div className={`k ${stylex.props(styles.key).className}`}>今天 vs 均值</div>
            <div className={`v ${relvolStatus} ${valueClassName(relvolStatus)}`}>
              ×{relvol.ratio.toFixed(2)}
            </div>
            <div className={`k ${stylex.props(styles.key).className}`}>今日累计</div>
            <div className={`v ${valueClassName()}`}>
              {Math.round(relvol.today_cum).toLocaleString()}
            </div>
            <div className={`k ${stylex.props(styles.key).className}`}>同时段均值</div>
            <div className={`v ${valueClassName()}`}>
              {Math.round(relvol.baseline_avg).toLocaleString()}
            </div>
          </div>
        </>
      )}
      {position && (
        <>
          <SectionTitle>持仓</SectionTitle>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            <div className={`k ${stylex.props(styles.key).className}`}>持仓</div>
            <div className={`v ${valueClassName()}`}>{position.shares} sh</div>
            <div className={`k ${stylex.props(styles.key).className}`}>成本</div>
            <div className={`v ${valueClassName()}`}>${fmt(position.cost)}</div>
            <div className={`k ${stylex.props(styles.key).className}`}>现价</div>
            <div className={`v ${valueClassName()}`}>${fmt(position.last)}</div>
            <div className={`k ${stylex.props(styles.key).className}`}>
              浮{position.unrealized >= 0 ? '盈' : '亏'}
            </div>
            <div className={`v ${positionStatus} ${valueClassName(positionStatus)}`}>
              {signed(position.unrealized, 0)} ({signed(position.unrealizedPct)}%)
            </div>
            {position.distances?.stop_pct != null && (
              <>
                <div className={`k ${stylex.props(styles.key).className}`}>离止损</div>
                <div className={`v ${valueClassName()}`}>
                  <Num value={position.distances.stop_pct} diff suffix="%" />
                </div>
              </>
            )}
            {position.distances?.target1_pct != null && (
              <>
                <div className={`k ${stylex.props(styles.key).className}`}>离目标1</div>
                <div className={`v ${valueClassName()}`}>
                  <Num value={position.distances.target1_pct} diff suffix="%" />
                </div>
              </>
            )}
            {position.distances?.target2_pct != null && (
              <>
                <div className={`k ${stylex.props(styles.key).className}`}>离目标2</div>
                <div className={`v ${valueClassName()}`}>
                  <Num value={position.distances.target2_pct} diff suffix="%" />
                </div>
              </>
            )}
          </div>
        </>
      )}
      {positionError && !position && (
        <div className={`note-block ${stylex.props(styles.note).className}`}>
          持仓数据获取失败：{positionError}
        </div>
      )}

      {!(benchmark && benchmark.length === 0) && (
        <>
          <SectionTitle style={{ marginTop: position ? 16 : 0 }}>
            环境对照（相对首点百分比）
          </SectionTitle>
          {renderBenchmark()}
        </>
      )}
    </>
  );

  function renderBenchmark() {
    if (benchmark && benchmark.length > 0) return <BenchmarkChart series={benchmark} />;
    if (benchmarkError)
      return (
        <div className={`note-block ${stylex.props(styles.note).className}`}>
          环境对照数据获取失败：{benchmarkError}
        </div>
      );
    return <div className={`note-block ${stylex.props(styles.note).className}`}>加载中…</div>;
  }
}
