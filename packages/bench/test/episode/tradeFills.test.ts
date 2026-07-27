import { describe, expect, it } from 'vitest';
import type { EpisodeAnswer, EpisodeClosedTrade } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';
import { buildCaseDetail } from '../../src/episode/caseDetail.js';
import { buildChartPayload } from '../../src/episode/chartPayload.js';
import { ACTION_LABELS } from '../../src/episode/labels.js';
import { buildRows, tradeEntryFills, tradeExitFills } from '../../src/episode/rows.js';

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

const question: Question = {
  id: 'swing-TRAIN-01',
  bank: 'swing',
  symbol: 'TRAIN.US',
  cutoff: '2026-03-25T16:00:00-04:00',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '1h': [bar('2026-03-25T19:30:00Z', 99, 101, 98, 100)],
      'day': [bar('2026-03-25T04:00:00Z', 99, 101, 98, 100)],
      'week': [bar('2026-03-23', 99, 101, 98, 100)],
    },
    indicators: {},
    quote: { last: 100 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '1h',
    entryExpiryBars: 21,
    horizonSessions: 1,
    horizonBars: 4,
    bars: [
      bar('2026-03-26T13:30:00Z', 100, 101, 99, 100),
      bar('2026-03-26T14:30:00Z', 100, 100, 95, 96),
      bar('2026-03-26T15:30:00Z', 96, 107, 96, 106),
      bar('2026-03-26T16:30:00Z', 106, 106, 101, 102),
    ],
    rollups: { day: [], week: [] },
  },
};

const singleFillTrade: EpisodeClosedTrade = {
  tradeId: 1,
  direction: 'long',
  decisionBar: 1,
  decisionTime: '2026-03-26T13:30:00Z',
  entry: { time: '2026-03-26T13:30:00Z', price: 100 },
  exit: { time: '2026-03-26T15:30:00Z', price: 106 },
  exitReason: 'target',
  initialStop: 98,
  finalStop: 98,
  target: 106,
  initialRisk: 2,
  grossR: 3,
  frictionR: 0,
  netR: 3,
  mfeR: 3,
  maeR: 2.5,
  holdingBars: 3,
};

const scaledTrade: EpisodeClosedTrade = {
  ...singleFillTrade,
  entry: { time: '2026-03-26T13:30:00Z', price: 98 },
  exit: { time: '2026-03-26T16:30:00Z', price: 104 },
  exitReason: 'stop',
  lots: [
    { time: '2026-03-26T13:30:00Z', price: 100, size: 0.5 },
    { time: '2026-03-26T14:30:00Z', price: 96, size: 0.5 },
  ],
  exits: [
    { time: '2026-03-26T15:30:00Z', price: 106, size: 0.5, reason: 'target' },
    { time: '2026-03-26T16:30:00Z', price: 102, size: 0.5, reason: 'stop' },
  ],
  netR: 3,
};

function answerWith(trade: EpisodeClosedTrade): EpisodeAnswer {
  return {
    questionId: question.id,
    symbol: question.symbol,
    layer: question.layer,
    model: 'test/model',
    mode: 'blind',
    rep: 0,
    status: 'completed',
    initialSubmission: {
      direction: 'long',
      anchor: { timeframe: 'h1', time: '2026-03-25T19:30:00Z', price: 100 },
      entry_plan: { entry: 100, stop: 98, target1: 106, rationale: '突破。' },
      scenarios: [{ label: '上涨', probability: 100 }],
      decision_reason: { category: 'breakout', summary: '突破前高。' },
      comment: '测试',
    },
    result: {
      terminationReason: 'horizon',
      direction: 'long',
      entry: trade.entry,
      exit: trade.exit,
      initialRisk: trade.initialRisk,
      grossR: trade.grossR,
      frictionR: trade.frictionR,
      netR: trade.netR,
      mfeR: trade.mfeR,
      maeR: trade.maeR,
      holdingBars: trade.holdingBars,
      steps: 2,
      decisionBar: 1,
      decisionTime: trade.decisionTime,
      observationBars: 1,
      trades: [trade],
      tradeCount: 1,
      winCount: 1,
      lossCount: 0,
      maxDrawdownR: 0,
      actions: [
        {
          step: 1,
          at: question.cutoff,
          effectiveBarTime: '2026-03-26T13:30:00Z',
          action: { type: 'observe' },
        },
        {
          step: 2,
          tradeId: 1,
          at: '2026-03-26T14:30:00Z',
          effectiveBarTime: '2026-03-26T14:30:00Z',
          action: {
            type: 'add',
            size: 0.5,
            reason: { category: 'pullback', summary: '回踩不破，补到满仓。' },
          },
        },
      ],
    },
    metrics: { durationMs: 1_000, costUsd: 0.01, toolCalls: 2, inputTokens: 0, outputTokens: 0 },
    traceRef: 'trace-1',
  };
}

