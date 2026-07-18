import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Value } from "typebox/value";
import { type Question, questionSchema, type RunnerQuestion } from "../schema/question.js";

export class DatasetValidationError extends Error {}

function bankDir(datasetsRoot: string, version: string, bank: string): string {
  return join(datasetsRoot, version, bank);
}

function questionFile(datasetsRoot: string, version: string, bank: string, id: string): string {
  return join(bankDir(datasetsRoot, version, bank), `${id}.json`);
}

export async function listQuestions(
  datasetsRoot: string,
  version: string,
  bank: string,
): Promise<string[]> {
  const dir = bankDir(datasetsRoot, version, bank);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DatasetValidationError(
        `dataset ${version}/${bank} is not installed under ${datasetsRoot}; run "bench sync-dataset --dataset-version ${version}" first`,
      );
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort();
}

export async function loadQuestionFile(file: string): Promise<Question> {
  const raw = await fs.readFile(file, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (Value.Check(questionSchema, parsed)) return parsed;
  const errors = Value.Errors(questionSchema, parsed);
  const firstError = errors[0];
  const path = firstError?.instancePath || "(root)";
  const message = firstError?.message ?? "does not match Question schema";
  throw new DatasetValidationError(`invalid question in ${file}: ${path} ${message}`);
}

export async function loadQuestionForScorer(
  datasetsRoot: string,
  version: string,
  bank: string,
  id: string,
): Promise<Question> {
  const file = questionFile(datasetsRoot, version, bank, id);
  return loadQuestionFile(file);
}

export async function loadQuestionForRunner(
  datasetsRoot: string,
  version: string,
  bank: string,
  id: string,
): Promise<RunnerQuestion> {
  const file = questionFile(datasetsRoot, version, bank, id);
  const question = await loadQuestionFile(file);
  const { replay: _replay, ...runnerQuestion } = question;
  return runnerQuestion;
}
