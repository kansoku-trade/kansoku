import { promises as fs } from "node:fs";
import { join } from "node:path";
import { listQuestions, loadQuestionForRunner } from "../dataset/loader.js";
import type { MockMode } from "../schema/mode.js";
import type { RunnerQuestion } from "../schema/question.js";
import { type BaselineStrategy, buildBaselineAnswer } from "./baselines.js";
import { createAppendQueue, loadResumeKeys, resumeKey, writeConfigSnapshot } from "./results.js";

async function selectQuestions(
  datasetsRoot: string,
  version: string,
  bank: string,
  named: string[] | undefined,
): Promise<Map<string, RunnerQuestion>> {
  const available = await listQuestions(datasetsRoot, version, bank);
  const ids = named ?? available;
  if (named) {
    const missing = named.filter((id) => !available.includes(id));
    if (missing.length) throw new Error(`unknown question id(s): ${missing.join(", ")}`);
  }
  const out = new Map<string, RunnerQuestion>();
  for (const id of ids) out.set(id, await loadQuestionForRunner(datasetsRoot, version, bank, id));
  return out;
}

export interface BaselineBenchOptions {
  strategies: BaselineStrategy[];
  datasetVersion: string;
  bank: string;
  modes?: MockMode[];
  runId: string;
  resultsRoot: string;
  datasetsRoot: string;
  questionIds?: string[];
  gitSha?: string;
  startedAt?: string;
  log?: (line: string) => void;
}

export interface BaselineBenchResult {
  runId: string;
  planned: number;
  written: number;
  skipped: number;
  predictionsFile: string;
}

export async function runBenchBaseline(options: BaselineBenchOptions): Promise<BaselineBenchResult> {
  const log = options.log ?? (() => {});
  const modes = options.modes ?? (["blind", "live"] as MockMode[]);
  const runDir = join(options.resultsRoot, options.runId);
  const predictionsFile = join(runDir, "predictions.jsonl");
  const configFile = join(runDir, "config.json");

  const hasConfig = await fs
    .access(configFile)
    .then(() => true)
    .catch(() => false);
  if (!hasConfig) {
    await writeConfigSnapshot(configFile, {
      runId: options.runId,
      startedAt: options.startedAt ?? new Date().toISOString(),
      datasetVersion: options.datasetVersion,
      bank: options.bank,
      gitSha: options.gitSha ?? null,
      baselines: options.strategies,
      modes,
    });
  }

  const resumed = await loadResumeKeys(predictionsFile);
  const questions = await selectQuestions(
    options.datasetsRoot,
    options.datasetVersion,
    options.bank,
    options.questionIds,
  );

  const appendQueue = createAppendQueue();
  let planned = 0;
  let skipped = 0;
  let written = 0;

  for (const strategy of options.strategies) {
    const model = `baseline/${strategy}`;
    for (const [id, question] of questions) {
      for (const mode of modes) {
        planned += 1;
        if (resumed.has(resumeKey(model, id, mode, 0))) {
          skipped += 1;
          continue;
        }
        await appendQueue(predictionsFile, buildBaselineAnswer(strategy, question, mode));
        written += 1;
        log(`[baseline] ${model} ${id} ${mode}`);
      }
    }
  }

  return { runId: options.runId, planned, written, skipped, predictionsFile };
}