function detailFor(trade: EpisodeClosedTrade) {
  const [row] = buildRows([answerWith(trade)], new Map([[question.id, question]]));
  return buildCaseDetail(row, 0, ['h1', 'day', 'week'], question.replay.bars.length);
}

function markersFor(trade: EpisodeClosedTrade) {
  const [row] = buildRows([answerWith(trade)], new Map([[question.id, question]]));
  return buildChartPayload(row, 0)!.markers.h1.map((marker) => marker.text);
}

describe('ACTION_LABELS', () => {
  it('names the sizing actions instead of leaking the raw wire type', () => {
    expect(ACTION_LABELS.add).toBe('加仓');
    expect(ACTION_LABELS.reduce).toBe('减仓');
  });

  it('labels a recorded add in the case detail', () => {
    const detail = detailFor(scaledTrade);
    expect(detail.actions.at(-1)).toMatchObject({ actionType: 'add', actionLabel: '加仓' });
  });
});

describe('tradeEntryFills / tradeExitFills', () => {
  it('reads the recorded lots and exits', () => {
    expect(tradeEntryFills(scaledTrade).map((fill) => fill.price)).toEqual([100, 96]);
    expect(tradeExitFills(scaledTrade).map((fill) => fill.reason)).toEqual(['target', 'stop']);
  });

  it('reads a pre-sizing trade as one full-size fill each way', () => {
    expect(tradeEntryFills(singleFillTrade)).toEqual([
      { time: '2026-03-26T13:30:00Z', price: 100, size: 1 },
    ]);
    expect(tradeExitFills(singleFillTrade)).toEqual([
      { time: '2026-03-26T15:30:00Z', price: 106, size: 1, reason: 'target' },
    ]);
  });
});

describe('trade ledger fills', () => {
  it('lists each lot and each exit with its bar, price and size', () => {
    const [ledger] = detailFor(scaledTrade).trades;
    expect(ledger.fills).toEqual([
      { kind: 'entry', label: '建仓', barLabel: 'B1', priceLabel: '100.00', sizeLabel: '50%' },
      { kind: 'entry', label: '加仓', barLabel: 'B2', priceLabel: '96.00', sizeLabel: '50%' },
      { kind: 'exit', label: '止盈', barLabel: 'B3', priceLabel: '106.00', sizeLabel: '50%' },
      { kind: 'exit', label: '止损', barLabel: 'B4', priceLabel: '102.00', sizeLabel: '50%' },
    ]);
  });

  it('still produces a fill pair for a pre-sizing trade', () => {
    const [ledger] = detailFor(singleFillTrade).trades;
    expect(
      ledger.fills.map((fill) => `${fill.label} ${fill.priceLabel} ${fill.sizeLabel}`),
    ).toEqual(['建仓 100.00 100%', '止盈 106.00 100%']);
  });
});

describe('chart markers', () => {
  // The averaged entry (98) and exit (104) were never traded on any bar. A marker carrying them
  // would put a price on the chart that the tape never printed.
  it('marks every lot and every exit at its own bar and price', () => {
    const texts = markersFor(scaledTrade);
    expect(texts).toContain('T1 成交 100.00 50% · S 98.00 · T 106.00');
    expect(texts).toContain('T1 加仓 96.00 50%');
    expect(texts).toContain('T1 止盈 106.00 50%');
    expect(texts).toContain('T1 止损 102.00 50% · +3.00R');
    expect(texts.join('|')).not.toContain('成交 98.00');
    expect(texts.join('|')).not.toContain('104.00');
  });

  // Every historical answer renders through this path; adding a size to a trade that only ever had
  // one is noise on the whole corpus.
  it('leaves a single-fill trade labelled exactly as before, with no size annotation', () => {
    const texts = markersFor(singleFillTrade);
    expect(texts).toContain('T1 成交 100.00 · S 98.00 · T 106.00');
    expect(texts).toContain('T1 止盈 106.00 · +3.00R');
    expect(texts.join('|')).not.toContain('100%');
  });
});
