import { promises as fs } from "node:fs";
import type { AnswerLine } from "../schema/answerLine.js";
import { resumeKey } from "../baseline/results.js";

export function dedupePredictions(lines: string[]): AnswerLine[] {
  const byKey = new Map<string, AnswerLine>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: AnswerLine;
    try {
      parsed = JSON.parse(trimmed) as AnswerLine;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    byKey.set(resumeKey(parsed.model, parsed.questionId, parsed.mode, parsed.rep), parsed);
  }
  return [...byKey.values()];
}

export async function loadPredictions(file: string): Promise<AnswerLine[]> {
  const raw = await fs.readFile(file, "utf8");
  return dedupePredictions(raw.split("\n"));
}
