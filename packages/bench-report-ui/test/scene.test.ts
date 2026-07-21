import { describe, expect, it } from 'vitest';
import { buildChartScene } from '../src/episode/chart/scene';
import { chartTheme } from '../src/styles/chartTheme';
import type {
  EpisodeReportChartBar,
  EpisodeReportChartPayload,
  EpisodeReportChartTradeRef,
} from '../src/types';

function bar(time: number, close: number): EpisodeReportChartBar {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 100 };
}

const trade: EpisodeReportChartTradeRef = {
  tradeId: 1,
  entry: 100,
  stop: 90,
  target: 120,
  times: {
    h1: { decision: 10, entry: 12, exit: 20 },
    day: { decision: 2000, entry: 2000, exit: 3000 },
    week: { decision: 50_000, entry: 50_000, exit: 60_000 },
  },
};

const payload: EpisodeReportChartPayload = {
  id: 'trade-chart-0',
  symbol: 'MU.US',
  finalBarIndex: 20,
  baseRanges: {
    h1: Array.from({ length: 5 }, (_, i) => bar(i + 1, 100 + i)),
    day: [bar(1000, 10), bar(2000, 11), bar(3000, 12)],
    week: [bar(50_000, 20), bar(60_000, 21)],
  },
  replayH1: Array.from({ length: 20 }, (_, i) => bar(i + 6, 105 + i)),
  snapshotPatches: {},
  markers: { h1: [], day: [], week: [] },
  levels: [
    { title: '计划入场', price: 100, color: '#2563eb' },
    { title: '止损', price: 90, color: '#dc2626' },
    { title: '止盈', price: 120, color: '#059669' },
  ],
  trades: [trade],
  availableTimeframes: ['h1', 'day', 'week'],
  defaultTimeframe: 'day',
};

describe('buildChartScene', () => {
  it('shows dashed plan levels and the default visible range without a selection', () => {
    const scene = buildChartScene(payload, 'h1', 20, null);
    expect(scene.candles).toHaveLength(25);
    expect(scene.ema).not.toBeNull();
    expect(scene.priceLines).toEqual([
      { price: 100, color: '#2563eb', title: '计划入场', dashed: true },
      { price: 90, color: '#dc2626', title: '止损', dashed: true },
      { price: 120, color: '#059669', title: '止盈', dashed: true },
    ]);
    expect(scene.highlightTime).toBeNull();
    expect(scene.visibleRange).toEqual({ from: -0.5, to: 31 });
    expect(scene.rangeText).toBe('1 小时 · 25 bars · 终局 B20');
  });

  it('swaps to solid trade lines and recenters on the per-timeframe decision bar', () => {
    const h1 = buildChartScene(payload, 'h1', 20, { kind: 'trade', tradeId: 1, trade });
    expect(h1.priceLines).toEqual([
      { price: 100, color: chartTheme.textPrimary, title: 'T1 成交', dashed: false },
      { price: 90, color: chartTheme.down, title: 'T1 止损', dashed: false },
      { price: 120, color: chartTheme.up, title: 'T1 止盈', dashed: false },
    ]);
    expect(h1.highlightTime).toBe(10);
    expect(h1.visibleRange).toEqual({ from: 9 - 45, to: 9 + 45 });

    const day = buildChartScene(payload, 'day', 20, { kind: 'trade', tradeId: 1, trade });
    expect(day.highlightTime).toBe(2000);
    expect(day.visibleRange).toEqual({ from: 1 - 45, to: 1 + 45 });
  });

  it('highlights an action using its per-timeframe time while keeping plan levels', () => {
    const scene = buildChartScene(payload, 'day', 20, {
      kind: 'action',
      step: 3,
      times: { h1: 10, day: 2000, week: 50_000 },
    });
    expect(scene.highlightTime).toBe(2000);
    expect(scene.priceLines.every((line) => line.dashed)).toBe(true);
    expect(scene.visibleRange).toEqual({ from: 1 - 45, to: 1 + 45 });
  });
});