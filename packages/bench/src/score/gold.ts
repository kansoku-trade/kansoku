import { promises as fs } from "node:fs";
import { join } from "node:path";
import { listQuestions, loadQuestionForScorer } from "../dataset/loader.js";
import type { AnswerLine } from "../schema/answerLine.js";
import type { Question } from "../schema/question.js";
import { RUN_CONFIG_DEFAULTS } from "../schema/runConfig.js";
import type { Submission } from "../schema/submission.js";
import { aggregate, type ModelAggregate } from "./aggregate.js";
import { scoreCell } from "./cell.js";
import { atr14, cutoffCloseOf } from "./neutral.js";
import { coerceReplayBar, type Direction, replayDirectional } from "./replay.js";

const GOLD_MODEL = "gold/hindsight";

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

interface Candidate {
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  r: number;
}

export function goldSubmissionFor(question: Question): Submission {
  const dayBars = question.fixtures.kline.day ?? [];
  const cutoffClose = cutoffCloseOf(dayBars);
  const atr = atr14(dayBars);
  const bars = question.replay.bars.map(coerceReplayBar);
  const anchor = { timeframe: "day" as const, time: question.cutoff, price: round(cutoffClose) };

  const candidates: Candidate[] = [];
  if (atr != null && atr > 0 && bars.length > 0) {
    const maxHigh = Math.max(...bars.map((bar) => bar.high));
    const minLow = Math.min(...bars.map((bar) => bar.low));
    const longInput = { direction: "long" as const, entry: cutoffClose, stop: cutoffClose - atr, target: maxHigh, bars };
    const shortInput = { direction: "short" as const, entry: cutoffClose, stop: cutoffClose + atr, target: minLow, bars };
    const longResult = replayDirectional(longInput);
    if (longResult.outcome === "win" && longResult.r != null) {
      candidates.push({ ...longInput, r: longResult.r });
    }
    const shortResult = replayDirectional(shortInput);
    if (shortResult.outcome === "win" && shortResult.r != null) {
      candidates.push({ ...shortInput, r: shortResult.r });
    }
  }

  candidates.sort((a, b) => b.r - a.r);
  const pick = candidates[0];
  if (!pick) {
    return {
      direction: "neutral",
      anchor,
      scenarios: [
        { label: "区间震荡", probability: 60 },
        { label: "突破", probability: 40 },
      ],
      range_plan: { low: round(cutoffClose * 0.98), high: round(cutoffClose * 1.02) },
      comment: "gold: 事后无干净的方向性行情，观望。",
    };
  }

  return {
    direction: pick.direction,
    anchor,
    entry_plan: { entry: round(pick.entry), stop: round(pick.stop), target1: round(pick.target) },
    scenarios: [
      { label: pick.direction === "long" ? "续涨" : "续跌", probability: 70 },
      { label: pick.direction === "long" ? "回落" : "反弹", probability: 30 },
    ],
    comment: "gold: 事后最优的机械方向答卷。",
  };
}

export function goldAnswerFor(question: Question): AnswerLine {
  return {
    questionId: question.id,
    model: GOLD_MODEL,
    mode: "blind",
    rep: 0,
    status: "completed",
    submission: goldSubmissionFor(question),
    metrics: { durationMs: 0, costUsd: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 },
    traceRef: "",
  };
}

export interface GoldResult {
  predictionsFile: string;
  total: number;
  directional: number;
  directionalFraction: number;
  checked: boolean;
  passed: boolean | null;
  failures: string[];
  aggregate: ModelAggregate | null;
}

export interface RunGoldOptions {
  datasetVersion: string;
  resultsRoot: string;
  datasetsRoot: string;
  bank?: string;
  check?: boolean;
}

export async function runGold(options: RunGoldOptions): Promise<GoldResult> {
  const bank = options.bank ?? "swing";
  const ids = await listQuestions(options.datasetsRoot, options.datasetVersion, bank);
  const runDir = join(options.resultsRoot, `gold-${options.datasetVersion}`);
  const predictionsFile = join(runDir, "predictions.jsonl");

  const questions: Question[] = [];
  const answers: AnswerLine[] = [];
  let directional = 0;
  for (const id of ids) {
    const question = await loadQuestionForScorer(options.datasetsRoot, options.datasetVersion, bank, id);
    const answer = goldAnswerFor(question);
    questions.push(question);
    answers.push(answer);
    if (answer.submission && answer.submission.direction !== "neutral") directional += 1;
  }

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(predictionsFile, `${answers.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

  const total = ids.length;
  const directionalFraction = total > 0 ? directional / total : 0;

  if (!options.check) {
    return {
      predictionsFile,
      total,
      directional,
      directionalFraction,
      checked: false,
      passed: null,
      failures: [],
      aggregate: null,
    };
  }

  const cells = answers.map((answer, index) => scoreCell(answer, questions[index]));
  const models = aggregate(cells, RUN_CONFIG_DEFAULTS.weights);
  const gold = models.find((model) => model.model === GOLD_MODEL) ?? null;

  const failures: string[] = [];
  if (directionalFraction >= 0.5) {
    if (!gold || !(gold.winRate >= 0.9)) {
      failures.push(`winRate ${gold ? gold.winRate.toFixed(3) : "n/a"} < 0.9`);
    }
    if (!gold || !(gold.expectancy >= 1.0)) {
      failures.push(`expectancy ${gold ? gold.expectancy.toFixed(3) : "n/a"} < 1.0`);
    }
  }

  return {
    predictionsFile,
    total,
    directional,
    directionalFraction,
    checked: true,
    passed: failures.length === 0,
    failures,
    aggregate: gold,
  };
}
