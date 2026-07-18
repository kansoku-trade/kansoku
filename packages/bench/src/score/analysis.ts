import { groupBy, isReferenceModel } from "./aggregate.js";
import type { CellVerdict } from "./cell.js";

export interface QuestionDifficultyEntry {
  questionId: string;
  nModels: number;
  meanScore: number | null;
}

export interface DifficultyTiers {
  allCorrect: QuestionDifficultyEntry[];
  allWrong: QuestionDifficultyEntry[];
  split: QuestionDifficultyEntry[];
}

export interface AgreementPair {
  a: string;
  b: string;
  sharedCount: number;
  agreementRate: number | null;
}

export interface AgreementMatrix {
  models: string[];
  pairs: AgreementPair[];
}

export interface Analysis {
  difficultyTiers: DifficultyTiers;
  agreementMatrix: AgreementMatrix;
}

function competitorCellsOf(cells: CellVerdict[]): CellVerdict[] {
  return cells.filter((c) => !isReferenceModel(c.model));
}

function modelQuestionCorrect(cells: CellVerdict[]): boolean | null {
  const answered = cells.filter((c) => c.outcome !== "api_error");
  if (answered.length === 0) return null;
  const correctFlags = answered.map((c) =>
    c.direction === "neutral" ? c.outcome === "neutral_correct" : c.score != null && c.score > 0,
  );
  const correctCount = correctFlags.filter(Boolean).length;
  return correctCount * 2 > correctFlags.length;
}

export function difficultyTiersOf(cells: CellVerdict[]): DifficultyTiers {
  const byQuestion = groupBy(competitorCellsOf(cells), (c) => c.questionId);
  const allCorrect: QuestionDifficultyEntry[] = [];
  const allWrong: QuestionDifficultyEntry[] = [];
  const split: QuestionDifficultyEntry[] = [];

  for (const [questionId, qCells] of byQuestion) {
    const byModel = groupBy(qCells, (c) => c.model);
    const verdicts: boolean[] = [];
    for (const modelCells of byModel.values()) {
      const verdict = modelQuestionCorrect(modelCells);
      if (verdict != null) verdicts.push(verdict);
    }
    if (verdicts.length === 0) continue;

    const scores = qCells.map((c) => c.score).filter((s): s is number => s != null);
    const meanScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const entry: QuestionDifficultyEntry = { questionId, nModels: verdicts.length, meanScore };

    if (verdicts.every((v) => v)) allCorrect.push(entry);
    else if (verdicts.every((v) => !v)) allWrong.push(entry);
    else split.push(entry);
  }

  const byId = (a: QuestionDifficultyEntry, b: QuestionDifficultyEntry) => a.questionId.localeCompare(b.questionId);
  return {
    allCorrect: allCorrect.sort(byId),
    allWrong: allWrong.sort(byId),
    split: split.sort(byId),
  };
}

type MajorityDirection = "long" | "short" | "neutral" | "tie";

function majorityDirection(cells: CellVerdict[]): MajorityDirection | null {
  const directions = cells.map((c) => c.direction).filter((d): d is "long" | "short" | "neutral" => d != null);
  if (directions.length === 0) return null;

  const counts = new Map<string, number>();
  for (const direction of directions) counts.set(direction, (counts.get(direction) ?? 0) + 1);

  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [direction, count] of counts) {
    if (count > bestCount) {
      best = direction;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  return tie ? "tie" : (best as MajorityDirection);
}

export function agreementMatrixOf(cells: CellVerdict[]): AgreementMatrix {
  const competitorCells = competitorCellsOf(cells);
  const models = [...new Set(competitorCells.map((c) => c.model))].sort();

  const unitsByModel = new Map<string, Map<string, MajorityDirection>>();
  for (const model of models) {
    const modelCells = competitorCells.filter((c) => c.model === model);
    const byUnit = groupBy(modelCells, (c) => `${c.questionId}|${c.mode}`);
    const units = new Map<string, MajorityDirection>();
    for (const [unit, unitCells] of byUnit) {
      const direction = majorityDirection(unitCells);
      if (direction != null) units.set(unit, direction);
    }
    unitsByModel.set(model, units);
  }

  const pairs: AgreementPair[] = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i];
      const b = models[j];
      const unitsA = unitsByModel.get(a) ?? new Map();
      const unitsB = unitsByModel.get(b) ?? new Map();
      const sharedUnits = [...unitsA.keys()].filter((unit) => unitsB.has(unit));
      const sharedCount = sharedUnits.length;

      let agreementRate: number | null = null;
      if (sharedCount >= 5) {
        const agreeCount = sharedUnits.filter((unit) => {
          const da = unitsA.get(unit);
          const db = unitsB.get(unit);
          return da !== "tie" && db !== "tie" && da === db;
        }).length;
        agreementRate = agreeCount / sharedCount;
      }

      pairs.push({ a, b, sharedCount, agreementRate });
    }
  }

  return { models, pairs };
}

export function computeAnalysis(cells: CellVerdict[]): Analysis {
  return { difficultyTiers: difficultyTiersOf(cells), agreementMatrix: agreementMatrixOf(cells) };
}
