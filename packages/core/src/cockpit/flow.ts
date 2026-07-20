import type { CapitalBucket, CockpitFlow, LinePoint } from '@kansoku/shared/types';
import type { RawCapitalDistribution } from '../marketdata/types.js';
import type { FlowRow } from '../analysis/simple.js';

function toBucket(inRaw: string, outRaw: string): CapitalBucket {
  const inVal = Number(inRaw);
  const outVal = Number(outRaw);
  return { in: inVal, out: outVal, net: inVal - outVal };
}

export function buildCockpitFlow(
  rows: FlowRow[],
  dist: RawCapitalDistribution | null,
): CockpitFlow {
  const curve: LinePoint[] = [];
  for (const row of rows) {
    const time = Date.parse(row.time);
    const value = Number(row.inflow);
    if (Number.isNaN(time) || Number.isNaN(value)) continue;
    curve.push({ time, value });
  }

  if (!dist) {
    return { curve, distribution: null, timestamp: null };
  }

  return {
    curve,
    distribution: {
      large: toBucket(dist.capital_in.large, dist.capital_out.large),
      medium: toBucket(dist.capital_in.medium, dist.capital_out.medium),
      small: toBucket(dist.capital_in.small, dist.capital_out.small),
    },
    timestamp: dist.timestamp,
  };
}
