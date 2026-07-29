import { describe, expect, it } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { replayBands, replayDivider } from './replayBands';

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
    submitted: false,
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

describe('replayDivider', () => {
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  // bars.base is [question bars, revealed replay bars] with the revealed run exactly cursor + 1
  // long, so with 5 bars and cursor 1 the last two are replay and the boundary sits ahead of
  // index 3.
  it('anchors ahead of the first replayed bar', () => {
    expect(replayDivider(makeView({ cursor: 1 }))).toEqual({
      time: sec('2026-01-05T14:15:00.000Z'),
      edge: 'before',
    });
  });

  // The whole point of the line: it names a fixed bar, so it must not creep as bars are revealed.
  // Each step appends one bar and raises the cursor by one, leaving the question count unchanged.
  it('stays on the same bar as the episode advances', () => {
    const before = replayDivider(makeView({ cursor: 1 }));
    const after = replayDivider(
      makeView({
        cursor: 3,
        bars: {
          base: [...BASE, bar('2026-01-05T14:25:00.000Z'), bar('2026-01-05T14:30:00.000Z')],
          mid: BASE,
          top: BASE,
        },
      }),
    );
    expect(after).toEqual(before);
  });

  // Nothing has been stepped yet, so every visible bar is the question and there is no replayed bar
  // to sit ahead of — the line goes off the trailing edge of the last one instead.
  it('falls back to the trailing edge of the final bar before the first step', () => {
    expect(replayDivider(makeView({ cursor: -1 }))).toEqual({
      time: sec('2026-01-05T14:20:00.000Z'),
      edge: 'after',
    });
  });

  it('anchors on the very first bar when every bar has been replayed', () => {
    expect(replayDivider(makeView({ cursor: BASE.length - 1 }))).toEqual({
      time: sec('2026-01-05T14:00:00.000Z'),
      edge: 'before',
    });
  });

  it('has nowhere to sit with no bars at all', () => {
    expect(
      replayDivider(makeView({ cursor: -1, bars: { base: [], mid: [], top: [] } })),
    ).toBeNull();
  });
});
