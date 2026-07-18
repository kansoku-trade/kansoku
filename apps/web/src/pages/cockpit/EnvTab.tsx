import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkSeries, CockpitPosition, RelativeVolume } from "@kansoku/shared/types";
import { hhmm, tooltipContentStyle, tooltipLabelStyle, tooltipTime } from "@web/charts/simple/theme";
import { fmt, signed, upDown } from "@web/format";
import { seriesPalette, theme } from "@web/theme";
import { Num, SectionTitle } from "@web/ui";

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
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.border} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
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
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11, color: theme.textSecondary }} />
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
  if (ratio >= 1.5) return "up";
  if (ratio <= 0.6) return "down";
  return "";
}

export function EnvTab({ position, positionError, benchmark, benchmarkError, relvol }: EnvTabProps) {
  return (
    <>
      {relvol && (
        <>
          <SectionTitle>量能对比（对齐前 {relvol.days_used} 日同时段）</SectionTitle>
          <div className="grid2">
            <div className="k">今天 vs 均值</div>
            <div className={`v ${relvolTone(relvol.ratio)}`}>×{relvol.ratio.toFixed(2)}</div>
            <div className="k">今日累计</div>
            <div className="v">{Math.round(relvol.today_cum).toLocaleString()}</div>
            <div className="k">同时段均值</div>
            <div className="v">{Math.round(relvol.baseline_avg).toLocaleString()}</div>
          </div>
        </>
      )}
      {position && (
        <>
          <SectionTitle>持仓</SectionTitle>
          <div className="grid2">
            <div className="k">持仓</div>
            <div className="v">{position.shares} sh</div>
            <div className="k">成本</div>
            <div className="v">${fmt(position.cost)}</div>
            <div className="k">现价</div>
            <div className="v">${fmt(position.last)}</div>
            <div className="k">浮{position.unrealized >= 0 ? "盈" : "亏"}</div>
            <div className={`v ${upDown(position.unrealized)}`}>
              {signed(position.unrealized, 0)} ({signed(position.unrealizedPct)}%)
            </div>
            {position.distances?.stop_pct != null && (
              <>
                <div className="k">离止损</div>
                <div className="v"><Num value={position.distances.stop_pct} diff suffix="%" /></div>
              </>
            )}
            {position.distances?.target1_pct != null && (
              <>
                <div className="k">离目标1</div>
                <div className="v"><Num value={position.distances.target1_pct} diff suffix="%" /></div>
              </>
            )}
            {position.distances?.target2_pct != null && (
              <>
                <div className="k">离目标2</div>
                <div className="v"><Num value={position.distances.target2_pct} diff suffix="%" /></div>
              </>
            )}
          </div>
        </>
      )}
      {positionError && !position && <div className="note-block">持仓数据获取失败：{positionError}</div>}

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
    if (benchmarkError) return <div className="note-block">环境对照数据获取失败：{benchmarkError}</div>;
    return <div className="note-block">加载中…</div>;
  }
}
