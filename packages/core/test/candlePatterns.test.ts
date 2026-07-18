import { describe, expect, it } from "vitest";
import { detectCandlePatterns } from "../src/services/candlePatterns.js";
import { loadFixture } from "./helpers.js";

interface TestBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface RawFixtureBar {
  open: string;
  high: string;
  low: string;
  close: string;
  time: string;
}

const SINGLE_BAR_KINDS = new Set([
  "hammer",
  "hanging_man",
  "inverted_hammer",
  "shooting_star",
  "pin_bar_lower",
  "pin_bar_upper",
]);

function detectFromFixture(name: string) {
  const bars = loadFixture<RawFixtureBar[]>(name);
  return {
    bars,
    patterns: detectCandlePatterns(
      bars.map((b) => Number(b.open)),
      bars.map((b) => Number(b.high)),
      bars.map((b) => Number(b.low)),
      bars.map((b) => Number(b.close)),
      bars.map((b) => Date.parse(b.time) / 1000),
    ),
  };
}

function detect(bars: TestBar[]) {
  return detectCandlePatterns(
    bars.map((b) => b.open),
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    bars.map((b) => b.close),
    bars.map((_, i) => 1_700_000_000 + i * 300),
  );
}

function smallGreen(close: number): TestBar {
  return { open: close - 0.5, high: close + 0.2, low: close - 0.6, close };
}

function smallRed(close: number): TestBar {
  return { open: close + 0.5, high: close + 0.6, low: close - 0.2, close };
}

