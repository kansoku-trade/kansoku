import { describe, expect, it } from "vitest";
import type { RawBar } from "@kansoku/shared/types";
import type { RawCapitalDistribution, RawPosition } from "../src/services/marketdata/types.js";
import type { FlowRow } from "../src/services/simple.js";
import { buildBenchmark } from "../src/services/cockpit/benchmark.js";
import { buildCockpitFlow } from "../src/services/cockpit/flow.js";
import { judgeOutcome, zoneFromPrediction } from "../src/services/cockpit/outcome.js";
import { buildCockpitPosition } from "../src/services/cockpit/position.js";

function bar(time: string, o: number, h: number, l: number, c: number, v = 1000): RawBar {
  return { time, open: o, high: h, low: l, close: c, volume: v };
}

describe("buildCockpitFlow", () => {
  const dist: RawCapitalDistribution = {
    capital_in: { large: "100", medium: "50", small: "20" },
    capital_out: { large: "40", medium: "60", small: "10" },
    symbol: "NVDA.US",
    timestamp: "2026-07-02T20:00:00Z",
  };

  it("maps rows to curve points and computes distribution net", () => {
    const rows: FlowRow[] = [
      { time: "2026-07-02T13:30:00Z", inflow: "123.45" },
      { time: "2026-07-02T13:31:00Z", inflow: 67.8 },
    ];
    const result = buildCockpitFlow(rows, dist);
    expect(result.curve).toEqual([
      { time: Date.parse("2026-07-02T13:30:00Z"), value: 123.45 },
      { time: Date.parse("2026-07-02T13:31:00Z"), value: 67.8 },
    ]);
    expect(result.distribution).toEqual({
      large: { in: 100, out: 40, net: 60 },
      medium: { in: 50, out: 60, net: -10 },
      small: { in: 20, out: 10, net: 10 },
    });
    expect(result.timestamp).toBe("2026-07-02T20:00:00Z");
  });

  it("returns null distribution when dist is null", () => {
    const result = buildCockpitFlow([], null);
    expect(result.distribution).toBeNull();
    expect(result.timestamp).toBeNull();
  });

  it("skips rows with NaN time or inflow", () => {
    const rows: FlowRow[] = [
      { time: "not-a-date", inflow: "10" },
      { time: "2026-07-02T13:30:00Z", inflow: "not-a-number" },
      { time: "2026-07-02T13:32:00Z", inflow: "5" },
    ];
    const result = buildCockpitFlow(rows, null);
    expect(result.curve).toEqual([{ time: Date.parse("2026-07-02T13:32:00Z"), value: 5 }]);
  });
});

describe("buildBenchmark", () => {
  it("normalizes each series independently to first-bar pct", () => {
    const series = [
      {
        symbol: "SMH",
        bars: [bar("2026-07-01T13:30:00Z", 100, 101, 99, 100), bar("2026-07-02T13:30:00Z", 100, 111, 99, 110)],
      },
      {
        symbol: "QQQ",
        bars: [bar("2026-07-01T13:30:00Z", 50, 51, 49, 50), bar("2026-07-02T13:30:00Z", 50, 56, 49, 55)],
      },
    ];
    const result = buildBenchmark(series);
    expect(result).toHaveLength(2);
    for (const s of result) {
      expect(s.points[0]).toEqual({ time: Date.parse("2026-07-01T13:30:00Z"), pct: 0 });
      expect(s.points[1].time).toBe(Date.parse("2026-07-02T13:30:00Z"));
      expect(s.points[1].pct).toBeCloseTo(10);
    }
    expect(result.map((s) => s.symbol)).toEqual(["SMH", "QQQ"]);
  });

  it("skips series with no bars", () => {
    const result = buildBenchmark([{ symbol: "EMPTY", bars: [] }]);
    expect(result).toEqual([]);
  });

  it("trims to the common start when series begin at different times", () => {
    const series = [
      {
        symbol: "SMH",
        bars: [
          bar("2026-06-30T13:30:00Z", 90, 91, 89, 90),
          bar("2026-07-01T13:30:00Z", 100, 101, 99, 100),
          bar("2026-07-02T13:30:00Z", 100, 111, 99, 110),
        ],
      },
      {
        symbol: "QQQ",
        bars: [bar("2026-07-01T13:30:00Z", 50, 51, 49, 50), bar("2026-07-02T13:30:00Z", 50, 56, 49, 55)],
      },
    ];
    const result = buildBenchmark(series);
    expect(result).toHaveLength(2);
    for (const s of result) {
      expect(s.points[0]).toEqual({ time: Date.parse("2026-07-01T13:30:00Z"), pct: 0 });
      expect(s.points).toHaveLength(2);
    }
    const smh = result.find((s) => s.symbol === "SMH");
    expect(smh?.points[1].pct).toBeCloseTo(10);
  });
});

