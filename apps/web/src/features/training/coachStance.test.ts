import { describe, expect, it } from 'vitest';
import type { TrainerCoachCall } from '@kansoku/pro-api';
import { coachBarLabel, coachDisagrees, coachPlanLine } from './coachStance';

function call(overrides: Partial<TrainerCoachCall> = {}): TrainerCoachCall {
  return {
    id: 'coach-1',
    cursor: 7,
    step: 8,
    askedAt: '2026-01-05T14:35:00.000Z',
    model: 'test/model',
    humanBefore: { direction: 'long', entry: 101, stop: 99, target: 105 },
    ai: {
      direction: 'short',
      anchor: { timeframe: 'm5', time: '2026-01-05T14:35:00.000Z', price: 103 },
      entry_plan: { entry: 103, stop: 105, target1: 99 },
      scenarios: [],
      comment: '冲高未站稳前高',
    },
    verdict: null,
    annotation: null,
    ...overrides,
  };
}

describe('coachBarLabel', () => {
  it('names the bar the question was asked on', () => {
    expect(coachBarLabel(0)).toBe('B0');
    expect(coachBarLabel(37)).toBe('B37');
  });

  // The engine sits at -1 until the first bar is stepped into, and the AI is reachable from the
  // open — so this index is reachable and must not print as a bar the timeline does not have.
  it('says 开局 rather than pointing at a bar that does not exist', () => {
    expect(coachBarLabel(-1)).toBe('开局');
  });
});

describe('coachDisagrees', () => {
  it('is true only when both sides took a side and they differ', () => {
    expect(coachDisagrees(call())).toBe(true);
  });

  it('is false when they agreed', () => {
    expect(coachDisagrees(call({ ai: { ...call().ai, direction: 'long' } }))).toBe(false);
  });

  it('is false when the trader had taken no side to disagree with', () => {
    expect(coachDisagrees(call({ humanBefore: null }))).toBe(false);
  });
});

describe('coachPlanLine', () => {
  it('lays the three prices out in entry / stop / target order', () => {
    expect(coachPlanLine(call()).prices).toBe('103 / 105 / 99');
  });

  it('withholds the prices when the AI filed no plan', () => {
    expect(coachPlanLine(call({ ai: { ...call().ai, entry_plan: undefined } })).prices).toBeNull();
  });
});
