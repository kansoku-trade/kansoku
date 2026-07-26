import { describe, expect, it } from 'vitest';
import { toTs } from '@kansoku/core/analysis/indicators';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  buildTrainerIntradayBuilt,
  TRAINER_PERIOD_TO_CHART_TF,
  trainerAdvancePeriod,
} from './payloadToIntradayBuilt';
import { tfDataOf } from '../charts/intraday/timeframes';

function bar(iso: string, close: number): RawBar {
  return {
    time: iso,
    open: close - 1,
    high: close + 1,
    low: close - 1.5,
    close,
    volume: 1000 + close,
  };
}

const BASE_BARS: RawBar[] = [
  bar('2026-01-05T14:00:00.000Z', 100),
  bar('2026-01-05T14:05:00.000Z', 101),
  bar('2026-01-05T14:10:00.000Z', 102),
  bar('2026-01-05T14:15:00.000Z', 103),
  bar('2026-01-05T14:20:00.000Z', 104),
];

// Deliberately clock-shifted far past BASE_BARS and value-shifted into a
// disjoint range, so if the mid/top tiers ever got wired into the base slot
// (or vice versa) the boundary assertions below would fail loudly instead of
// silently passing.
const MID_BARS: RawBar[] = [
  bar('2026-01-05T20:00:00.000Z', 9001),
  bar('2026-01-05T21:00:00.000Z', 9002),
];

const TOP_BARS: RawBar[] = [
  bar('2026-01-06T14:00:00.000Z', 9101),
  bar('2026-01-07T14:00:00.000Z', 9102),
];

function makeView(overrides?: Partial<TrainerView>): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: BASE_BARS.length - 1,
    asOf: BASE_BARS.at(-1)!.time,
    bars: { base: BASE_BARS, mid: MID_BARS, top: TOP_BARS },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
    ...overrides,
  };
}

describe('buildTrainerIntradayBuilt', () => {
  it('ends the base-timeframe candle array exactly at the cursor bar with no later timestamp', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const candles = tfDataOf(built, tf)?.candles ?? [];
    const cursorTs = toTs(BASE_BARS[view.cursor].time);

    expect(candles).toHaveLength(BASE_BARS.length);
    expect(candles.map((c) => c.time)).toEqual(BASE_BARS.map((b) => toTs(b.time)));
    expect(candles.at(-1)?.time).toBe(cursorTs);
    for (const c of candles) {
      expect(c.time).toBeLessThanOrEqual(cursorTs);
    }
  });

  it('keeps each ladder tier mapped to its own bars, not a neighboring tier', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);

    const midTf = TRAINER_PERIOD_TO_CHART_TF['15m'];
    const topTf = TRAINER_PERIOD_TO_CHART_TF['1h'];
    const midCandles = tfDataOf(built, midTf)?.candles ?? [];
    const topCandles = tfDataOf(built, topTf)?.candles ?? [];

    expect(midCandles.map((c) => c.time)).toEqual(MID_BARS.map((b) => toTs(b.time)));
    expect(topCandles.map((c) => c.time)).toEqual(TOP_BARS.map((b) => toTs(b.time)));
  });

  it('does not fabricate volumes or candles beyond what the payload carried', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const data = tfDataOf(built, tf);

    expect(data?.volumes).toHaveLength(BASE_BARS.length);
    expect(data?.volumes.map((v) => v.value)).toEqual(BASE_BARS.map((b) => Number(b.volume)));
  });
});

describe('trainerAdvancePeriod', () => {
  const LADDER: TrainerView['ladder'] = ['5m', '15m', '1h'];

  it('maps the active chart timeframe back to its ladder period', () => {
    expect(trainerAdvancePeriod(LADDER, 'm5')).toBe('5m');
    expect(trainerAdvancePeriod(LADDER, 'm15')).toBe('15m');
    expect(trainerAdvancePeriod(LADDER, 'h1')).toBe('1h');
  });

  it('falls back to the base period for a timeframe outside the ladder', () => {
    expect(trainerAdvancePeriod(LADDER, 'day')).toBe('5m');
  });
});
