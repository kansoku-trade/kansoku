import { describe, expect, it } from "vitest";
import {
  detectTriggers,
  shouldHeartbeat,
  type TriggerBar,
  type TriggerInput,
} from "../src/ai/triggers.js";

function bar(time: number, close: number, volume: number): TriggerBar {
  return { time, close, volume };
}

function baseInput(overrides: Partial<TriggerInput> = {}): TriggerInput {
  return {
    bars: [bar(1, 100, 1000), bar(2, 101, 1000)],
    macdHist: [1, 1.2],
    flow: [500, 600],
    levels: {},
    ...overrides,
  };
}

describe("detectTriggers macd_cross", () => {
  it("fires on a golden flip", () => {
    const out = detectTriggers(baseInput({ macdHist: [-0.5, 0.3] }));
    expect(out.map((t) => t.kind)).toContain("macd_cross");
  });

  it("fires on a death flip", () => {
    const out = detectTriggers(baseInput({ macdHist: [0.4, -0.2] }));
    expect(out.map((t) => t.kind)).toContain("macd_cross");
  });

  it("does not fire when sign is unchanged", () => {
    const out = detectTriggers(baseInput({ macdHist: [0.2, 0.5] }));
    expect(out.map((t) => t.kind)).not.toContain("macd_cross");
  });

  it("does not fire when previous hist is exactly zero", () => {
    const out = detectTriggers(baseInput({ macdHist: [0, 0.5] }));
    expect(out.map((t) => t.kind)).not.toContain("macd_cross");
  });

  it("does not fire with fewer than two values", () => {
    const out = detectTriggers(baseInput({ macdHist: [0.5] }));
    expect(out.map((t) => t.kind)).not.toContain("macd_cross");
  });
});

describe("detectTriggers level_break", () => {
  it("fires when price crosses above a level", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 99, 1000), bar(2, 102, 1000)], levels: { entry: 100 } }),
    );
    expect(out.map((t) => t.kind)).toContain("level_break");
  });

  it("fires when price crosses below a level", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 105, 1000), bar(2, 98, 1000)], levels: { stop: 100 } }),
    );
    expect(out.map((t) => t.kind)).toContain("level_break");
  });

  it("fires when price lands exactly on a level from below", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 99, 1000), bar(2, 100, 1000)], levels: { target1: 100 } }),
    );
    expect(out.map((t) => t.kind)).toContain("level_break");
  });

  it("fires when price crosses target2", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 99, 1000), bar(2, 106, 1000)], levels: { target2: 105 } }),
    );
    const level = out.find((t) => t.kind === "level_break");
    expect(level?.detail).toContain("target2");
  });

  it("does not fire when price stays below a level", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 90, 1000), bar(2, 95, 1000)], levels: { entry: 100 } }),
    );
    expect(out.map((t) => t.kind)).not.toContain("level_break");
  });

  it("does not fire when no levels are given", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 90, 1000), bar(2, 105, 1000)], levels: {} }),
    );
    expect(out.map((t) => t.kind)).not.toContain("level_break");
  });

  it("ignores null level values", () => {
    const out = detectTriggers(
      baseInput({ bars: [bar(1, 90, 1000), bar(2, 105, 1000)], levels: { entry: null, stop: undefined } }),
    );
    expect(out.map((t) => t.kind)).not.toContain("level_break");
  });
});

describe("detectTriggers flow_flip", () => {
  it("fires when cumulative flow flips to net outflow", () => {
    const out = detectTriggers(baseInput({ flow: [200, -50] }));
    expect(out.map((t) => t.kind)).toContain("flow_flip");
  });

  it("fires when cumulative flow flips to net inflow", () => {
    const out = detectTriggers(baseInput({ flow: [-200, 50] }));
    expect(out.map((t) => t.kind)).toContain("flow_flip");
  });

  it("does not fire when flow keeps the same sign", () => {
    const out = detectTriggers(baseInput({ flow: [100, 300] }));
    expect(out.map((t) => t.kind)).not.toContain("flow_flip");
  });

  it("suppresses flips hovering near the zero line relative to the series peak", () => {
    const out = detectTriggers(baseInput({ flow: [800, 200, -5] }));
    expect(out.map((t) => t.kind)).not.toContain("flow_flip");
  });

  it("does not fire with fewer than two values", () => {
    const out = detectTriggers(baseInput({ flow: [-100] }));
    expect(out.map((t) => t.kind)).not.toContain("flow_flip");
  });
});

