import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkSeries, CockpitPosition } from "../../../../shared/types";
import { fullTime, hhmm, tooltipContentStyle, tooltipLabelStyle } from "../../charts/simple/theme";
import { fmt, signed, upDown } from "../../format";

const BENCHMARK_COLORS = ["#58a6ff", "#ffc107", "#ba68c8"];

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
          <CartesianGrid stroke="#21262d" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={hhmm}
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#30363d" }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={46}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11, color: "#8b949e" }} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(t) => fullTime(Number(t))}
            formatter={(value) => `${Number(value).toFixed(2)}%`}
          />
          <ReferenceLine y={0} stroke="#30363d" />
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
}

export function EnvTab({ position, positionError, benchmark, benchmarkError }: EnvTabProps) {
  return (
    <>
      {position && (
        <>
          <div className="section-title">持仓</div>
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
                <div className="v">{signed(position.distances.stop_pct)}%</div>
              </>
            )}
            {position.distances?.target1_pct != null && (
              <>
                <div className="k">离目标1</div>
                <div className="v">{signed(position.distances.target1_pct)}%</div>
              </>
            )}
            {position.distances?.target2_pct != null && (
              <>
                <div className="k">离目标2</div>
                <div className="v">{signed(position.distances.target2_pct)}%</div>
              </>
            )}
          </div>
        </>
      )}
      {positionError && !position && <div className="note-block">持仓数据获取失败：{positionError}</div>}

      <div className="section-title" style={{ marginTop: position ? 16 : 0 }}>
        环境对照（相对首点百分比）
      </div>
      {benchmark && benchmark.length > 0 ? (
        <BenchmarkChart series={benchmark} />
      ) : benchmarkError ? (
        <div className="note-block">环境对照数据获取失败：{benchmarkError}</div>
      ) : (
        <div className="note-block">加载中…</div>
      )}
    </>
  );
}
