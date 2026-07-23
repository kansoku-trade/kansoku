import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawBar } from '@kansoku/shared/types';

const usProvider = vi.hoisted(() => ({
  name: 'us',
  capabilities: new Set<string>(),
  getKline: vi.fn(),
  getQuotes: vi.fn(),
  getNews: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/marketdata/registry.js', () => ({
  getProvider: () => usProvider,
}));

const buildSepa = vi.hoisted(() =>
  vi.fn((input: { symbol: string; origin?: string | null }) => ({
    built: { kind: 'sepa', sidebar: { symbol: input.symbol, asOf: '2026-07-17', name: input.symbol } },
    meta: {},
  })),
);

vi.mock('../src/analysis/sepa.js', () => ({ buildSepa }));

const { buildChart } = await import('../src/charts/build.js');

function bars(): RawBar[] {
  return [{ time: '2026-07-17T00:00:00Z', open: 1, high: 1, low: 1, close: 1, volume: 1 }];
}

describe('buildChart sepa: origin passthrough', () => {
  beforeEach(() => {
    usProvider.getKline.mockReset().mockResolvedValue(bars());
    buildSepa.mockClear();
  });

  it('carries a research origin into the built sepa input', async () => {
    await buildChart({ type: 'sepa', symbol: 'MU.US', count: 5, origin: 'research' });

    expect(buildSepa).toHaveBeenCalledWith(expect.objectContaining({ origin: 'research' }));
  });

  it('leaves origin undefined for charts built without one (Claude Code / chart skill)', async () => {
    await buildChart({ type: 'sepa', symbol: 'MU.US', count: 5 });

    const call = buildSepa.mock.calls.at(-1)?.[0] as { origin?: string | null };
    expect(call.origin).toBeUndefined();
  });
});
