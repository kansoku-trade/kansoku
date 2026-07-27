import { describe, expect, it } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { replayBands } from './replayBands';

function bar(iso: string): RawBar {
  return { time: iso, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };
}

const BASE = [
  bar('2026-01-05T14:00:00.000Z'),
  bar('2026-01-05T14:05:00.000Z'),
  bar('2026-01-05T14:10:00.000Z'),
  bar('2026-01-05T14:15:00.000Z'),
  bar('2026-01-05T14:20:00.000Z'),
];

function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: 1,
    asOf: BASE.at(-1)!.time,
    bars: { base: BASE, mid: BASE, top: BASE },
    quote: {},
    phase: 'terminal',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 0,
    terminal: true,
    result: null,
    ...overrides,
  };
}

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('replayBands', () => {
  it('splits base bars at the cursor: the last cursor+1 bars are the ones stepped through', () => {
    const bands = replayBands(makeView({ cursor: 1 }), null);
    expect(bands).toEqual([
      {
        kind: 'given',
        startTime: 0,
        endTime: sec('2026-01-05T14:10:00.000Z'),
      },
      {
        kind: 'played',
        startTime: sec('2026-01-05T14:15:00.000Z'),
        endTime: sec('2026-01-05T14:20:00.000Z'),
      },
    ]);
  });

  it('emits only a given band before the first step (cursor -1)', () => {
    const bands = replayBands(makeView({ cursor: -1 }), null);
    expect(bands.map((b) => b.kind)).toEqual(['given']);
    expect(bands[0].endTime).toBe(sec('2026-01-05T14:20:00.000Z'));
  });

  // The 15m/1h tiers carry bars older than base[0]; anchoring the given band to base[0] would
  // leave those untinted, reading as a fourth段 the trainer has no such thing as.
  it('leaves the given band open on the left so older tier bars are still covered', () => {
    expect(replayBands(makeView({ cursor: 1 }), null)[0].startTime).toBe(0);
  });

  it('emits only a played band when every base bar was stepped through', () => {
    const bands = replayBands(makeView({ cursor: BASE.length - 1 }), null);
    expect(bands.map((b) => b.kind)).toEqual(['played']);
    expect(bands[0].startTime).toBe(sec('2026-01-05T14:00:00.000Z'));
  });

  it('appends the epilogue band only once the epilogue is revealed', () => {
    const epilogue = [bar('2026-01-05T14:25:00.000Z'), bar('2026-01-05T14:30:00.000Z')];
    expect(replayBands(makeView(), null).map((b) => b.kind)).toEqual(['given', 'played']);
    expect(replayBands(makeView(), []).map((b) => b.kind)).toEqual(['given', 'played']);
    const bands = replayBands(makeView(), epilogue);
    expect(bands.map((b) => b.kind)).toEqual(['given', 'played', 'epilogue']);
    expect(bands[2]).toEqual({
      kind: 'epilogue',
      startTime: sec('2026-01-05T14:25:00.000Z'),
      endTime: sec('2026-01-05T14:30:00.000Z'),
    });
  });

  it('returns nothing for a case with no bars', () => {
    const empty = makeView({ bars: { base: [], mid: [], top: [] }, cursor: -1 });
    expect(replayBands(empty, null)).toEqual([]);
  });
});
