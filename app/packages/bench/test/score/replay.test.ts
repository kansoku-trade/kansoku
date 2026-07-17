import { describe, expect, it } from "vitest";
import { clamp, replayDirectional, type ReplayBar } from "../../src/score/replay.js";

function rb(high: number, low: number, close: number): ReplayBar {
  return { high, low, close };
}

describe("replayDirectional long", () => {
  it("win: target touched, +R", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(105, 98, 102), rb(125, 110, 120)],
    });
    expect(res).toEqual({ outcome: "win", score: 2, r: 2 });
  });

  it("loss: stop touched, -1", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(105, 98, 100), rb(110, 88, 95)],
    });
    expect(res).toEqual({ outcome: "loss", score: -1, r: 2 });
  });

  it("same-bar with both stop and target on the fill bar is a conservative loss", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(125, 88, 100)],
    });
    expect(res).toEqual({ outcome: "loss", score: -1, r: 2 });
  });

  it("fill bar stop-only is a loss", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(105, 88, 95)],
    });
    expect(res.outcome).toBe("loss");
  });

  it("no_fill: entry never touched within bars 1-3", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(130, 120, 125), rb(130, 121, 126), rb(132, 122, 128)],
    });
    expect(res).toEqual({ outcome: "no_fill", score: null, r: 2 });
  });

  it("fill only counts in the first three bars", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 120,
      bars: [rb(130, 120, 125), rb(130, 121, 126), rb(132, 122, 128), rb(105, 98, 100)],
    });
    expect(res.outcome).toBe("no_fill");
  });

  it("timeout_flat positive mid value", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 90,
      target: 150,
      bars: [rb(105, 98, 100), rb(120, 110, 118), rb(140, 115, 135), rb(145, 120, 140)],
    });
    expect(res.outcome).toBe("timeout_flat");
    expect(res.r).toBe(5);
    expect(res.score).toBeCloseTo(4, 10);
  });

  it("timeout_flat negative mid value", () => {
    const res = replayDirectional({
      direction: "long",
      entry: 100,
      stop: 80,
      target: 150,
      bars: [rb(105, 98, 100), rb(100, 90, 92), rb(98, 88, 95)],
    });
    expect(res.outcome).toBe("timeout_flat");
    expect(res.score).toBeCloseTo(-0.25, 10);
  });
});

describe("replayDirectional short mirror", () => {
  it("win: target (low) touched", () => {
    const res = replayDirectional({
      direction: "short",
      entry: 100,
      stop: 110,
      target: 80,
      bars: [rb(103, 95, 100), rb(90, 75, 82)],
    });
    expect(res).toEqual({ outcome: "win", score: 2, r: 2 });
  });

  it("loss: stop (high) touched", () => {
    const res = replayDirectional({
      direction: "short",
      entry: 100,
      stop: 110,
      target: 80,
      bars: [rb(103, 95, 100), rb(112, 96, 108)],
    });
    expect(res).toEqual({ outcome: "loss", score: -1, r: 2 });
  });
});

describe("replayDirectional sanity gate", () => {
  const bars = [rb(105, 98, 100), rb(125, 110, 120)];
  it("long stop on wrong side", () => {
    expect(replayDirectional({ direction: "long", entry: 100, stop: 105, target: 120, bars }).outcome).toBe(
      "format_violation",
    );
  });
  it("short stop on wrong side", () => {
    expect(replayDirectional({ direction: "short", entry: 100, stop: 95, target: 80, bars }).outcome).toBe(
      "format_violation",
    );
  });
  it("long target on wrong side", () => {
    expect(replayDirectional({ direction: "long", entry: 100, stop: 90, target: 95, bars }).outcome).toBe(
      "format_violation",
    );
  });
  it("non-finite price", () => {
    expect(replayDirectional({ direction: "long", entry: Number.NaN, stop: 90, target: 120, bars }).outcome).toBe(
      "format_violation",
    );
  });
  it("R <= 0 via equal entry/target", () => {
    expect(replayDirectional({ direction: "long", entry: 100, stop: 90, target: 100, bars }).outcome).toBe(
      "format_violation",
    );
  });
});

describe("clamp", () => {
  it("clamps low to -1", () => {
    expect(clamp(-3, -1, 6)).toBe(-1);
  });
  it("clamps high to +R", () => {
    expect(clamp(9, -1, 6)).toBe(6);
  });
  it("passes mid value", () => {
    expect(clamp(2.5, -1, 6)).toBe(2.5);
  });
});