describe("detectTriggers volume_spike", () => {
  it("fires when the last bar exceeds 3x the 20-bar average", () => {
    const prior = Array.from({ length: 20 }, (_, i) => bar(i, 100, 1000));
    const bars = [...prior, bar(20, 100, 3001)];
    const out = detectTriggers(baseInput({ bars }));
    expect(out.map((t) => t.kind)).toContain("volume_spike");
  });

  it("does not fire at exactly 3x the average", () => {
    const prior = Array.from({ length: 20 }, (_, i) => bar(i, 100, 1000));
    const bars = [...prior, bar(20, 100, 3000)];
    const out = detectTriggers(baseInput({ bars }));
    expect(out.map((t) => t.kind)).not.toContain("volume_spike");
  });

  it("does not fire when the baseline has fewer than 20 bars", () => {
    const prior = Array.from({ length: 19 }, (_, i) => bar(i, 100, 1000));
    const bars = [...prior, bar(19, 100, 999999)];
    const out = detectTriggers(baseInput({ bars }));
    expect(out.map((t) => t.kind)).not.toContain("volume_spike");
  });
});

describe("detectTriggers combinations", () => {
  it("returns multiple triggers at once", () => {
    const prior = Array.from({ length: 20 }, (_, i) => bar(i, 100, 1000));
    const bars = [...prior, bar(20, 102, 5000)];
    const out = detectTriggers({
      bars,
      macdHist: [-0.5, 0.3],
      flow: [200, -50],
      levels: { entry: 101 },
    });
    expect(out.map((t) => t.kind).sort()).toEqual(
      ["flow_flip", "level_break", "macd_cross", "volume_spike"].sort(),
    );
  });

  it("returns nothing on a quiet input", () => {
    expect(detectTriggers(baseInput())).toEqual([]);
  });
});

describe("detectTriggers zone_break", () => {
  const zone = { label: "阻力位", low: 100, high: 102 };

  it("fires when price enters the zone from below", () => {
    const out = detectTriggers(baseInput({ bars: [bar(1, 99, 1000), bar(2, 101, 1000)], zones: [zone] }));
    const hit = out.find((t) => t.kind === "zone_break");
    expect(hit?.detail).toContain("entered zone");
    expect(hit?.detail).toContain("阻力位");
  });

  it("fires when price exits the zone upward", () => {
    const out = detectTriggers(baseInput({ bars: [bar(1, 101, 1000), bar(2, 103, 1000)], zones: [zone] }));
    expect(out.find((t) => t.kind === "zone_break")?.detail).toContain("exited zone");
  });

  it("fires when price crosses through the whole zone in one bar", () => {
    const out = detectTriggers(baseInput({ bars: [bar(1, 99, 1000), bar(2, 104, 1000)], zones: [zone] }));
    expect(out.find((t) => t.kind === "zone_break")?.detail).toContain("crossed through");
  });

  it("does not fire while price stays inside the zone", () => {
    const out = detectTriggers(baseInput({ bars: [bar(1, 100.5, 1000), bar(2, 101.5, 1000)], zones: [zone] }));
    expect(out.map((t) => t.kind)).not.toContain("zone_break");
  });

  it("does not fire when no zones are given", () => {
    const out = detectTriggers(baseInput({ bars: [bar(1, 99, 1000), bar(2, 103, 1000)] }));
    expect(out.map((t) => t.kind)).not.toContain("zone_break");
  });
});

describe("detectTriggers day_level_break", () => {
  it("fires when price crosses above the previous-day high", () => {
    const out = detectTriggers(
      baseInput({
        bars: [bar(1, 99, 1000), bar(2, 101, 1000)],
        dayLevels: [{ name: "prev_day_high", value: 100 }],
      }),
    );
    const hit = out.find((t) => t.kind === "day_level_break");
    expect(hit?.detail).toContain("prev_day_high");
    expect(hit?.detail).toContain("above");
  });

  it("fires when price loses the opening-range low", () => {
    const out = detectTriggers(
      baseInput({
        bars: [bar(1, 101, 1000), bar(2, 99, 1000)],
        dayLevels: [{ name: "opening_range_low", value: 100 }],
      }),
    );
    expect(out.find((t) => t.kind === "day_level_break")?.detail).toContain("below opening_range_low");
  });

  it("does not fire without a crossing", () => {
    const out = detectTriggers(
      baseInput({
        bars: [bar(1, 98, 1000), bar(2, 99, 1000)],
        dayLevels: [{ name: "pre_market_high", value: 100 }],
      }),
    );
    expect(out.map((t) => t.kind)).not.toContain("day_level_break");
  });
});

describe("shouldHeartbeat", () => {
  it("returns true when never run", () => {
    expect(shouldHeartbeat(null, 1_000_000)).toBe(true);
  });

  it("returns true at exactly five minutes", () => {
    expect(shouldHeartbeat(0, 5 * 60 * 1000)).toBe(true);
  });

  it("returns false just under five minutes", () => {
    expect(shouldHeartbeat(0, 5 * 60 * 1000 - 1)).toBe(false);
  });
});