describe("detectCandlePatterns", () => {
  it("requires three black crows to open inside the previous real body and close near lows", () => {
    const looseContinuation = [
      smallGreen(100),
      smallGreen(101),
      smallGreen(102),
      smallGreen(103),
      { open: 104, high: 104.2, low: 101.4, close: 101.5 },
      { open: 104.5, high: 104.8, low: 100.4, close: 100.5 },
      { open: 102.5, high: 102.8, low: 99.7, close: 99.8 },
    ];

    expect(detect(looseContinuation).map((p) => p.kind)).not.toContain("three_black_crows");

    const strictCrows = [
      smallGreen(100),
      smallGreen(101),
      smallGreen(102),
      smallGreen(103),
      { open: 104, high: 104.2, low: 101.4, close: 101.5 },
      { open: 103, high: 103.2, low: 100.4, close: 100.5 },
      { open: 102.5, high: 102.7, low: 99.7, close: 99.8 },
    ];

    expect(detect(strictCrows).map((p) => p.kind)).toContain("three_black_crows");
  });

  it("detects hammer only when a prior downtrend exists before the candle", () => {
    // low (99.65) sits above the preceding-3-bar minimum low (99.6) in the flat case below,
    // so it is not a fresh local low either — nothing should fire without a trend.
    const hammer = { open: 100, high: 100.15, low: 99.65, close: 100.1 };

    expect(detect([smallGreen(100), smallRed(100.5), smallGreen(100.2), smallRed(100.4), hammer])).toHaveLength(0);

    expect(detect([smallRed(104), smallRed(103), smallRed(102), smallRed(101), hammer]).map((p) => p.kind)).toContain(
      "hammer",
    );
  });

  it("attaches confirm/invalidate prices to directional patterns and nulls for neutral ones", () => {
    const hammer = { open: 100, high: 100.15, low: 99.65, close: 100.1 };
    const bullish = detect([smallRed(104), smallRed(103), smallRed(102), smallRed(101), hammer]).find(
      (p) => p.kind === "hammer",
    );
    expect(bullish?.confirm_price).toBeCloseTo(100.1);
    expect(bullish?.invalidate_price).toBeCloseTo(99.65);
    expect(bullish?.span).toBe(1);

    const doji = { open: 100, high: 100.6, low: 99.4, close: 100.005 };
    const neutral = detect([smallGreen(99), smallGreen(99.7), smallGreen(100.4), smallGreen(101.1), doji]).find((p) =>
      p.kind.includes("doji"),
    );
    expect(neutral).toBeDefined();
    if (neutral?.bias === "neutral") {
      expect(neutral.confirm_price).toBeNull();
      expect(neutral.invalidate_price).toBeNull();
    }
  });

  it("detects a neutral lower pin bar in a range when it pokes a fresh local low", () => {
    const rangeBars = [
      smallGreen(100),
      smallRed(100.5),
      smallGreen(100.2),
      smallRed(100.4),
      smallGreen(100.1),
      smallRed(100.3),
    ];
    const pin = { open: 100, high: 100.25, low: 98.5, close: 100.2 };

    expect(detect([...rangeBars, pin]).map((p) => p.kind)).toContain("pin_bar_lower");
  });

  it("rejects a range pin bar whose low is not a local extreme", () => {
    // deeperEarlierLow now sits inside the 3-bar lookback (immediately before the
    // candidate), so its lower low disqualifies the pin bar as a fresh local low.
    // Its own body is large relative to its range, so it is a plunge bar, not a pin bar itself.
    const deeperEarlierLow = { open: 100.4, high: 100.6, low: 98, close: 99 };
    const bars = [
      smallGreen(100),
      smallRed(100.5),
      smallGreen(100.2),
      smallRed(100.4),
      smallGreen(100.1),
      deeperEarlierLow,
      { open: 100, high: 100.25, low: 98.5, close: 100.2 },
    ];

    expect(detect(bars).map((p) => p.kind)).not.toContain("pin_bar_lower");
  });

  it("prefers hammer over neutral pin bar when a downtrend precedes the candle", () => {
    const bars = [
      smallRed(105),
      smallRed(104),
      smallRed(103),
      smallRed(102),
      smallRed(101),
      { open: 100, high: 100.25, low: 98.5, close: 100.2 },
    ];
    const kinds = detect(bars).map((p) => p.kind);

    expect(kinds).toContain("hammer");
    expect(kinds).not.toContain("pin_bar_lower");
  });

  it("detects a neutral upper pin bar in a range when it pokes a fresh local high", () => {
    const rangeBars = [
      smallGreen(100),
      smallRed(100.5),
      smallGreen(100.2),
      smallRed(100.4),
      smallGreen(100.1),
      smallRed(100.3),
    ];
    const pin = { open: 100, high: 101.7, low: 99.95, close: 100.2 };

    expect(detect([...rangeBars, pin]).map((p) => p.kind)).toContain("pin_bar_upper");
  });

  it("requires bullish harami to use an opposite-color second candle", () => {
    const sameColorHarami = [
      smallRed(104),
      smallRed(103),
      smallRed(102),
      smallRed(101),
      { open: 101, high: 101.2, low: 98.8, close: 99 },
      { open: 100.5, high: 100.7, low: 99.8, close: 100 },
    ];

    expect(detect(sameColorHarami).map((p) => p.kind)).not.toContain("bullish_harami");

    const bullishHarami = [
      smallRed(104),
      smallRed(103),
      smallRed(102),
      smallRed(101),
      { open: 101, high: 101.2, low: 98.8, close: 99 },
      { open: 99.5, high: 100.7, low: 99.3, close: 100 },
    ];

    expect(detect(bullishHarami).map((p) => p.kind)).toContain("bullish_harami");
  });
});

