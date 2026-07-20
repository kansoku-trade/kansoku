import type { BenchmarkSeries, RawBar } from '@kansoku/shared/types';

export function buildBenchmark(series: { symbol: string; bars: RawBar[] }[]): BenchmarkSeries[] {
  const nonEmpty = series.filter((s) => s.bars.length > 0);
  if (nonEmpty.length === 0) return [];

  const commonStart = Math.max(...nonEmpty.map((s) => Date.parse(s.bars[0].time)));

  const result: BenchmarkSeries[] = [];
  for (const { symbol, bars } of nonEmpty) {
    const trimmed = bars.filter((bar) => Date.parse(bar.time) >= commonStart);
    if (trimmed.length === 0) continue;
    const firstClose = Number(trimmed[0].close);
    result.push({
      symbol,
      points: trimmed.map((bar) => ({
        time: Date.parse(bar.time),
        pct: (Number(bar.close) / firstClose - 1) * 100,
      })),
    });
  }
  return result;
}
