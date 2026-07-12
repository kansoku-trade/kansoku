import { useEffect, useState } from "react";
import type { BenchmarkSeries, CockpitPosition, RelativeVolume } from "../../../../shared/types";
import { useSSE } from "../../useSSE";

interface PositionPayload {
  position: CockpitPosition | null;
  relvol: RelativeVolume | null;
}

export interface CockpitEnvState {
  position: CockpitPosition | null;
  positionError: string | null;
  relvol: RelativeVolume | null;
  benchmark: BenchmarkSeries[] | null;
  benchmarkError: string | null;
}

export function useCockpitEnv(sym: string): CockpitEnvState {
  const [position, setPosition] = useState<CockpitPosition | null>(null);
  const [relvol, setRelvol] = useState<RelativeVolume | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkSeries[] | null>(null);
  useEffect(() => {
    setPosition(null);
    setRelvol(null);
    setBenchmark(null);
  }, [sym]);
  const { degraded: positionDegraded } = useSSE<PositionPayload>({ kind: "position", symbol: sym }, (d) => {
    setPosition(d.position);
    setRelvol(d.relvol);
  });
  const { degraded: benchmarkDegraded } = useSSE<BenchmarkSeries[]>({ kind: "benchmark", symbol: sym }, setBenchmark);

  return {
    position,
    relvol,
    benchmark,
    positionError: positionDegraded ? "持仓数据获取失败，正在重试" : null,
    benchmarkError: benchmarkDegraded ? "环境对照数据获取失败，正在重试" : null,
  };
}
