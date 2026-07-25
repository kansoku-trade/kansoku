import { describe, expect, it } from 'vitest';
import { advanceEpisode, createEpisodeState, submitEpisode } from '../../src/episode/engine.js';
import {
  buildEpisodeQuestionView,
  buildEpisodeQuestionViewAtCursor,
} from '../../src/episode/view.js';
import type { EpisodeTradeAction } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';
import type { Submission } from '../../src/schema/submission.js';

function bar(time: string, open: number, high: number, low: number, close: number, volume = 100) {
  return { time, open, high, low, close, volume };
}

const QUESTION: Question = {
  id: 'swing-MULTI-01',
  bank: 'swing',
  symbol: 'MU.US',
  cutoff: '2026-03-20T20:00:00-04:00',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '1h': [bar('2026-03-20T19:30:00Z', 98, 101, 97, 100)],
      'day': [bar('2026-03-19', 95, 99, 94, 98, 1_000), bar('2026-03-20', 98, 102, 97, 100, 1_100)],
      'week': [bar('2026-03-16', 94, 102, 93, 100, 5_000)],
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
    horizonBars: 3,
    bars: [
      bar('2026-03-23T13:30:00Z', 100, 103, 99, 102, 200),
      bar('2026-03-23T14:30:00Z', 102, 105, 101, 104, 300),
      bar('2026-03-24T13:30:00Z', 104, 106, 103, 105, 400),
    ],
    rollups: {
      day: [
        {
          availableAt: '2026-03-23T14:30:00Z',
          bar: bar('2026-03-23', 99.5, 105.5, 98.5, 104.1, 550),
        },
        {
          availableAt: '2026-03-24T13:30:00Z',
          bar: bar('2026-03-24', 103.8, 106.2, 102.8, 105.2, 450),
        },
      ],
      week: [],
    },
  },
};

const SUBMISSION: Submission = {
  direction: 'long',
  anchor: { timeframe: 'h1', time: QUESTION.cutoff, price: 100 },
  entry_plan: { entry: 100, stop: 90, target1: 120 },
  scenarios: [
    { label: '上涨', probability: 60 },
    { label: '回撤', probability: 40 },
  ],
  decision_reason: { category: 'trend_following', summary: '多周期趋势保持向上。' },
  comment: '多周期视图测试',
};

const HOLD: EpisodeTradeAction = {
  type: 'hold',
  reason: { category: 'risk_management', summary: '趋势未失效，继续持有。' },
};

describe('episode rolling multi-timeframe view', () => {
  it('reveals one hourly bar and builds a partial day/week without exposing later bars', () => {
    const submitted = submitEpisode(createEpisodeState(), QUESTION, SUBMISSION);
    const first = advanceEpisode(submitted.state, QUESTION, HOLD);
    const view = buildEpisodeQuestionView(QUESTION, first.state);

    expect(view.fixtures.kline['1h'].map((entry) => entry.time)).toEqual([
      '2026-03-20T19:30:00Z',
      '2026-03-23T13:30:00Z',
    ]);
    expect(view.fixtures.kline['1h']).not.toContainEqual(QUESTION.replay.bars[1]);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({
      time: '2026-03-23',
      open: 100,
      close: 102,
      volume: 200,
    });
    expect(view.fixtures.kline.week.at(-1)).toMatchObject({ time: '2026-03-23', close: 102 });
    expect(view.fixtures.quote).toMatchObject({ last: 102, prev_close: 100 });
    expect(view.cutoff).toBe('2026-03-23T13:30:00Z');
  });

  it('updates the same day candle, then starts a new day while retaining all revealed hours', () => {
    let state = submitEpisode(createEpisodeState(), QUESTION, SUBMISSION).state;
    state = advanceEpisode(state, QUESTION, HOLD).state;
    state = advanceEpisode(state, QUESTION, HOLD).state;
    let view = buildEpisodeQuestionView(QUESTION, state);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({
      time: '2026-03-23',
      open: 99.5,
      high: 105.5,
      low: 98.5,
      close: 104.1,
      volume: 550,
    });
    expect(view.fixtures.quote).toMatchObject({
      last: 104.1,
      open: 99.5,
      high: 105.5,
      low: 98.5,
      volume: 550,
    });

    state = advanceEpisode(state, QUESTION, HOLD).state;
    view = buildEpisodeQuestionView(QUESTION, state);
    expect(view.fixtures.kline['1h']).toHaveLength(4);
    expect(view.fixtures.kline.day.slice(-2).map((entry) => entry.time)).toEqual([
      '2026-03-23',
      '2026-03-24',
    ]);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({
      time: '2026-03-24',
      close: 105.2,
      volume: 450,
    });
    expect(view.fixtures.kline.week.at(-1)).toMatchObject({ time: '2026-03-23', close: 105.2 });
    expect(view.fixtures.indicators).toHaveProperty('day');
    expect(view.fixtures.indicators).toHaveProperty('week');
  });
});