describe("buildCockpitPosition", () => {
  const positions: RawPosition[] = [
    { available: "6", cost_price: "303.635", currency: "USD", market: "US", name: "Marvell Tech", symbol: "MRVL.US", quantity: "6" },
    { available: "0", cost_price: "10", currency: "USD", market: "US", name: "Zero Qty", symbol: "ZERO.US", quantity: "0" },
  ];

  it("returns null when symbol not held", () => {
    expect(buildCockpitPosition(positions, "NVDA.US", 150, null)).toBeNull();
  });

  it("returns null when quantity is 0", () => {
    expect(buildCockpitPosition(positions, "ZERO.US", 20, null)).toBeNull();
  });

  it("computes unrealized pnl and null distances when no plan", () => {
    const result = buildCockpitPosition(positions, "MRVL.US", 310, null);
    expect(result).toEqual({
      symbol: "MRVL.US",
      shares: 6,
      cost: 303.635,
      last: 310,
      unrealized: (310 - 303.635) * 6,
      unrealizedPct: (310 / 303.635 - 1) * 100,
      distances: null,
    });
  });

  it("computes distances for a full plan", () => {
    const result = buildCockpitPosition(positions, "MRVL.US", 310, { stop: 290, target1: 330, target2: 350 });
    expect(result?.distances).toEqual({
      stop_pct: (290 / 310 - 1) * 100,
      target1_pct: (330 / 310 - 1) * 100,
      target2_pct: (350 / 310 - 1) * 100,
    });
  });

  it("computes distances for a partial plan (only stop)", () => {
    const result = buildCockpitPosition(positions, "MRVL.US", 310, { stop: 290 });
    expect(result?.distances).toEqual({
      stop_pct: (290 / 310 - 1) * 100,
      target1_pct: null,
      target2_pct: null,
    });
  });
});

