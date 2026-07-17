import { describe, expect, it } from "vitest";
import { atr14, cutoffCloseOf, neutralCorrect, regimeOf } from "../../src/score/neutral.js";
import { scoreCell } from "../../src/score/cell.js";
import { bar, buildQuestion, flatDayBars, rampDayBars } from "./helpers.js";
import type { AnswerLine } from "../../src/schema/answerLine.js";

describe("atr14", () => {
  it("simple mean of true ranges over the last 15 day bars", () => {
    expect(atr14(flatDayBars(15, 110, 100, 105))).toBe(10);
  });
  it("uses only the last 15 bars", () => {
    const bars = [...flatDayBars(10, 200, 100, 150), ...flatDayBars(15, 110, 100, 105)];
    expect(atr14(bars)).toBe(10);
  });
});

describe("cutoffCloseOf", () => {
  it("takes the last day bar close", () => {
    expect(cutoffCloseOf(flatDayBars(3, 110, 100, 105))).toBe(105);
  });
});

describe("neutralCorrect band", () => {
  it("correct when every replay close is within cutoffClose +/- 2*ATR", () => {
    expect(neutralCorrect(105, 10, [bar(130, 100, 125)])).toBe(true);
  });
  it("wrong when a replay close is just outside the band", () => {
    expect(neutralCorrect(105, 10, [bar(130, 100, 125.5)])).toBe(false);
  });
});

describe("regimeOf", () => {
  it("up when cutoff close is above SMA50", () => {
    const closes = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(regimeOf(rampDayBars(closes))).toBe("up");
  });
  it("down when cutoff close is below SMA50", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 50 - i);
    expect(regimeOf(rampDayBars(closes))).toBe("down");
  });
});

describe("scoreCell neutral channel", () => {
  function neutralAnswer(): AnswerLine {
    return {
      questionId: "swing-TEST-01",
      model: "m1",
      mode: "blind",
      rep: 0,
      status: "completed",
      submission: {
        direction: "neutral",
        anchor: { timeframe: "day", time: "2026-01-02T20:00:00-04:00", price: 105 },
        scenarios: [
          { label: "a", probability: 60 },
          { label: "b", probability: 40 },
        ],
        range_plan: { low: 95, high: 115 },
        comment: "neutral",
      },
      metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
      traceRef: "",
    };
  }

  it("neutral_correct at the +2*ATR boundary", () => {
    const q = buildQuestion({ dayBars: flatDayBars(15, 110, 100, 105), replayBars: [bar(130, 100, 125)] });
    const verdict = scoreCell(neutralAnswer(), q);
    expect(verdict.outcome).toBe("neutral_correct");
    expect(verdict.direction).toBe("neutral");
    expect(verdict.entry).toBeNull();
    expect(verdict.stop).toBeNull();
    expect(verdict.target).toBeNull();
  });
  it("neutral_wrong just past the boundary", () => {
    const q = buildQuestion({ dayBars: flatDayBars(15, 110, 100, 105), replayBars: [bar(130, 100, 125.5)] });
    const verdict = scoreCell(neutralAnswer(), q);
    expect(verdict.outcome).toBe("neutral_wrong");
    expect(verdict.entry).toBeNull();
  });
});