const FIVE_MINUTE_QUESTION: Question = {
  id: 'swing-FIVEMIN-01',
  bank: 'swing',
  symbol: 'MU.US',
  cutoff: '2026-03-23T13:25:00Z',
  layer: 'high-vol-tech',
  adversarial: false,
  fixtures: {
    kline: {
      '5m': [],
      '15m': [],
      '1h': [],
      'day': [bar('2026-03-20', 95, 99, 94, 98, 1_000)],
    },
    indicators: {},
    quote: { last: 98 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: '5m',
    horizonBars: 5,
    bars: [
      bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.5, 100),
      bar('2026-03-23T13:35:00Z', 100.5, 101.5, 100, 101, 110),
      bar('2026-03-23T13:40:00Z', 101, 102, 100.5, 101.5, 120),
      bar('2026-03-23T13:45:00Z', 101.5, 102.5, 101, 102, 130),
      bar('2026-03-23T14:35:00Z', 102, 103, 101.5, 102.5, 140),
    ],
    rollups: {
      '1h': [
        {
          availableAt: '2026-03-23T14:35:00Z',
          bar: bar('2026-03-23T15:30:00Z', 103, 104, 102, 103.5, 200),
        },
        {
          availableAt: '2026-03-23T20:00:00Z',
          bar: bar('2026-03-23T16:30:00Z', 104, 105, 103, 104.5, 210),
        },
      ],
    },
  },
};

describe('episode rolling view for a non-1h base period', () => {
  it('aggregates revealed 5m bars into 15m and 1h tiers, keeping distinct same-day buckets', () => {
    const view = buildEpisodeQuestionViewAtCursor(FIVE_MINUTE_QUESTION, 3);

    expect(view.fixtures.kline['5m']).toHaveLength(4);
    expect(view.fixtures.kline['15m']).toHaveLength(2);
    expect(view.fixtures.kline['15m'].map((entry) => entry.time)).toEqual([
      '2026-03-23T13:30:00Z',
      '2026-03-23T13:45:00Z',
    ]);
    expect(view.fixtures.kline['1h']).toHaveLength(1);
    expect(view.fixtures.kline['1h'][0]).toMatchObject({
      time: '2026-03-23T13:30:00Z',
      open: 100,
      high: 102.5,
      low: 99,
      close: 102,
      volume: 460,
    });
    expect(view.fixtures.kline.day).toEqual(FIVE_MINUTE_QUESTION.fixtures.kline.day);
  });

  it('opens a new 1h bucket and applies only rollups visible as of the cursor', () => {
    const view = buildEpisodeQuestionViewAtCursor(FIVE_MINUTE_QUESTION, 4);

    expect(view.cutoff).toBe('2026-03-23T14:35:00Z');
    expect(view.fixtures.kline['15m']).toHaveLength(3);
    expect(view.fixtures.kline['15m'].map((entry) => entry.time)).toEqual([
      '2026-03-23T13:30:00Z',
      '2026-03-23T13:45:00Z',
      '2026-03-23T14:35:00Z',
    ]);
    expect(view.fixtures.kline['1h'].map((entry) => entry.time)).toEqual([
      '2026-03-23T13:30:00Z',
      '2026-03-23T14:35:00Z',
      '2026-03-23T15:30:00Z',
    ]);
    expect(view.fixtures.kline['1h']).not.toContainEqual(
      expect.objectContaining({ time: '2026-03-23T16:30:00Z' }),
    );
    expect(view.fixtures.indicators).toHaveProperty('15m');
    expect(view.fixtures.indicators).toHaveProperty('1h');
  });

  it('omits the base tier key when nothing has been revealed and no fixture bars exist', () => {
    const { '5m': _omitted, ...klineWithoutBase } = FIVE_MINUTE_QUESTION.fixtures.kline;
    const noBaseFixtureQuestion: Question = {
      ...FIVE_MINUTE_QUESTION,
      fixtures: { ...FIVE_MINUTE_QUESTION.fixtures, kline: klineWithoutBase },
    };
    const view = buildEpisodeQuestionViewAtCursor(noBaseFixtureQuestion, -1);

    expect(view.fixtures.kline).not.toHaveProperty('5m');
    expect(view.fixtures.kline['15m']).toEqual([]);
    expect(view.fixtures.kline['1h']).toEqual([]);
  });
});
