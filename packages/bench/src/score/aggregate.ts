import type { RunConfig } from "../schema/runConfig.js";
import type { CellVerdict } from "./cell.js";
import { clamp } from "./replay.js";

export interface JudgmentSummary {
  cellCount: number;
  winRate: number;
  expectancy: number;
  expectancyNorm: number;
  neutralAccuracy: number;
  judgment: number;
  abstainRate: number;
}

export interface ToolCallStats {
  mean: number;
  p50: number;
  p90: number;
}

export interface ModelAggregate extends JudgmentSummary {
  model: string;
  noFillRate: number;
  formatViolationRate: number;
  timeoutRate: number;
  apiErrorRate: number;
  costScore: number | null;
  timeScore: number | null;
  efficiency: number | null;
  total: number;
  meanCostUsd: number;
  meanDurationMs: number;
  toolCalls: ToolCallStats;
  noiseDelta: number | null;
  consistency: number;
  avgWinnerR: number | null;
  modes: Record<string, JudgmentSummary>;
  layers: Record<string, JudgmentSummary>;
  regimes: Record<string, JudgmentSummary>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function nearestRank(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(percentile * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function rawNeutralAccuracy(cells: CellVerdict[]): number | null {
  let correct = 0;
  let total = 0;
  for (const cell of cells) {
    if (cell.outcome === "neutral_correct") {
      correct += 1;
      total += 1;
    } else if (cell.outcome === "neutral_wrong") {
      total += 1;
    }
  }
  return total > 0 ? correct / total : null;
}

export function judgmentSummary(cells: CellVerdict[], neutralFallback: number): JudgmentSummary {
  let winCount = 0;
  let lossCount = 0;
  let scoreSum = 0;
  let filled = 0;
  let neutralCorrect = 0;
  let neutralTotal = 0;

  for (const cell of cells) {
    switch (cell.outcome) {
      case "win":
        winCount += 1;
        scoreSum += cell.score ?? 0;
        filled += 1;
        break;
      case "loss":
        lossCount += 1;
        scoreSum += cell.score ?? 0;
        filled += 1;
        break;
      case "timeout_flat":
        if ((cell.score ?? 0) > 0) winCount += 1;
        else lossCount += 1;
        scoreSum += cell.score ?? 0;
        filled += 1;
        break;
      case "neutral_correct":
        neutralCorrect += 1;
        neutralTotal += 1;
        break;
      case "neutral_wrong":
        neutralTotal += 1;
        break;
      default:
        break;
    }
  }

  const winRate = winCount + lossCount > 0 ? winCount / (winCount + lossCount) : 0;
  const expectancy = filled > 0 ? scoreSum / filled : 0;
  const expectancyNorm = clamp((expectancy + 1) / 3, 0, 1);
  const neutralAccuracy = neutralTotal > 0 ? neutralCorrect / neutralTotal : neutralFallback;
  const judgment = 0.4 * winRate + 0.4 * expectancyNorm + 0.2 * neutralAccuracy;
  const scored = cells.filter((c) => c.outcome !== "api_error");
  const abstainRate = scored.length > 0 ? neutralTotal / scored.length : 0;

  return { cellCount: cells.length, winRate, expectancy, expectancyNorm, neutralAccuracy, judgment, abstainRate };
}

function avgWinnerROf(cells: CellVerdict[]): number | null {
  const wins = cells.filter((c) => c.outcome === "win");
  if (wins.length === 0) return null;
  return wins.reduce((acc, c) => acc + (c.score ?? 0), 0) / wins.length;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item));
    if (bucket) bucket.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

function summarizeGroups(
  cells: CellVerdict[],
  key: (cell: CellVerdict) => string,
  neutralFallback: number,
): Record<string, JudgmentSummary> {
  const out: Record<string, JudgmentSummary> = {};
  for (const [name, group] of groupBy(cells, key)) out[name] = judgmentSummary(group, neutralFallback);
  return out;
}

function noiseDeltaOf(cells: CellVerdict[], neutralFallback: number): number | null {
  const blindQ = new Set(cells.filter((c) => c.mode === "blind").map((c) => c.questionId));
  const liveQ = new Set(cells.filter((c) => c.mode === "live").map((c) => c.questionId));
  const shared = new Set([...blindQ].filter((q) => liveQ.has(q)));
  if (shared.size === 0) return null;
  const blind = judgmentSummary(
    cells.filter((c) => c.mode === "blind" && shared.has(c.questionId)),
    neutralFallback,
  );
  const live = judgmentSummary(
    cells.filter((c) => c.mode === "live" && shared.has(c.questionId)),
    neutralFallback,
  );
  return blind.judgment - live.judgment;
}

function consistencyOf(cells: CellVerdict[]): number {
  const groups = groupBy(cells, (c) => `${c.questionId}|${c.mode}`);
  let denom = 0;
  let disagree = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    denom += 1;
    const directions = new Set(group.filter((c) => c.direction != null).map((c) => c.direction));
    if (directions.size > 1) disagree += 1;
  }
  return denom > 0 ? disagree / denom : 0;
}

function rateOf(cells: CellVerdict[], outcome: CellVerdict["outcome"]): number {
  if (cells.length === 0) return 0;
  return cells.filter((c) => c.outcome === outcome).length / cells.length;
}

interface ModelDraft {
  model: string;
  cells: CellVerdict[];
  meanCostUsd: number;
  meanDurationMs: number;
  rawNeutral: number | null;
}

export function isReferenceModel(model: string): boolean {
  return model.startsWith("baseline/") || model.startsWith("gold/");
}

export function aggregate(cells: CellVerdict[], weights: RunConfig["weights"]): ModelAggregate[] {
  const byModel = groupBy(cells, (c) => c.model);
  const drafts: ModelDraft[] = [];
  for (const [model, modelCells] of byModel) {
    // Cost/time means exclude api_error cells: those never ran the model, so their ~0 cost
    // would otherwise flatter a flaky provider on the efficiency axis.
    const priced = modelCells.filter((c) => c.outcome !== "api_error");
    const n = priced.length;
    const meanCostUsd = n > 0 ? priced.reduce((acc, c) => acc + c.metrics.costUsd, 0) / n : 0;
    const meanDurationMs = n > 0 ? priced.reduce((acc, c) => acc + c.metrics.durationMs, 0) / n : 0;
    drafts.push({ model, cells: modelCells, meanCostUsd, meanDurationMs, rawNeutral: rawNeutralAccuracy(modelCells) });
  }

  const neutralMedian = median(drafts.map((d) => d.rawNeutral).filter((v): v is number => v != null)) ?? 0;

  // baseline/* and gold/* rows carry cost/duration 0 by construction; keeping them in the
  // min-max pool pins them at efficiency 1.0 and compresses the real models. They are scored
  // on judgment alone (efficiency = null, total = judgment), and excluded from the pool.
  const competitors = drafts.filter((d) => !isReferenceModel(d.model));
  const costs = competitors.map((d) => d.meanCostUsd);
  const times = competitors.map((d) => d.meanDurationMs);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const single = competitors.length <= 1;

  const models: ModelAggregate[] = drafts.map((draft) => {
    const summary = judgmentSummary(draft.cells, neutralMedian);
    const reference = isReferenceModel(draft.model);
    const costScore = reference ? null : single || maxCost === minCost ? 1 : (maxCost - draft.meanCostUsd) / (maxCost - minCost);
    const timeScore = reference ? null : single || maxTime === minTime ? 1 : (maxTime - draft.meanDurationMs) / (maxTime - minTime);
    const efficiency = reference ? null : 0.5 * (costScore as number) + 0.5 * (timeScore as number);
    const total = reference ? summary.judgment : weights.judgment * summary.judgment + weights.efficiency * (efficiency as number);
    const toolCallValues = draft.cells.map((c) => c.metrics.toolCalls);
    const toolCallMean =
      toolCallValues.length > 0 ? toolCallValues.reduce((acc, v) => acc + v, 0) / toolCallValues.length : 0;

    return {
      model: draft.model,
      ...summary,
      noFillRate: rateOf(draft.cells, "no_fill"),
      formatViolationRate: rateOf(draft.cells, "format_violation"),
      timeoutRate: rateOf(draft.cells, "agent_timeout"),
      apiErrorRate: rateOf(draft.cells, "api_error"),
      costScore,
      timeScore,
      efficiency,
      total,
      meanCostUsd: draft.meanCostUsd,
      meanDurationMs: draft.meanDurationMs,
      toolCalls: {
        mean: toolCallMean,
        p50: nearestRank(toolCallValues, 0.5),
        p90: nearestRank(toolCallValues, 0.9),
      },
      noiseDelta: noiseDeltaOf(draft.cells, neutralMedian),
      consistency: consistencyOf(draft.cells),
      avgWinnerR: avgWinnerROf(draft.cells),
      modes: summarizeGroups(draft.cells, (c) => c.mode, neutralMedian),
      layers: summarizeGroups(draft.cells, (c) => c.layer, neutralMedian),
      regimes: summarizeGroups(draft.cells, (c) => c.regime, neutralMedian),
    };
  });

  return models.sort((a, b) => b.total - a.total);
}
