import { describe, expect, it } from "vitest";
import { detectCandlePatterns } from "../src/services/candlePatterns.js";

interface TestBar {
  open: number;
  high: number;
  low: number;
  close: number;
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
    const hammer = { open: 100, high: 100.25, low: 98.5, close: 100.2 };

    expect(detect([smallGreen(100), smallRed(100.5), smallGreen(100.2), smallRed(100.4), hammer])).toHaveLength(0);

    expect(detect([smallRed(104), smallRed(103), smallRed(102), smallRed(101), hammer]).map((p) => p.kind)).toContain(
      "hammer",
    );
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
