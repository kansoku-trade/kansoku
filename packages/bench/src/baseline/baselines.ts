import type { AnswerLine } from "../schema/answerLine.js";
import type { MockMode } from "../schema/mode.js";
import type { RunnerQuestion } from "../schema/question.js";
import type { Submission } from "../schema/submission.js";

export const BASELINE_STRATEGIES = ["buy-hold", "coin-flip", "always-neutral"] as const;
export type BaselineStrategy = (typeof BASELINE_STRATEGIES)[number];

export function isBaselineStrategy(value: string): value is BaselineStrategy {
  return (BASELINE_STRATEGIES as readonly string[]).includes(value);
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function cutoffClose(question: RunnerQuestion): number {
  const last = Number((question.fixtures.quote as { last?: unknown }).last);
  if (Number.isFinite(last)) return last;
  const dayBars = question.fixtures.kline.day ?? [];
  const lastBar = dayBars[dayBars.length - 1];
  const close = lastBar ? Number(lastBar.close) : NaN;
  if (Number.isFinite(close)) return close;
  throw new Error(`baseline: no cutoff close available for ${question.id}`);
}

function charSum(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

function longSubmission(question: RunnerQuestion, close: number): Submission {
  return {
    direction: "long",
    anchor: { timeframe: "day", time: question.cutoff, price: round(close) },
    entry_plan: { entry: round(close), stop: round(close * 0.92), target1: round(close * 1.16) },
    scenarios: [
      { label: "续涨", probability: 60 },
      { label: "回落", probability: 40 },
    ],
    comment: "基线策略：做多，持有到期。",
  };
}

function shortSubmission(question: RunnerQuestion, close: number): Submission {
  return {
    direction: "short",
    anchor: { timeframe: "day", time: question.cutoff, price: round(close) },
    entry_plan: { entry: round(close), stop: round(close * 1.08), target1: round(close * 0.84) },
    scenarios: [
      { label: "续跌", probability: 60 },
      { label: "反弹", probability: 40 },
    ],
    comment: "基线策略：做空，持有到期。",
  };
}

function neutralSubmission(question: RunnerQuestion, close: number): Submission {
  return {
    direction: "neutral",
    anchor: { timeframe: "day", time: question.cutoff, price: round(close) },
    scenarios: [
      { label: "区间震荡", probability: 60 },
      { label: "突破", probability: 40 },
    ],
    range_plan: { low: round(close * 0.97), high: round(close * 1.03) },
    comment: "基线策略：永远观望，不给方向。",
  };
}

export function baselineSubmission(strategy: BaselineStrategy, question: RunnerQuestion): Submission {
  const close = cutoffClose(question);
  if (strategy === "always-neutral") return neutralSubmission(question, close);
  const goLong = strategy === "buy-hold" || charSum(question.id) % 2 === 0;
  return goLong ? longSubmission(question, close) : shortSubmission(question, close);
}

export function buildBaselineAnswer(
  strategy: BaselineStrategy,
  question: RunnerQuestion,
  mode: MockMode,
  rep = 0,
): AnswerLine {
  return {
    questionId: question.id,
    model: `baseline/${strategy}`,
    mode,
    rep,
    status: "completed",
    submission: baselineSubmission(strategy, question),
    metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
    traceRef: "",
  };
}
