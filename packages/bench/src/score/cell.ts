import type { AnswerLine } from "../schema/answerLine.js";
import type { Question } from "../schema/question.js";
import { atr14, cutoffCloseOf, neutralCorrect, regimeOf } from "./neutral.js";
import { coerceReplayBar, num, replayDirectional } from "./replay.js";

export type CellOutcome =
  | "win"
  | "loss"
  | "timeout_flat"
  | "no_fill"
  | "format_violation"
  | "neutral_correct"
  | "neutral_wrong"
  | "api_error"
  | "agent_timeout";

export type CellDirection = "long" | "short" | "neutral" | null;

export interface CellVerdict {
  model: string;
  questionId: string;
  mode: "blind" | "live";
  rep: number;
  symbol: string;
  layer: string;
  regime: "up" | "down";
  direction: CellDirection;
  entry: number | null;
  stop: number | null;
  target: number | null;
  outcome: CellOutcome;
  score: number | null;
  r: number | null;
  traceRef: string | null;
  metrics: { durationMs: number; costUsd: number; toolCalls: number };
}

function baseVerdict(
  answer: AnswerLine,
  question: Question,
): Omit<CellVerdict, "direction" | "entry" | "stop" | "target" | "outcome" | "score" | "r"> {
  const dayBars = question.fixtures.kline.day ?? [];
  return {
    model: answer.model,
    questionId: answer.questionId,
    mode: answer.mode,
    rep: answer.rep,
    symbol: question.symbol,
    layer: question.layer,
    regime: regimeOf(dayBars),
    traceRef: answer.traceRef || null,
    metrics: {
      durationMs: answer.metrics.durationMs,
      costUsd: answer.metrics.costUsd,
      toolCalls: answer.metrics.toolCalls,
    },
  };
}

export function scoreCell(answer: AnswerLine, question: Question): CellVerdict {
  const base = baseVerdict(answer, question);

  if (answer.status === "api_error") {
    return { ...base, direction: null, entry: null, stop: null, target: null, outcome: "api_error", score: null, r: null };
  }
  if (answer.status === "timeout") {
    return { ...base, direction: null, entry: null, stop: null, target: null, outcome: "agent_timeout", score: null, r: null };
  }

  const submission = answer.submission;
  if (answer.status === "format_violation" || !submission) {
    return { ...base, direction: null, entry: null, stop: null, target: null, outcome: "format_violation", score: null, r: null };
  }

  const dayBars = question.fixtures.kline.day ?? [];

  if (submission.direction === "neutral") {
    const atr = atr14(dayBars);
    if (atr == null || !(atr > 0)) {
      return {
        ...base,
        direction: "neutral",
        entry: null,
        stop: null,
        target: null,
        outcome: "neutral_wrong",
        score: null,
        r: null,
      };
    }
    const correct = neutralCorrect(cutoffCloseOf(dayBars), atr, question.replay.bars);
    return {
      ...base,
      direction: "neutral",
      entry: null,
      stop: null,
      target: null,
      outcome: correct ? "neutral_correct" : "neutral_wrong",
      score: null,
      r: null,
    };
  }

  const plan = submission.entry_plan;
  if (!plan) {
    return {
      ...base,
      direction: submission.direction,
      entry: null,
      stop: null,
      target: null,
      outcome: "format_violation",
      score: null,
      r: null,
    };
  }

  const entry = num(plan.entry);
  const stop = num(plan.stop);
  const target = plan.target1 == null ? Number.NaN : num(plan.target1);

  const result = replayDirectional({
    direction: submission.direction,
    entry,
    stop,
    target,
    bars: question.replay.bars.map(coerceReplayBar),
  });

  return {
    ...base,
    direction: submission.direction,
    entry: Number.isNaN(entry) ? null : entry,
    stop: Number.isNaN(stop) ? null : stop,
    target: Number.isNaN(target) ? null : target,
    outcome: result.outcome,
    score: result.score,
    r: result.r,
  };
}
