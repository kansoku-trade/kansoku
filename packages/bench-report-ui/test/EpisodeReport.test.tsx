import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lw from 'lightweight-charts';
import { EpisodeReport } from '../src/episode/EpisodeReport';
import type {
  EpisodeReportCaseDetailView,
  EpisodeReportCaseRowView,
  EpisodeReportChartPayload,
  EpisodeReportViewData,
} from '../src/types';

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

function caseRow(index: number, model: string): EpisodeReportCaseRowView {
  return {
    index,
    anchorId: `case-${index}`,
    symbol: `SYM${index}`,
    provenanceSymbol: null,
    provenanceDate: null,
    questionId: `Q${index}`,
    model,
    mode: 'blind',
    modeLabel: '盲盘',
    rep: 1,
    direction: 'long',
    directionLabel: '做多',
    firstDecisionLabel: 'B0 首次决策',
    planEntry: 100,
    planStop: 90,
    planTarget: 120,
    actualEntry: 100,
    actualExit: 110,
    tradeCount: 1,
    outcome: 'target',
    outcomeLabel: '止盈',
    netR: 1,
    tone: 'positive',
    mfeR: 1,
    maeR: 0,
    costUsd: 0.1,
    durationLabel: '1.0 s',
    filterSearch: `sym${index} q${index}`,
  };
}

function chartPayload(index: number): EpisodeReportChartPayload {
  const bars = Array.from({ length: 22 }, (_, i) => ({
    time: i + 1,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 100,
  }));
  return {
    id: `trade-chart-${index}`,
    symbol: `SYM${index}`,
    finalBarIndex: 0,
    baseRanges: { h1: bars, day: bars, week: bars },
    replayH1: [],
    snapshotPatches: {},
    markers: { h1: [], day: [], week: [] },
    levels: [
      { title: '计划入场', price: 100, color: '#2563eb' },
      { title: '止损', price: 90, color: '#dc2626' },
      { title: '止盈', price: 120, color: '#059669' },
    ],
    trades: [
      {
        tradeId: 1,
        direction: 'long',
        entry: 105,
        stop: 95,
        target: 125,
        netR: 1,
        times: {
          h1: { decision: 3, entry: 4, exit: 8 },
          day: { decision: 3, entry: 4, exit: 8 },
          week: { decision: 3, entry: 4, exit: 8 },
        },
      },
    ],
    availableTimeframes: ['h1', 'day', 'week'],
    defaultTimeframe: 'h1',
  };
}

function caseDetail(index: number, model: string, withTrade: boolean): EpisodeReportCaseDetailView {
  return {
    index,
    anchorId: `case-${index}`,
    chartId: `trade-chart-${index}`,
    symbol: `SYM${index}`,
    provenanceSymbol: null,
    provenanceLine: null,
    questionId: `Q${index}`,
    model,
    modeLabel: '盲盘',
    outcome: 'target',
    outcomeLabel: '止盈',
    netR: 1,
    tone: 'positive',
    availableTimeframes: ['h1', 'day', 'week'],
    defaultTimeframe: 'h1',
    planFacts: [{ label: '方向', value: '做多', tone: '' }],
    planReasonCategoryLabel: null,
    planReasonSummary: null,
    planRationale: null,
    resultFacts: [{ label: '完整交易', value: '1 笔', tone: '' }],
    trades: withTrade
      ? [
          {
            tradeId: 1,
            direction: 'long',
            directionLabel: '做多',
            decisionBar: 3,
            entryBar: 4,
            exitBar: 8,
            exitLabel: '止盈',
            entryReasonCategoryLabel: null,
            entryReasonSummary: null,
            entryPrice: 105,
            initialStop: 95,
            finalStop: 95,
            target: 125,
            exitPrice: 125,
            netR: 1,
            tone: 'positive',
          },
        ]
      : [],
    actions: [],
    process: { timingLabel: '决策 B0', hasTrace: false, events: [], checks: [] },
  };
}

function makeData(): EpisodeReportViewData {
  return {
    runId: 'Episode 42',
    generatedAt: '2026-07-21',
    gitSha: null,
    header: {
      datasetChip: 'v2',
      modelsChip: 'model-a · model-b',
      modesChip: '盲盘',
      costChip: '0 bps',
      auditChip: { label: '未附加数据审计', tone: 'neutral' },
    },
    summarySubtitle: '2/2 完成',
    metrics: [{ label: '胜率', value: '100%', note: '2 / 2', tone: 'positive' }],
    configStrip: [],
    reasonTable: { coverageLabel: '—', rows: [] },
    modelTable: [],
    filters: {
      models: ['model-a', 'model-b'],
      modes: [{ value: 'blind', label: '盲盘' }],
      outcomes: [{ value: 'target', label: '止盈' }],
    },
    cases: [caseRow(0, 'model-a'), caseRow(1, 'model-b')],
    caseDetails: [caseDetail(0, 'model-a', true), caseDetail(1, 'model-b', false)],
    charts: [chartPayload(0), chartPayload(1)],
    audit: { attached: false, passed: 0, total: 0, checks: [] },
  };
}

describe('EpisodeReport', () => {
  afterEach(() => cleanup());

  it('renders the run id and shell', () => {
    const { container } = render(<EpisodeReport data={makeData()} />);
    expect(container.querySelector('.report-title p')?.textContent).toBe('Episode 42');
    expect(container.querySelectorAll('.case-row')).toHaveLength(2);
    expect(container.querySelectorAll('.trade-case')).toHaveLength(2);
  });

  it('carries the metric tone class on each metric cell', () => {
    const { container } = render(<EpisodeReport data={makeData()} />);
    expect(container.querySelector('.metric')?.classList.contains('positive')).toBe(true);
  });

  it('filters hide both table rows and detail articles', () => {
    const { container } = render(<EpisodeReport data={makeData()} />);
    const count = container.querySelector('[id="visible-count"]');
    expect(count?.textContent).toBe('2 / 2');

    const modelSelect = container.querySelector('[id="model-filter"]') as HTMLSelectElement;
    fireEvent.change(modelSelect, { target: { value: 'model-b' } });

    expect(count?.textContent).toBe('1 / 2');
    const rows = [...container.querySelectorAll<HTMLElement>('.case-row')];
    const articles = [...container.querySelectorAll<HTMLElement>('.trade-case')];
    expect(rows[0].hidden).toBe(true);
    expect(rows[1].hidden).toBe(false);
    expect(articles[0].hidden).toBe(true);
    expect(articles[1].hidden).toBe(false);
  });

  it('marks a ledger item active and passes its trade lines to the chart layer', () => {
    const { container } = render(<EpisodeReport data={makeData()} />);
    const item = container.querySelector('li[data-trade-select]') as HTMLElement;
    expect(item.classList.contains('active')).toBe(false);

    priceLineCalls.length = 0;
    fireEvent.click(item);

    expect(item.classList.contains('active')).toBe(true);
    const solid = priceLineCalls.filter((call) => call.lineStyle === 0);
    expect(solid.map((call) => call.title)).toEqual(['T1 成交', 'T1 止损', 'T1 止盈']);
    const entryLine = solid.find((call) => call.title === 'T1 成交');
    expect(entryLine?.price).toBe(105);
  });
});