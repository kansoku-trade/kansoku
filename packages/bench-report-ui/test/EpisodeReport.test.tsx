import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lw from 'lightweight-charts';
import { EpisodeReport } from '../src/episode/EpisodeReport';
import { makeEpisodeViewData } from './fixtures';

vi.mock('lightweight-charts', () => {
  const priceLineCalls: Array<Record<string, unknown>> = [];
  const series = {
    setData: () => {},
    attachPrimitive: () => {},
    createPriceLine: (options: Record<string, unknown>) => {
      priceLineCalls.push(options);
      return {};
    },
  };
  const chart = {
    addSeries: () => series,
    timeScale: () => ({
      setVisibleLogicalRange: () => {},
      timeToCoordinate: () => null,
      options: () => ({ barSpacing: 6 }),
    }),
    panes: () => [{}, { setHeight: () => {} }],
    subscribeCrosshairMove: () => {},
    remove: () => {},
  };
  return {
    createChart: () => chart,
    createSeriesMarkers: () => {},
    CandlestickSeries: 'candles',
    HistogramSeries: 'hist',
    LineSeries: 'line',
    LineStyle: { Dashed: 2, Solid: 0 },
    CrosshairMode: { MagnetOHLC: 3 },
    __priceLineCalls: priceLineCalls,
  };
});

const priceLineCalls = (lw as unknown as { __priceLineCalls: Array<Record<string, unknown>> })
  .__priceLineCalls;

describe('EpisodeReport', () => {
  afterEach(() => cleanup());

  it('renders the run id and shell', () => {
    const { container } = render(<EpisodeReport data={makeEpisodeViewData()} />);
    expect(container.querySelector('.report-title p')?.textContent).toBe('Episode 42');
    expect(container.querySelectorAll('.case-row')).toHaveLength(2);
    expect(container.querySelectorAll('.trade-case')).toHaveLength(2);
  });

  it('carries the metric tone class on each metric cell', () => {
    const { container } = render(<EpisodeReport data={makeEpisodeViewData()} />);
    expect(container.querySelector('.metric')?.classList.contains('positive')).toBe(true);
  });

  it('filters hide both table rows and detail articles', () => {
    const { container } = render(<EpisodeReport data={makeEpisodeViewData()} />);
    const count = container.querySelector('[id="visible-count"]');
    expect(count?.textContent).toBe('2 / 2');

    const search = container.querySelector('[id="case-search"]') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'sym1' } });

    expect(count?.textContent).toBe('1 / 2');
    const rows = [...container.querySelectorAll<HTMLElement>('.case-row')];
    const articles = [...container.querySelectorAll<HTMLElement>('.trade-case')];
    expect(rows[0].hidden).toBe(true);
    expect(rows[1].hidden).toBe(false);
    expect(articles[0].hidden).toBe(true);
    expect(articles[1].hidden).toBe(false);
  });

  it('filters by model through the select popup', async () => {
    const { container } = render(<EpisodeReport data={makeEpisodeViewData()} />);
    const count = container.querySelector('[id="visible-count"]');

    fireEvent.click(screen.getByRole('combobox', { name: '模型' }));
    const option = await screen.findByRole('option', { name: 'model-b' });
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.pointerUp(option, { pointerType: 'mouse' });
    fireEvent.click(option);

    expect(count?.textContent).toBe('1 / 2');
    const rows = [...container.querySelectorAll<HTMLElement>('.case-row')];
    expect(rows[0].hidden).toBe(true);
    expect(rows[1].hidden).toBe(false);
  });

  it('marks a ledger item active and passes its trade lines to the chart layer', () => {
    const { container } = render(<EpisodeReport data={makeEpisodeViewData()} />);
    const item = container.querySelector('[data-trade-select]') as HTMLElement;
    expect(item.classList.contains('active')).toBe(false);

    priceLineCalls.length = 0;
    fireEvent.click(item);

    expect(item.classList.contains('active')).toBe(true);
    const solid = priceLineCalls.filter((call) => call.lineStyle === 0);
    expect(solid.map((call) => call.title)).toEqual(['T1 成交', 'T1 止损', 'T1 止盈']);
    const entryLine = solid.find((call) => call.title === 'T1 成交');
    expect(entryLine?.price).toBe(105);
  });

  it('clears an active trade selection when a process node is clicked', () => {
    const data = makeEpisodeViewData();
    data.caseDetails[0].process = {
      timingLabel: '决策 B0',
      hasTrace: true,
      events: [
        {
          sequence: 1,
          tool: 'fetch_kline',
          label: '取数',
          detail: 'h1',
          kind: 'data',
          barLabel: 'B5',
          transitionLabel: 'B0 → B5',
          timeframe: 'h1',
          durationLabel: null,
          snapshotBar: 5,
          isError: false,
        },
      ],
      checks: [{ label: '取数', pass: true, detail: 'ok' }],
    };
    const { container } = render(<EpisodeReport data={data} />);

    const tradeItem = container.querySelector('[data-trade-select]') as HTMLElement;
    fireEvent.click(tradeItem);
    expect(tradeItem.classList.contains('active')).toBe(true);

    priceLineCalls.length = 0;
    const node = container.querySelector('.process-node') as HTMLElement;
    fireEvent.click(node);

    expect(tradeItem.classList.contains('active')).toBe(false);
    expect(priceLineCalls.length).toBeGreaterThan(0);
    expect(priceLineCalls.every((call) => call.lineStyle === 2)).toBe(true);
  });
});