describe("judgeOutcome", () => {
  const anchor = { time: "2026-07-01T13:30:00Z", price: 100 };

  it("long hit_target when high touches target1 before stop", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:30:00Z", 100, 101, 99, 100),
      bar("2026-07-01T13:31:00Z", 100, 105, 99, 104),
      bar("2026-07-01T13:32:00Z", 104, 110, 103, 108),
    ];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 108 }, bars);
    expect(result?.status).toBe("hit_target");
    expect(result?.resolved_at).toBe(Math.floor(Date.parse("2026-07-01T13:32:00Z") / 1000));
  });

  it("long hit_stop when low touches stop", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:30:00Z", 100, 101, 99, 100),
      bar("2026-07-01T13:31:00Z", 100, 101, 88, 89),
    ];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 120 }, bars);
    expect(result?.status).toBe("hit_stop");
    expect(result?.resolved_at).toBe(Math.floor(Date.parse("2026-07-01T13:31:00Z") / 1000));
  });

  it("short hit_target when low touches target1", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:31:00Z", 100, 101, 90, 91),
    ];
    const result = judgeOutcome("short", anchor, { stop: 110, target1: 92 }, bars);
    expect(result?.status).toBe("hit_target");
  });

  it("short hit_stop when high touches stop", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:31:00Z", 100, 112, 99, 110),
    ];
    const result = judgeOutcome("short", anchor, { stop: 110, target1: 80 }, bars);
    expect(result?.status).toBe("hit_stop");
  });

  it("same-bar collision resolves to hit_stop conservatively", () => {
    const bars: RawBar[] = [bar("2026-07-01T13:31:00Z", 100, 120, 80, 100)];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 110 }, bars);
    expect(result?.status).toBe("hit_stop");
  });

  it("open when neither level touched", () => {
    const bars: RawBar[] = [bar("2026-07-01T13:31:00Z", 100, 102, 98, 101)];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 120 }, bars);
    expect(result?.status).toBe("open");
    expect(result?.resolved_at).toBeNull();
    expect(result?.pct_since_anchor).toBeCloseTo((101 / 100 - 1) * 100);
  });

  it("ignores bars at or before anchor time", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:30:00Z", 100, 200, 1, 100),
      bar("2026-07-01T13:29:00Z", 100, 200, 1, 100),
    ];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 120 }, bars);
    expect(result?.status).toBe("open");
  });

  it("returns null for neutral direction without a zone", () => {
    expect(judgeOutcome("neutral", anchor, { stop: 90, target1: 120 }, [])).toBeNull();
  });

  it("neutral broke_range when a close leaves the zone", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:31:00Z", 100, 102, 98, 101),
      bar("2026-07-01T13:32:00Z", 101, 106, 100, 105.5),
    ];
    const result = judgeOutcome("neutral", anchor, null, bars, { low: 95, high: 105 });
    expect(result?.status).toBe("broke_range");
    expect(result?.resolved_at).toBe(Math.floor(Date.parse("2026-07-01T13:32:00Z") / 1000));
  });

  it("neutral wick outside the zone does not break it", () => {
    const bars: RawBar[] = [bar("2026-07-01T13:31:00Z", 100, 106, 94, 101)];
    const result = judgeOutcome("neutral", anchor, null, bars, { low: 95, high: 105 });
    expect(result?.status).toBe("open");
  });

  it("neutral held_range after a full session inside the zone", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:31:00Z", 100, 102, 98, 101),
      bar("2026-07-01T20:01:00Z", 101, 103, 99, 100),
    ];
    const result = judgeOutcome("neutral", anchor, null, bars, { low: 95, high: 105 });
    expect(result?.status).toBe("held_range");
    expect(result?.resolved_at).toBe(Math.floor(Date.parse("2026-07-01T20:01:00Z") / 1000));
  });

  it("neutral stays open inside the zone before the horizon", () => {
    const bars: RawBar[] = [bar("2026-07-01T13:31:00Z", 100, 102, 98, 101)];
    const result = judgeOutcome("neutral", anchor, null, bars, { low: 95, high: 105 });
    expect(result?.status).toBe("open");
    expect(result?.pct_since_anchor).toBeCloseTo(1);
  });

  it("neutral returns null when the bar window starts after the anchor", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T14:00:00Z", 100, 101, 99, 100),
      bar("2026-07-01T14:01:00Z", 100, 101, 99, 100),
    ];
    expect(judgeOutcome("neutral", anchor, null, bars, { low: 95, high: 105 })).toBeNull();
  });

  it("returns null when plan is null", () => {
    expect(judgeOutcome("long", anchor, null, [])).toBeNull();
  });

  it("returns null when stop or target1 missing", () => {
    expect(judgeOutcome("long", anchor, { stop: 90 }, [])).toBeNull();
    expect(judgeOutcome("long", anchor, { target1: 120 }, [])).toBeNull();
  });

  it("returns null when the bar window starts after the anchor (gap between anchor and window)", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T14:00:00Z", 100, 200, 1, 100),
      bar("2026-07-01T14:01:00Z", 100, 101, 99, 100),
    ];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 120 }, bars);
    expect(result).toBeNull();
  });

  it("judges normally when the window covers the anchor", () => {
    const bars: RawBar[] = [
      bar("2026-07-01T13:30:00Z", 100, 101, 99, 100),
      bar("2026-07-01T13:31:00Z", 100, 105, 99, 104),
    ];
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 104 }, bars);
    expect(result?.status).toBe("hit_target");
  });

  it("keeps open with zero raw bars (existing behavior)", () => {
    const result = judgeOutcome("long", anchor, { stop: 90, target1: 120 }, []);
    expect(result?.status).toBe("open");
    expect(result?.pct_since_anchor).toBe(0);
  });
});

describe("zoneFromPrediction", () => {
  it("reads low/high from range_bound_plan or range_plan alias", () => {
    expect(zoneFromPrediction({ range_bound_plan: { low: 95, high: 105 } })).toEqual({ low: 95, high: 105 });
    expect(zoneFromPrediction({ range_plan: { low: 95, high: 105 } })).toEqual({ low: 95, high: 105 });
  });

  it("returns null when the zone is missing or inverted", () => {
    expect(zoneFromPrediction(null)).toBeNull();
    expect(zoneFromPrediction({ range_bound_plan: { long_tactic: "..." } })).toBeNull();
    expect(zoneFromPrediction({ range_bound_plan: { low: 105, high: 95 } })).toBeNull();
  });
});
