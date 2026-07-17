import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Value } from "typebox/value";
import { loadQuestionForScorer } from "../dataset/loader.js";
import type { Question } from "../schema/question.js";
import { RUN_CONFIG_DEFAULTS, type RunConfig } from "../schema/runConfig.js";
import { type Scores, scoresSchema } from "../schema/scores.js";
import { aggregate } from "./aggregate.js";
import { computeAnalysis } from "./analysis.js";
import { scoreCell } from "./cell.js";
import { loadPredictions } from "./predictions.js";

interface RunConfigSnapshot {
  bank?: string;
  datasetVersion?: string;
  config?: { weights?: RunConfig["weights"] };
}

async function readConfigSnapshot(runDir: string): Promise<RunConfigSnapshot> {
  const file = join(runDir, "config.json");
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw == null) return {};
  try {
    return JSON.parse(raw) as RunConfigSnapshot;
  } catch {
    return {};
  }
}

export interface RunScoreOptions {
  runId: string;
  datasetVersion: string;
  resultsRoot: string;
  datasetsRoot: string;
  bank?: string;
}

export async function runScore(options: RunScoreOptions): Promise<Scores> {
  const runDir = join(options.resultsRoot, options.runId);
  const snapshot = await readConfigSnapshot(runDir);
  const bank = options.bank ?? snapshot.bank ?? "swing";
  const weights = snapshot.config?.weights ?? RUN_CONFIG_DEFAULTS.weights;

  const answers = await loadPredictions(join(runDir, "predictions.jsonl"));
  const questions = new Map<string, Question>();
  const cells = [];
  for (const answer of answers) {
    let question = questions.get(answer.questionId);
    if (!question) {
      question = await loadQuestionForScorer(options.datasetsRoot, options.datasetVersion, bank, answer.questionId);
      questions.set(answer.questionId, question);
    }
    cells.push(scoreCell(answer, question));
  }

  const models = aggregate(cells, weights);
  const analysis = computeAnalysis(cells);
  const scores: Scores = { runId: options.runId, datasetVersion: options.datasetVersion, weights, cells, models, analysis };

  if (!Value.Check(scoresSchema, scores)) {
    const first = Value.Errors(scoresSchema, scores)[0];
    throw new Error(`invalid scores: ${first?.instancePath ?? "(root)"} ${first?.message ?? "schema mismatch"}`);
  }

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(join(runDir, "scores.json"), `${JSON.stringify(scores, null, 2)}\n`, "utf8");
  return scores;
}
