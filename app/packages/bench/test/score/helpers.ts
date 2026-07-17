import type { RawBar } from "../../../../shared/types.js";
import { traceRefFor } from "../../src/baseline/results.js";
import type { AnswerLine } from "../../src/schema/answerLine.js";
import type { Question } from "../../src/schema/question.js";
import type { CellVerdict } from "../../src/score/cell.js";

export function bar(high: number, low: number, close: number, open = close): RawBar {
  return { time: "2026-01-05T05:00:00Z", open, high, low, close, volume: 1_000 };
}

export function flatDayBars(count: number, high = 110, low = 100, close = 105): RawBar[] {
  return Array.from({ length: count }, (_, i) => ({
    time: `2026-01-${String((i % 27) + 1).padStart(2, "0")}T05:00:00Z`,
    open: close,
    high,
    low,
    close,
    volume: 1_000,
  }));
}

export function rampDayBars(closes: number[]): RawBar[] {
  return closes.map((close, i) => ({
    time: `2026-01-${String((i % 27) + 1).padStart(2, "0")}T05:00:00Z`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  }));
}

export function buildQuestion(overrides: {
  id?: string;
  dayBars: RawBar[];
  replayBars: RawBar[];
  layer?: string;
  cutoff?: string;
}): Question {
  return {
    id: overrides.id ?? "swing-TEST-01",
    bank: "swing",
    symbol: "TEST.US",
    cutoff: overrides.cutoff ?? "2026-01-02T20:00:00-04:00",
    layer: overrides.layer ?? "high-vol-tech",
    adversarial: false,
    fixtures: {
      kline: { day: overrides.dayBars },
      indicators: {},
      quote: {},
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { horizonBars: overrides.replayBars.length, bars: overrides.replayBars },
  };
}

export function mkCell(overrides: Partial<CellVerdict>): CellVerdict {
  const merged: CellVerdict = {
    model: "m1",
    questionId: "q1",
    mode: "blind",
    rep: 0,
    symbol: "TEST.US",
    layer: "high-vol-tech",
    regime: "up",
    direction: "long",
    entry: 100,
    stop: 90,
    target: 120,
    outcome: "win",
    score: 1,
    r: 1,
    traceRef: null,
    metrics: { durationMs: 0, costUsd: 0, toolCalls: 0 },
    ...overrides,
  };
  if (!("traceRef" in overrides)) {
    merged.traceRef = traceRefFor(merged.model, merged.questionId, merged.mode, merged.rep);
  }
  return merged;
}

export function directionalAnswer(
  overrides: Partial<AnswerLine> & { entry: number; stop: number; target: number; direction: "long" | "short" },
): AnswerLine {
  const { entry, stop, target, direction, ...rest } = overrides;
  return {
    questionId: "swing-TEST-01",
    model: "m1",
    mode: "blind",
    rep: 0,
    status: "completed",
    submission: {
      direction,
      anchor: { timeframe: "day", time: "2026-01-02T20:00:00-04:00", price: entry },
      entry_plan: { entry, stop, target1: target },
      scenarios: [
        { label: "a", probability: 60 },
        { label: "b", probability: 40 },
      ],
      comment: "test",
    },
    metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
    traceRef: "",
    ...rest,
  };
}
