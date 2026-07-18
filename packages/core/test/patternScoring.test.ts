import { describe, expect, it } from "vitest";
import type { CandlePattern } from "../../shared/types.js";
import {
  enrichCandlePatterns,
  offSessionSignalKeeper,
  SCORE_DOT_MARKER,
  type PatternScoringContext,
} from "../src/services/patternScoring.js";

// 2026-06-01T14:30:00Z = 10:30 ET Monday (regular session)
const REGULAR_BASE = Date.parse("2026-06-01T14:30:00.000Z") / 1000;
// 2026-05-31 is a Sunday — every bar classifies as overnight regardless of index
const OVERNIGHT_BASE = Date.parse("2026-05-31T14:30:00.000Z") / 1000;
const STEP = 300;

function makeCtx(n: number, base = REGULAR_BASE): PatternScoringContext {
  return {
    highs: Array(n).fill(101),
    lows: Array(n).fill(99),
    closes: Array(n).fill(100),
    vols: Array(n).fill(1000),
    timesTs: Array.from({ length: n }, (_, i) => base + i * STEP),
    emaArrs: [],
    swingHighs: [],
    swingLows: [],
    fvgZones: [],
  };
}

function weakBullish(ctx: PatternScoringContext, i: number, overrides: Partial<CandlePattern> = {}): CandlePattern {
  return {
    kind: "hammer",
    time: ctx.timesTs[i],
    price: ctx.lows[i],
    bias: "bullish",
    label: "锤子线",
    implication: "",
    span: 1,
    confirm_price: 100.5,
    invalidate_price: 99,
    ...overrides,
  };
}

describe("enrichCandlePatterns", () => {
  it("drops weak patterns in the overnight session and keeps strong ones with a penalty", () => {
    const ctx = makeCtx(40, OVERNIGHT_BASE);
    const weak = weakBullish(ctx, 30);
    const strong: CandlePattern = { ...weakBullish(ctx, 30), kind: "bullish_engulfing", label: "看涨吞没", span: 2 };

    expect(enrichCandlePatterns([weak], ctx)).toHaveLength(0);

    const [kept] = enrichCandlePatterns([strong], ctx);
    expect(kept).toBeDefined();
    // strong base 55 - overnight 25 + relvol 1.0x bonus 5 = 35
    expect(kept.score).toBe(35);
    expect(kept.score).toBeLessThan(SCORE_DOT_MARKER);
  });

  it("rewards high relative volume and punishes thin volume", () => {
    const base = makeCtx(40);
    // flat volume → relVol 1.0 → weak 30 + regular 10 + 5 = 45
    expect(enrichCandlePatterns([weakBullish(base, 30)], base)[0].score).toBe(45);

    const hot = makeCtx(40);
    hot.vols[30] = 2000;
    expect(enrichCandlePatterns([weakBullish(hot, 30)], hot)[0].score).toBe(55);

    const thin = makeCtx(40);
    thin.vols[30] = 500;
    expect(enrichCandlePatterns([weakBullish(thin, 30)], thin)[0].score).toBe(25);
  });

  it("adds a bonus when the pattern extreme sits near a key level", () => {
    const ctx = makeCtx(40);
    ctx.swingLows = [{ time: ctx.timesTs[5], price: 99.2 }];
    // |99 - 99.2| = 0.2 ≤ 0.5 × avgRange(2) → +15 on top of 45
    expect(enrichCandlePatterns([weakBullish(ctx, 30)], ctx)[0].score).toBe(60);

    const far = makeCtx(40);
    far.swingLows = [{ time: far.timesTs[5], price: 97 }];
    expect(enrichCandlePatterns([weakBullish(far, 30)], far)[0].score).toBe(45);
  });

  it("walks the confirmation state machine off the next three closes", () => {
    const confirmed = makeCtx(40);
    confirmed.closes[31] = 101;
    expect(enrichCandlePatterns([weakBullish(confirmed, 30)], confirmed)[0].status).toBe("confirmed");

    const invalidated = makeCtx(40);
    invalidated.closes[31] = 98.5;
    expect(enrichCandlePatterns([weakBullish(invalidated, 30)], invalidated)[0].status).toBe("invalidated");

    const expired = makeCtx(40);
    expect(enrichCandlePatterns([weakBullish(expired, 30)], expired)[0].status).toBe("expired");

    const pending = makeCtx(32);
    expect(enrichCandlePatterns([weakBullish(pending, 30)], pending)[0].status).toBe("pending");
  });

  it("leaves neutral patterns out of the state machine", () => {
    const ctx = makeCtx(40);
    const doji: CandlePattern = {
      kind: "doji",
      time: ctx.timesTs[30],
      price: 100,
      bias: "neutral",
      label: "十字星",
      implication: "",
      span: 1,
      confirm_price: null,
      invalidate_price: null,
    };
    const [out] = enrichCandlePatterns([doji], ctx);
    expect(out.status).toBeNull();
    // neutral base 20 + regular 10 + relvol 5 = 35
    expect(out.score).toBe(35);
  });

  it("attaches per-kind follow-through stats once the sample reaches eight", () => {
    const ctx = makeCtx(100);
    const patterns: CandlePattern[] = [];
    for (let k = 0; k < 8; k++) {
      const i = 10 + k * 5;
      ctx.closes[i + 1] = 101; // confirm (> 100.5)
      // win for even k: within 5 bars close moves ≥ 0.5 × avgRange(2) from the confirm close
      if (k % 2 === 0) ctx.closes[i + 2] = 102.2;
      patterns.push(weakBullish(ctx, i));
    }
    const out = enrichCandlePatterns(patterns, ctx);
    expect(out[0].stats).toEqual({ sample: 8, wins: 4 });
    expect(out.every((p) => p.stats?.sample === 8)).toBe(true);
  });

  it("keeps overnight structural signals only on a volume impulse", () => {
    const overnight = makeCtx(40, OVERNIGHT_BASE);
    const keepThin = offSessionSignalKeeper(overnight.timesTs, overnight.vols);
    expect(keepThin(overnight.timesTs[30])).toBe(false);

    overnight.vols[30] = 2000; // 2× the 20-bar average
    const keepImpulse = offSessionSignalKeeper(overnight.timesTs, overnight.vols);
    expect(keepImpulse(overnight.timesTs[30])).toBe(true);

    const regular = makeCtx(40);
    const keepRegular = offSessionSignalKeeper(regular.timesTs, regular.vols);
    expect(keepRegular(regular.timesTs[30])).toBe(true);
  });

  it("returns null stats below the minimum sample", () => {
    const ctx = makeCtx(100);
    const patterns: CandlePattern[] = [];
    for (let k = 0; k < 7; k++) {
      const i = 10 + k * 5;
      ctx.closes[i + 1] = 101;
      patterns.push(weakBullish(ctx, i));
    }
    const out = enrichCandlePatterns(patterns, ctx);
    expect(out.every((p) => p.stats === null)).toBe(true);
  });
});
