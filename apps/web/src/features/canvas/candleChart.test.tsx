// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandleFeed, IntradayTfData, TimeframeKey } from '@kansoku/shared/types';

interface FakeSeries {
  kind: string;
  data: { time: number }[];
  updates: { time: number }[];
}

interface FakeChart {
  series: FakeSeries[];
  removed: boolean;
}

const charts: FakeChart[] = [];
const markerCalls: unknown[][] = [];

vi.mock('lightweight-charts', () => {
  const scale = { applyOptions: () => {} };
  const makeSeries = (kind: string) => {
    const series: FakeSeries & Record<string, unknown> = {
      kind,
      data: [],
      updates: [],
      setData(rows: { time: number }[]) {
        series.data = rows;
      },
      update(row: { time: number }) {
        series.updates.push(row);
      },
      applyOptions: () => {},
      priceScale: () => scale,
      createPriceLine: () => ({}),
      attachPrimitive: () => {},
    };
    return series;
  };
  return {
    createChart: () => {
      const chart: FakeChart & Record<string, unknown> = {
        series: [],
        removed: false,
        addSeries(type: { kind: string }) {
          const series = makeSeries(type.kind);
          chart.series.push(series);
          return series;
        },
        priceScale: () => scale,
        applyOptions: () => {},
        timeScale: () => ({
          fitContent: () => {},
          options: () => ({ barSpacing: 6 }),
          timeToCoordinate: () => 0,
        }),
        remove() {
          chart.removed = true;
        },
      };
      charts.push(chart);
      return chart;
    },
    CandlestickSeries: { kind: 'candle' },
    HistogramSeries: { kind: 'hist' },
    LineSeries: { kind: 'line' },
    createSeriesMarkers: (...args: unknown[]) => {
      markerCalls.push(args);
    },
  };
});

const { CandleChart } = await import('@kansoku/canvas');

function tfData(times: number[], price: number): IntradayTfData {
  return {
    candles: times.map((time) => ({
      time,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
    })),
    volumes: times.map((time) => ({ time, value: 100, color: '#26a69a' })),
    emas: [{ period: 20, data: times.map((time) => ({ time, value: price })) }],
    macdDif: times.map((time) => ({ time, value: 0.1 })),
    macdDea: times.map((time) => ({ time, value: 0.2 })),
    macdHist: times.map((time) => ({ time, value: -0.1, color: '#ef5350' })),
    macdCrossMarkers: [],
    markers: [
      { time: times[0], position: 'aboveBar', shape: 'circle', color: '#fff', text: 'server' },
    ],
    priceConnectors: [],
    macdConnectors: [],
    autoDivergence: [],
    autoBeichi: [],
    offSession: [{ startTime: times[0], endTime: times[0] + 60, kind: 'pre' }],
  };
}

function feed(overrides: Partial<Record<TimeframeKey, IntradayTfData>> = {}): CandleFeed {
  return {
    symbol: 'MU.US',
    asOf: '2026-09-02T14:00:00Z',
    timeframes: {
      m5: tfData([1000, 1300], 10),
      m15: tfData([2000, 2900], 20),
      h1: tfData([3000, 6600], 30),
      ...overrides,
    },
  };
}

beforeEach(() => {
  charts.length = 0;
  markerCalls.length = 0;
});

afterEach(() => {
  cleanup();
});

describe('CandleChart feed mode', () => {
  it('draws the requested timeframe from the feed', () => {
    render(<CandleChart title="MU" source={feed()} tf="m15" />);
    const chart = charts[0];
    expect(chart).toBeTruthy();
    const candle = chart.series.find((series) => series.kind === 'candle');
    expect(candle?.data.map((row) => row.time)).toEqual([2000, 2900]);
    const lines = chart.series.filter((series) => series.kind === 'line');
    expect(lines.length).toBe(3);
    expect(chart.series.filter((series) => series.kind === 'hist').length).toBe(2);
  });

  it('defaults to m5', () => {
    render(<CandleChart source={feed()} />);
    const candle = charts[0].series.find((series) => series.kind === 'candle');
    expect(candle?.data.map((row) => row.time)).toEqual([1000, 1300]);
  });

  it('ignores server markers from the feed', () => {
    render(<CandleChart source={feed()} />);
    expect(markerCalls.length).toBe(0);
  });

  it('still overlays agent markers', () => {
    render(
      <CandleChart source={feed()} markers={[{ time: 1000, label: 'buy', bias: 'bullish' }]} />,
    );
    expect(markerCalls.length).toBe(1);
  });

  it('shows a waiting frame when source is null', () => {
    render(<CandleChart title="MU" source={null} />);
    expect(screen.getByText('等待行情…')).toBeTruthy();
    expect(charts.length).toBe(0);
  });

  it('throws when both source and bars are given', () => {
    expect(() =>
      render(
        <CandleChart source={feed()} bars={[{ time: 1000, open: 1, high: 2, low: 0, close: 1 }]} />,
      ),
    ).toThrow('CandleChart: pass either source or bars');
  });

  it('updates in place when the feed changes on the same timeframe', () => {
    const view = render(<CandleChart source={feed()} tf="m5" />);
    const candle = charts[0].series.find((series) => series.kind === 'candle');
    view.rerender(<CandleChart source={feed({ m5: tfData([1000, 1300], 11) })} tf="m5" />);
    expect(charts.length).toBe(1);
    expect(charts[0].removed).toBe(false);
    expect(candle?.updates.map((row) => row.time)).toEqual([1300]);

    view.rerender(<CandleChart source={feed({ m5: tfData([1000, 1300, 1600], 12) })} tf="m5" />);
    expect(charts.length).toBe(1);
    expect(candle?.updates.map((row) => row.time)).toEqual([1300, 1300, 1600]);
  });

  it('redraws data when the chart is recreated for changed overlays', () => {
    const same = feed();
    const view = render(<CandleChart source={same} tf="m5" />);
    view.rerender(
      <CandleChart
        source={same}
        tf="m5"
        markers={[{ time: 1000, label: 'buy', bias: 'bullish' }]}
      />,
    );
    expect(charts.length).toBe(2);
    const candle = charts[1].series.find((series) => series.kind === 'candle');
    expect(candle?.data.map((row) => row.time)).toEqual([1000, 1300]);
  });

  it('recreates the chart when the timeframe changes', () => {
    const view = render(<CandleChart source={feed()} tf="m5" />);
    view.rerender(<CandleChart source={feed()} tf="h1" />);
    expect(charts.length).toBe(2);
    expect(charts[0].removed).toBe(true);
    const candle = charts[1].series.find((series) => series.kind === 'candle');
    expect(candle?.data.map((row) => row.time)).toEqual([3000, 6600]);
  });
});
