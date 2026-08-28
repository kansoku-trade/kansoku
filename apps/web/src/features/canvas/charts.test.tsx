// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('lightweight-charts', () => ({
  createChart: () => {
    throw new Error('jsdom has no chart backend');
  },
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  createSeriesMarkers: () => {},
}));

const { Callout, CandleChart, LineChart, Pill } = await import('@kansoku/canvas');

afterEach(() => {
  cleanup();
});

describe('analysis charts', () => {
  it('falls back to Untitled when a chart has no title', () => {
    render(<LineChart data={[{ x: 'a', y: 1 }]} yUnit="%" />);
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('renders callout and pill copy', () => {
    render(
      <>
        <Callout tone="warn">先等回踩</Callout>
        <Pill tone="up">偏多</Pill>
      </>,
    );
    expect(screen.getByText('先等回踩')).toBeTruthy();
    expect(screen.getByText('偏多')).toBeTruthy();
  });

  it('renders a titled candle chart even without a DOM canvas backend', () => {
    render(
      <CandleChart
        title="MU 15m"
        bars={[{ time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }]}
        volume
      />,
    );
    expect(screen.getByText('MU 15m')).toBeTruthy();
  });
});
