import { describe, expect, it } from 'vitest';
import type { IntradayPrediction } from '@kansoku/shared/types';
import { validatePrediction } from '../src/analysis/predictionRules.js';

const validPrediction: IntradayPrediction = {
  direction: 'long',
  anchor: { timeframe: 'm5', time: '2026-07-05T15:00:00Z', price: 100 },
  entry_plan: { entry: 100, stop: 97, target1: 104, target2: 108 },
  scenarios: [
    { label: '上破', probability: 50 },
    { label: '震荡', probability: 30 },
    { label: '下破', probability: 20 },
  ],
};

describe('validatePrediction', () => {
  it('passes a coherent long plan', () => {
    expect(validatePrediction(validPrediction)).toEqual([]);
  });

  it('rejects a long plan whose stop sits above the entry', () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 103, target1: 104 },
    });
    expect(issues.join('')).toContain('止损必须低于入场价');
  });

  it('rejects a plan whose T1 reward is below 1:1', () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 96, target1: 102 },
    });
    expect(issues.join('')).toContain('不足 1:1');
  });

  it('rejects a short plan whose target1 sits above the entry', () => {
    const issues = validatePrediction({
      ...validPrediction,
      direction: 'short',
      entry_plan: { entry: 100, stop: 103, target1: 105 },
    });
    expect(issues.join('')).toContain('做空 target1 必须低于入场价');
  });

  it('rejects scenario probabilities that do not sum to ~100', () => {
    const issues = validatePrediction({
      ...validPrediction,
      scenarios: [
        { label: '上破', probability: 0.5 },
        { label: '震荡', probability: 0.3 },
        { label: '下破', probability: 0.2 },
      ],
    });
    expect(issues.join('')).toContain('约为 100');
  });

  it('resolves pct-based targets before judging R/R', () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 98, target1_pct: 1 },
    });
    expect(issues.join('')).toContain('不足 1:1');
  });

  it('passes a neutral call with a range zone and no entry plan', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    expect(
      validatePrediction({
        ...rest,
        direction: 'neutral',
        range_plan: {
          low: 97,
          high: 104,
          long_tactic: '回踩 97 收稳做多',
          short_tactic: '反抽 104 受阻做空',
        },
      }),
    ).toEqual([]);
  });

  it('passes a neutral call using the range_bound_plan spelling', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    expect(
      validatePrediction({
        ...rest,
        direction: 'neutral',
        range_bound_plan: {
          low: 97,
          high: 104,
          long_tactic: '回踩 97 收稳做多',
          short_tactic: '反抽 104 受阻做空',
        },
      }),
    ).toEqual([]);
  });

  it('rejects a neutral call that carries an entry plan', () => {
    const issues = validatePrediction({
      ...validPrediction,
      direction: 'neutral',
      range_plan: { low: 97, high: 104 },
      entry_plan: { entry: 100, stop: 103, target1: 99 },
    });
    expect(issues.join('')).toContain('不应提交 entry_plan');
  });

  it('rejects a neutral call without a range zone', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest, direction: 'neutral' });
    expect(issues.join('')).toContain('箱体下沿 low / 上沿 high');
  });

  it('rejects a neutral zone that does not contain the anchor price', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({
      ...rest,
      direction: 'neutral',
      range_plan: { low: 104, high: 110 },
    });
    expect(issues.join('')).toContain('包住锚点价格');
  });

  it('rejects a directional call without an entry plan', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest, direction: 'long' });
    expect(issues.join('')).toContain('必须给出 entry_plan');
  });

  it('rejects a directional plan without any target', () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 97 },
    });
    expect(issues.join('')).toContain('必须给出 target1 或 target1_pct');
  });

  it('rejects a missing anchor', () => {
    const { anchor: _anchor, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest });
    expect(issues.join('')).toContain('anchor 必填');
  });

  it('rejects an anchor missing a price', () => {
    const issues = validatePrediction({
      ...validPrediction,
      anchor: { timeframe: 'm5', time: '2026-07-05T15:00:00Z' } as IntradayPrediction['anchor'],
    });
    expect(issues.join('')).toContain('anchor 必填');
  });

  it('rejects missing scenarios', () => {
    const { scenarios: _scenarios, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest });
    expect(issues.join('')).toContain('scenarios 必须给 2 到 4 个情景');
  });

  it('rejects a scenario count outside 2-4', () => {
    const issues = validatePrediction({
      ...validPrediction,
      scenarios: [{ label: '上破', probability: 100 }],
    });
    expect(issues.join('')).toContain('scenarios 必须给 2 到 4 个情景');
  });

  it('rejects a missing direction', () => {
    const { direction: _direction, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest } as IntradayPrediction);
    expect(issues.join('')).toContain('direction 必须是 long / short / neutral');
  });

  it('rejects a garbage direction', () => {
    const issues = validatePrediction({
      ...validPrediction,
      direction: 'up' as IntradayPrediction['direction'],
    });
    expect(issues.join('')).toContain('direction 必须是 long / short / neutral');
  });

  it('rejects string-typed entry/stop instead of silently passing', () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: {
        entry: '100' as unknown as number,
        stop: '97' as unknown as number,
        target1: 104,
      },
    });
    expect(issues.join('')).toContain('entry_plan 的 entry / stop 必须是数字');
  });

  it('handles a stringly-typed neutral zone by coercing like zoneFromPrediction', () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    expect(
      validatePrediction({
        ...rest,
        direction: 'neutral',
        range_plan: { low: '97' as unknown as number, high: '104' as unknown as number },
      }),
    ).toEqual([]);
  });
});
