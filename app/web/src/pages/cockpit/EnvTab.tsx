import type { BenchmarkSeries, CockpitPosition } from "../../../../shared/types";
import { fmt, signed, upDown } from "../../format";
import { MiniEChart } from "./MiniEChart";

const BENCHMARK_COLORS = ["#58a6ff", "#ffc107", "#ba68c8"];

function buildBenchmarkOption(series: BenchmarkSeries[]) {
  return {
    grid: { left: 46, right: 16, top: 24, bottom: 30 },
    xAxis: { type: "time", axisLabel: { color: "#8b949e", fontSize: 10 } },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8b949e", fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#21262d" } },
    },
    legend: { top: 0, textStyle: { color: "#8b949e", fontSize: 11 } },
    tooltip: { trigger: "axis" },
    series: series.map((s, i) => ({
      name: s.symbol,
      type: "line",
      showSymbol: false,
      data: s.points.map((p) => [p.time, p.pct]),
      lineStyle: { color: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length], width: 2 },
      itemStyle: { color: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length] },
      markLine: i === 0 ? { silent: true, symbol: "none", lineStyle: { color: "#30363d" }, data: [{ yAxis: 0 }] } : undefined,
    })),
  };
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
        <MiniEChart option={buildBenchmarkOption(benchmark)} height={180} />
      ) : benchmarkError ? (
        <div className="note-block">环境对照数据获取失败：{benchmarkError}</div>
      ) : (
        <div className="note-block">加载中…</div>
      )}
    </>
  );
}
