// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TrainerClosedTrade, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';

const setMarkers = vi.fn();

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  createSeriesMarkers: () => ({ setMarkers }),
  createChart: () => ({
    addSeries: () => ({
      priceScale: () => ({ applyOptions: vi.fn() }),
      setData: vi.fn(),
    }),
    timeScale: () => ({ fitContent: vi.fn() }),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  }),
}));

const { TrainerThumbnail } = await import('./TrainerThumbnail');
const { buildTrainerIntradayBuilt } = await import('./payloadToIntradayBuilt');

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  setMarkers.mockClear();
});

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

const BARS: RawBar[] = [
  bar('2026-01-05T14:00:00.000Z', 100),
  bar('2026-01-05T14:05:00.000Z', 101),
  bar('2026-01-05T14:10:00.000Z', 102),
];

const TRADE: TrainerClosedTrade = {
  tradeId: 1,
  direction: 'long',
  decisionBar: 0,
  decisionTime: BARS[0].time,
  entry: { time: BARS[0].time, price: 100 },
  exit: { time: BARS[2].time, price: 102 },
  exitReason: 'target',
  initialStop: 99,
  finalStop: 99,
  target: 103,
  initialRisk: 1,
  grossR: 2,
  frictionR: 0,
  netR: 2,
  mfeR: 2,
  maeR: 0,
  holdingBars: 2,
};

function terminalView(): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: BARS.length - 1,
    asOf: BARS.at(-1)!.time,
    bars: { base: BARS, mid: BARS, top: BARS },
    quote: {},
    phase: 'terminal',
    order: null,
    position: null,
    trades: [TRADE],
    netR: 2,
    remainingBars: 0,
    terminal: true,
    result: null,
  };
}

describe('TrainerThumbnail', () => {
  // At 118px a marker label is taller than the candles it sits on and the strip has no tooltip to
  // recover the price from, so the arrows have to carry the whole message on their own.
  it('draws the trade arrows without any label text', () => {
    const built = buildTrainerIntradayBuilt(terminalView());
    render(<TrainerThumbnail built={built} activeTf="m5" onChartHandle={vi.fn()} />);

    const drawn = setMarkers.mock.calls.at(-1)?.[0] as { text: string; shape: string }[];
    expect(drawn).toHaveLength(2);
    expect(drawn.map((marker) => marker.text)).toEqual(['', '']);
    expect(drawn.map((marker) => marker.shape)).toEqual(['arrowUp', 'arrowDown']);
  });

  it('still labels the same marks on the full-size build it was given', () => {
    const built = buildTrainerIntradayBuilt(terminalView());
    expect(built.timeframes.m5?.markers.map((marker) => marker.text)).toEqual([
      '进 100.00',
      '离 102.00 止盈',
    ]);
  });
});
