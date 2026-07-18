import { describe, expect, it } from "vitest";
import type { RawBar } from "../../shared/types.js";
import { attachRMultiple, judgeOutcome, rMultipleFor } from "../src/services/cockpit/outcome.js";
import { aggregateStats } from "../src/services/cockpit/stats.js";

function bar(time: string, h: number, l: number, c: number): RawBar {
  return { time, open: c, high: h, low: l, close: c, volume: 1000 };
}

const anchor = { time: "2026-07-06T14:00:00Z", price: 100 };
const plan = { entry: 100, stop: 98, target1: 105 };

describe("rMultipleFor", () => {
  it("computes T1 reward/risk for long hit_target", () => {
    expect(rMultipleFor("hit_target", "long", plan)).toBeCloseTo(2.5, 8);
  });

  it("returns -1 on hit_stop and null otherwise", () => {
    expect(rMultipleFor("hit_stop", "long", plan)).toBe(-1);
    expect(rMultipleFor("held_range", "neutral", plan)).toBeNull();
    expect(rMultipleFor("hit_target", "long", { entry: 100, stop: 100, target1: 105 })).toBeNull();
    expect(rMultipleFor("hit_target", "long", null)).toBeNull();
  });

  it("mirrors for short direction", () => {
    expect(rMultipleFor("hit_target", "short", { entry: 100, stop: 102, target1: 95 })).toBeCloseTo(2.5, 8);
  });
});

describe("judgeOutcome r_multiple", () => {
  it("stamps r_multiple on resolved directional outcomes", () => {
    const winBars = [bar("2026-07-06T13:45:00Z", 100.5, 99.5, 100), bar("2026-07-06T14:15:00Z", 106, 101, 105.5)];
    const win = judgeOutcome("long", anchor, plan, winBars);
    expect(win?.status).toBe("hit_target");
    expect(win?.r_multiple).toBeCloseTo(2.5, 8);

    const loseBars = [bar("2026-07-06T13:45:00Z", 100.5, 99.5, 100), bar("2026-07-06T14:15:00Z", 100, 97, 97.5)];
    const lose = judgeOutcome("long", anchor, plan, loseBars);
    expect(lose?.status).toBe("hit_stop");
    expect(lose?.r_multiple).toBe(-1);
  });
});

describe("attachRMultiple", () => {
  it("backfills cached outcomes that lack r_multiple", () => {
    const cached = { status: "hit_target" as const, pct_since_anchor: 5, resolved_at: 1 };
    expect(attachRMultiple(cached, "long", plan)?.r_multiple).toBeCloseTo(2.5, 8);
    expect(attachRMultiple(null, "long", plan)).toBeNull();
  });
});

describe("aggregateStats avg_r", () => {
  it("averages r_multiple over judged trades", () => {
    const rows = [
      { direction: "long" as const, origin: "manual" as const, outcome: { status: "hit_target" as const, pct_since_anchor: 5, resolved_at: 1, r_multiple: 2.5 } },
      { direction: "long" as const, origin: "manual" as const, outcome: { status: "hit_stop" as const, pct_since_anchor: -2, resolved_at: 2, r_multiple: -1 } },
      { direction: "neutral" as const, origin: "manual" as const, outcome: { status: "held_range" as const, pct_since_anchor: 0.2, resolved_at: 3, r_multiple: null } },
    ];
    const stats = aggregateStats(rows);
    expect(stats.overall.avg_r).toBeCloseTo(0.75, 8);
    expect(stats.by_direction.long.avg_r).toBeCloseTo(0.75, 8);
    expect(stats.by_direction.neutral.avg_r).toBeNull();
  });
});
