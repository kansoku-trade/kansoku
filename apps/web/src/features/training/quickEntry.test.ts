import { describe, expect, it } from 'vitest';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { meetsRewardRiskFloor, rewardRiskRatio } from './orderDraft';
import { QUICK_ENTRY_REWARD_RISK, quickEntryDraft, swingStopPrice } from './quickEntry';

function bar(index: number, low: number, close: number): RawBar {
  const minute = String(index).padStart(2, '0');
  return {
    time: `2026-01-05T14:${minute}:00.000Z`,
    open: close,
    high: Math.max(close, low) + 2,
    low,
    close,
    volume: 1000,
  };
}

// Two pivot lows: a deeper one at index 2 ($102) and a more recent one at index 6 ($104), so a
// "most recent swing" result is distinguishable from a "lowest low" one.
const REVEALED_LOWS = [110, 108, 102, 106, 107, 109, 104, 106, 108, 110, 109];
const LAST_CLOSE = 112;

// Post-cursor bars carrying a pivot low far below anything the trader has been shown.
const FUTURE_LOWS = [95, 93, 90, 93, 95];

const revealed = REVEALED_LOWS.map((low, i) =>
  bar(i, low, i === REVEALED_LOWS.length - 1 ? LAST_CLOSE : low + 3),
);
const future = FUTURE_LOWS.map((low, i) => bar(REVEALED_LOWS.length + i, low, low + 1));

const REFLECT_AT = 200;

// Reflects the tape so every swing low becomes a swing high at the same distance, which is the
// only way a short fixture exercises the same structure as the long one.
function mirror(bars: RawBar[]): RawBar[] {
  const flip = (value: string | number) => REFLECT_AT - Number(value);
  return bars.map((b) => ({
    ...b,
    open: flip(b.open),
    high: flip(b.low),
    low: flip(b.high),
    close: flip(b.close),
  }));
}

function makeView(bars: { base: RawBar[]; mid?: RawBar[]; top?: RawBar[] }): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'ASSET615.SIM',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: bars.base.length - 1,
    asOf: bars.base.at(-1)!.time,
    bars: { base: bars.base, mid: bars.mid ?? bars.base, top: bars.top ?? bars.base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
    submitted: false,
  };
}

describe('swingStopPrice', () => {
  it('puts a long stop one tick below the most recent swing low, not the lowest one', () => {
    expect(swingStopPrice('long', LAST_CLOSE, revealed)).toBe(103.99);
  });

  it('puts a short stop one tick above the most recent swing high', () => {
    expect(swingStopPrice('short', REFLECT_AT - LAST_CLOSE, mirror(revealed))).toBe(96.01);
  });

  it('falls back to the window extreme when no pivot is confirmed', () => {
    const bars = [bar(0, 99, 101), bar(1, 98, 100), bar(2, 97, 100)];
    expect(swingStopPrice('long', 100, bars)).toBe(96.99);
  });

  it('gives no stop when nothing in the window sits below the entry', () => {
    const bars = [bar(0, 110, 112), bar(1, 106, 108), bar(2, 102, 102)];
    expect(swingStopPrice('long', 102, bars)).toBeNull();
  });

  // Guards the test above it: if the computation were fed the post-cursor bars, this is the
  // answer it would give instead, and it is nowhere near the revealed one.
  it('would return a different stop if it were given post-cursor bars', () => {
    expect(swingStopPrice('long', LAST_CLOSE, [...revealed, ...future])).toBe(89.99);
    expect(swingStopPrice('long', LAST_CLOSE, [...revealed, ...future])).not.toBe(
      swingStopPrice('long', LAST_CLOSE, revealed),
    );
  });
});

describe('quickEntryDraft', () => {
  it('reads only the revealed base series, never a wider ladder series', () => {
    const leaky = makeView({
      base: revealed,
      mid: [...revealed, ...future],
      top: [...revealed, ...future],
    });
    expect(quickEntryDraft(leaky, 'long')?.stop).toBe(103.99);
  });

  it('fills entry, a structural stop and a 2:1 target', () => {
    const draft = quickEntryDraft(makeView({ base: revealed }), 'long');
    expect(draft).toEqual({ direction: 'long', entry: 112, stop: 103.99, target1: 128.03 });
  });

  it('clears the reward-to-risk floor by construction', () => {
    const draft = quickEntryDraft(makeView({ base: revealed }), 'long')!;
    expect(rewardRiskRatio(draft)).toBeGreaterThanOrEqual(QUICK_ENTRY_REWARD_RISK);
    expect(meetsRewardRiskFloor(draft)).toBe(true);
  });

  it('mirrors for a short', () => {
    const draft = quickEntryDraft(makeView({ base: mirror(revealed) }), 'short')!;
    expect(draft.direction).toBe('short');
    expect(draft.stop).toBeGreaterThan(draft.entry);
    expect(draft.target1).toBeLessThan(draft.entry);
    expect(meetsRewardRiskFloor(draft)).toBe(true);
  });

  it('gives no draft when the revealed structure offers no stop', () => {
    const bars = [bar(0, 110, 112), bar(1, 106, 108), bar(2, 102, 102)];
    expect(quickEntryDraft(makeView({ base: bars }), 'long')).toBeNull();
  });
});
