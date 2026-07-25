import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  questionBarsForPeriod,
  questionBasePeriod,
  questionBaseBars,
  questionLadder,
  questionRollupsForPeriod,
} from '../../src/episode/questionLadder.js';
import type { Question } from '../../src/schema/question.js';

const fixturePath = fileURLToPath(
  new URL('../fixtures/datasets/v1/swing/swing-TEST-01.json', import.meta.url),
);
const baseFixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Question;

const oneHourBars = [
  {
    time: '2026-03-20T19:30:00Z',
    open: '101',
    high: '103',
    low: '100',
    close: '102',
    volume: '500000',
  },
];

const fiveMinuteBars = [
  {
    time: '2026-03-20T19:25:00Z',
    open: '100.5',
    high: '101.5',
    low: '100',
    close: '101',
    volume: '80000',
  },
];

const dayRollup = {
  availableAt: '2026-03-23T20:00:00-04:00',
  bar: {
    time: '2026-03-21',
    open: '102',
    high: '104',
    low: '101',
    close: '103',
    volume: '600000',
  },
};

const weekRollup = {
  availableAt: '2026-03-23T20:00:00-04:00',
  bar: {
    time: '2026-03-16',
    open: '99',
    high: '105',
    low: '98',
    close: '103',
    volume: '2000000',
  },
};

const oldShapeQuestion: Question = {
  ...baseFixture,
  fixtures: {
    ...baseFixture.fixtures,
    kline: { ...baseFixture.fixtures.kline, '1h': oneHourBars },
  },
  replay: {
    ...baseFixture.replay,
    rollups: { day: [dayRollup], week: [weekRollup] },
  },
};

describe('questionLadder accessors', () => {
  it('defaults to 1h when basePeriod is absent, old-shape rollups included', () => {
    expect(oldShapeQuestion.replay.basePeriod).toBeUndefined();
    expect(questionBasePeriod(oldShapeQuestion)).toBe('1h');
    expect(questionLadder(oldShapeQuestion)).toEqual(['1h', 'day', 'week']);
    expect(questionBaseBars(oldShapeQuestion)).toEqual(oneHourBars);
  });

  it('reads the 5m ladder for a question with basePeriod 5m', () => {
    const question: Question = {
      ...oldShapeQuestion,
      fixtures: {
        ...oldShapeQuestion.fixtures,
        kline: { ...oldShapeQuestion.fixtures.kline, '5m': fiveMinuteBars },
      },
      replay: { ...oldShapeQuestion.replay, basePeriod: '5m' },
    };
    expect(questionBasePeriod(question)).toBe('5m');
    expect(questionLadder(question)).toEqual(['5m', '15m', '1h']);
    expect(questionBaseBars(question)).toEqual(fiveMinuteBars);
  });

  it('returns rollup entries for a present period and an empty array for an absent one', () => {
    expect(questionRollupsForPeriod(oldShapeQuestion, 'day')).toEqual([dayRollup]);
    expect(questionRollupsForPeriod(oldShapeQuestion, 'week')).toEqual([weekRollup]);
    expect(questionRollupsForPeriod(oldShapeQuestion, '1h')).toEqual([]);
  });

  it('returns bars for a given view period from fixtures.kline', () => {
    expect(questionBarsForPeriod(oldShapeQuestion, '1h')).toEqual(oneHourBars);
    expect(questionBarsForPeriod(oldShapeQuestion, 'day')).toEqual(baseFixture.fixtures.kline.day);
    expect(questionBarsForPeriod(oldShapeQuestion, 'week')).toEqual([]);
  });
});