describe("detectCandlePatterns new pattern kinds", () => {
  const uptrend4 = [smallGreen(101), smallGreen(102), smallGreen(103), smallGreen(104)];
  const downtrend4 = [smallRed(104), smallRed(103), smallRed(102), smallRed(101)];

  it("detects a gravestone doji at the end of an uptrend", () => {
    const gravestone = { open: 100, close: 100.05, high: 101, low: 99.95 };

    expect(detect([...uptrend4, gravestone]).map((p) => p.kind)).toContain("gravestone_doji");
  });

  it("does not classify the same gravestone shape as gravestone_doji in a downtrend", () => {
    const gravestone = { open: 100, close: 100.05, high: 101, low: 99.95 };
    const kinds = detect([...downtrend4, gravestone]).map((p) => p.kind);

    expect(kinds).not.toContain("gravestone_doji");
  });

  it("detects a dragonfly doji at the end of a downtrend", () => {
    const dragonfly = { open: 100, close: 99.95, high: 100.05, low: 99 };

    expect(detect([...downtrend4, dragonfly]).map((p) => p.kind)).toContain("dragonfly_doji");
  });

  it("detects a long-legged doji when both shadows are long", () => {
    const longLegged = { open: 100, close: 100.02, high: 100.7, low: 99.3 };

    expect(detect([...uptrend4, longLegged]).map((p) => p.kind)).toContain("long_legged_doji");
  });

  it("detects a plain doji at a trend end and rejects a doji in a flat market", () => {
    const plainDoji = { open: 100.67, close: 100.7, high: 101, low: 100 };

    expect(detect([...uptrend4, plainDoji]).map((p) => p.kind)).toContain("doji");

    const flatBars = [smallGreen(100), smallRed(100.1), smallGreen(100.05), smallRed(100.1)];
    expect(detect([...flatBars, plainDoji]).map((p) => p.kind)).not.toContain("doji");
  });

  it("detects tweezer_top when two highs at an uptrend end match within tolerance", () => {
    const barI1 = { open: 104.5, close: 105, high: 105.2, low: 104.3 };
    const barI = { open: 105, close: 104.5, high: 105.25, low: 104.2 };

    expect(detect([...uptrend4, barI1, barI]).map((p) => p.kind)).toContain("tweezer_top");
  });

  it("rejects tweezer_top when the highs differ by more than tolerance", () => {
    const barI1 = { open: 104.5, close: 105, high: 105.2, low: 104.3 };
    const barIFar = { open: 105, close: 104.5, high: 105.6, low: 104.2 };

    expect(detect([...uptrend4, barI1, barIFar]).map((p) => p.kind)).not.toContain("tweezer_top");
  });

  it("detects tweezer_bottom when two lows at a downtrend end match within tolerance", () => {
    const barI1 = { open: 100, close: 99.5, high: 100.1, low: 98.8 };
    const barI = { open: 99.5, close: 100, high: 100.2, low: 98.75 };

    expect(detect([...downtrend4, barI1, barI]).map((p) => p.kind)).toContain("tweezer_bottom");
  });

  it("detects a bullish marubozu with an open-at-low, close-at-high body", () => {
    const marubozu = { open: 100, close: 110, high: 110, low: 100 };

    expect(detect([smallGreen(100), smallRed(100.2), smallGreen(100.1), smallRed(100.2), marubozu]).map((p) => p.kind)).toContain(
      "bullish_marubozu",
    );
  });

  it("detects a bearish marubozu with an open-at-high, close-at-low body", () => {
    const marubozu = { open: 110, close: 100, high: 110, low: 100 };

    expect(detect([smallGreen(100), smallRed(100.2), smallGreen(100.1), smallRed(100.2), marubozu]).map((p) => p.kind)).toContain(
      "bearish_marubozu",
    );
  });
});

describe("detectCandlePatterns real-data regression", () => {
  const fixtures = ["mu-5m.json", "mu-15m.json", "mu-1h.json", "mrvl-day.json", "spy-day.json"];

  it.each(fixtures)("keeps total detections bounded on %s", (name) => {
    const { bars, patterns } = detectFromFixture(name);

    // Task 2 added 8 pattern kinds (doji family, tweezers, marubozu) on top of the
    // original 16, so the same bar count now legitimately supports more detections.
    // The cap is widened from bars/6 to bars/4 to keep it a bound, not a tight fit.
    expect(patterns.length).toBeLessThanOrEqual(Math.ceil(bars.length / 4));
  });

  it("fires at least one single-bar pattern across the MU intraday fixtures", () => {
    const intradayFixtures = ["mu-5m.json", "mu-15m.json", "mu-1h.json"];
    const allKinds = intradayFixtures.flatMap((name) => detectFromFixture(name).patterns.map((p) => p.kind));

    expect(allKinds.some((kind) => SINGLE_BAR_KINDS.has(kind))).toBe(true);
  });
});
