import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import { OVERNIGHT_POLL_MS, REGULAR_POLL_MS } from '../src/realtime/pushFallback.js';

const store = vi.hoisted(() => ({ loadChart: vi.fn() }));
const build = vi.hoisted(() => ({
  buildChart: vi.fn(),
  refreshBody: vi.fn(),
  rebuild: vi.fn(),
}));
const longbridgeStream = vi.hoisted(() => ({
  subscribeCandlesticks: vi.fn(() => vi.fn()),
}));
const capturedIntervalMs = vi.hoisted(() => ({ fn: null as (() => number) | null }));

vi.mock('../src/charts/store.js', () => store);
vi.mock('../src/charts/build.js', () => build);
vi.mock('../src/marketdata/longbridgeStream.js', () => ({
  getLongbridgeStream: () => longbridgeStream,
}));
vi.mock('../src/analysis/optionsLevels.js', () => ({
  getOptionsLevels: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/marketdata/events.js', () => ({ getEventRisk: vi.fn().mockResolvedValue(null) }));
vi.mock('../src/realtime/poller.js', () => ({
  createPoller: (opts: { intervalMs: number | (() => number) }) => {
    capturedIntervalMs.fn =
      typeof opts.intervalMs === 'function' ? opts.intervalMs : () => opts.intervalMs as number;
    return {
      subscribe: () => () => {},
      subscriberCount: () => 0,
      pushData: () => {},
      hasData: () => false,
    };
  },
}));

const { subscribeChart } = await import('../src/realtime/charts.js');

const HK_REGULAR_TS = '2026-07-08T02:00:00.000Z';
const TODAY_ID_PREFIX = '2026-07-08';

function makeDoc(overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id: `${TODAY_ID_PREFIX}-700hk-intraday`,
    schema_version: 1,
    type: 'intraday',
    title: '700.HK 短线多周期',
    symbol: '700.HK',
    created_at: '2026-07-07T00:00:00.000Z',
    updated_at: '2026-07-07T00:00:00.000Z',
    input: {
      symbol: '700.HK',
      timeframes: {
        m5: [
          { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
        ],
        m15: [
          { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
        ],
        h1: [
          { time: new Date(1_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
        ],
      },
    },
    built: { kind: 'intraday' } as unknown as ChartDoc['built'],
    ...overrides,
  };
}

describe("subscribeChart cadence uses the chart symbol's own market session", () => {
  beforeEach(() => {
    capturedIntervalMs.fn = null;
    store.loadChart.mockReset().mockResolvedValue(makeDoc());
    build.refreshBody.mockReset().mockReturnValue({ type: 'intraday', symbol: '700.HK' });
    longbridgeStream.subscribeCandlesticks.mockReset().mockImplementation(() => vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks the regular-session tier during HK trading hours, not the US overnight default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HK_REGULAR_TS));

    const unsub = await subscribeChart(`${TODAY_ID_PREFIX}-700hk-intraday`, () => {});
    expect(capturedIntervalMs.fn).toBeTruthy();

    vi.setSystemTime(new Date(HK_REGULAR_TS));
    const interval = capturedIntervalMs.fn!();

    expect(interval).toBe(REGULAR_POLL_MS);
    expect(interval).not.toBe(OVERNIGHT_POLL_MS);
    unsub();
  });

  it('still picks the regular-session tier for a US symbol during US trading hours (regression)', async () => {
    const US_REGULAR_TS = '2026-07-02T15:00:00.000Z';
    const US_ID_PREFIX = '2026-07-02';

    vi.useFakeTimers();
    vi.setSystemTime(new Date(US_REGULAR_TS));
    store.loadChart.mockResolvedValue(
      makeDoc({
        id: `${US_ID_PREFIX}-nvda-intraday`,
        symbol: 'NVDA.US',
        input: {
          symbol: 'NVDA.US',
          timeframes: {
            m5: [
              {
                time: new Date(1_000).toISOString(),
                open: 1,
                high: 1,
                low: 1,
                close: 1,
                volume: 1,
              },
            ],
            m15: [
              {
                time: new Date(1_000).toISOString(),
                open: 1,
                high: 1,
                low: 1,
                close: 1,
                volume: 1,
              },
            ],
            h1: [
              {
                time: new Date(1_000).toISOString(),
                open: 1,
                high: 1,
                low: 1,
                close: 1,
                volume: 1,
              },
            ],
          },
        },
      }),
    );
    build.refreshBody.mockReturnValue({ type: 'intraday', symbol: 'NVDA.US' });

    const unsub = await subscribeChart(`${US_ID_PREFIX}-nvda-intraday`, () => {});
    expect(capturedIntervalMs.fn).toBeTruthy();

    const interval = capturedIntervalMs.fn!();
    expect(interval).toBe(REGULAR_POLL_MS);
    unsub();
  });

  it('keeps the regular-session poll tier for an HK flow chart (no candle state) during HK trading hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HK_REGULAR_TS));
    store.loadChart.mockResolvedValue(
      makeDoc({
        id: `${TODAY_ID_PREFIX}-700hk-flow`,
        type: 'flow',
        built: { kind: 'flow' } as unknown as ChartDoc['built'],
        input: { symbol: '700.HK' },
      }),
    );
    build.refreshBody.mockReturnValue({ type: 'flow', symbol: '700.HK' });

    const unsub = await subscribeChart(`${TODAY_ID_PREFIX}-700hk-flow`, () => {});
    expect(capturedIntervalMs.fn).toBeTruthy();

    const interval = capturedIntervalMs.fn!();
    expect(interval).toBe(REGULAR_POLL_MS);
    expect(interval).not.toBe(OVERNIGHT_POLL_MS);
    unsub();
  });
});

describe("subscribeChart gate honors the chart symbol's own market date", () => {
  beforeEach(() => {
    capturedIntervalMs.fn = null;
    store.loadChart.mockReset().mockResolvedValue(makeDoc());
    build.refreshBody.mockReset().mockReturnValue({ type: 'intraday', symbol: '700.HK' });
    longbridgeStream.subscribeCandlesticks.mockReset().mockImplementation(() => vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes an HK chart dated HK-local today at an early-UTC instant (02:00 UTC, before 04:00)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HK_REGULAR_TS));

    const unsub = await subscribeChart(`${TODAY_ID_PREFIX}-hkgate-intraday`, () => {});
    expect(capturedIntervalMs.fn).toBeTruthy();
    unsub();
  });

  it('does not subscribe an HK chart whose id carries a stale US-local date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HK_REGULAR_TS));

    const unsub = await subscribeChart('2026-07-07-hkstale-intraday', () => {});
    expect(capturedIntervalMs.fn).toBeNull();
    unsub();
  });
});
