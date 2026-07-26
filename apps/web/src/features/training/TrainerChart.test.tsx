// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';

const useDrawingsMock = vi.fn(() => ({}));

vi.mock('../charts/intraday/useIntradayCharts', () => ({
  EMA_COLORS: ['#fff'],
  useIntradayCharts: vi.fn(),
}));

vi.mock('../charts/drawings/useDrawings', () => ({
  useDrawings: useDrawingsMock,
}));

vi.mock('../charts/drawings/DrawingToolbar', () => ({
  DrawingToolbar: () => null,
}));

const { TrainerChart } = await import('./TrainerChart');

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function makeView(): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 101)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
    asOf: base.at(-1)!.time,
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  useDrawingsMock.mockClear();
});

describe('TrainerChart', () => {
  it('never calls the annotations/drawings hook', () => {
    render(<TrainerChart view={makeView()} />);
    expect(useDrawingsMock).not.toHaveBeenCalled();
  });

  it('offers exactly the ladder tiers as period options', () => {
    render(<TrainerChart view={makeView()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['5m', '15m', '1h']);
  });

  it('switches the active tier when a ladder button is clicked', () => {
    render(<TrainerChart view={makeView()} />);
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(screen.getByRole('button', { name: '1h' }).getAttribute('aria-pressed')).toBe('true');
  });
});
