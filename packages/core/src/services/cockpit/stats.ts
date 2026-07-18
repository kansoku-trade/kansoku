import type { AnalysisOutcome, PredictionStats, StatsBucket } from "@kansoku/shared/types";

export type StatsOrigin = "analyst" | "manual";

export interface StatsRow {
  direction: "long" | "short" | "neutral" | null;
  origin: StatsOrigin;
  outcome: AnalysisOutcome | null;
}

interface MutableBucket extends StatsBucket {
  resolved_pct_sum: number;
  resolved_count: number;
  r_sum: number;
  r_count: number;
}

function emptyBucket(): MutableBucket {
  return {
    total: 0,
    hit_target: 0,
    hit_stop: 0,
    held_range: 0,
    broke_range: 0,
    open: 0,
    unjudged: 0,
    win_rate: null,
    avg_pct: null,
    avg_r: null,
    resolved_pct_sum: 0,
    resolved_count: 0,
    r_sum: 0,
    r_count: 0,
  };
}

function addRow(bucket: MutableBucket, outcome: AnalysisOutcome | null): void {
  bucket.total += 1;
  if (!outcome) {
    bucket.unjudged += 1;
    return;
  }
  if (outcome.status === "hit_target") bucket.hit_target += 1;
  else if (outcome.status === "hit_stop") bucket.hit_stop += 1;
  else if (outcome.status === "held_range") bucket.held_range += 1;
  else if (outcome.status === "broke_range") bucket.broke_range += 1;
  else bucket.open += 1;
  if (outcome.status !== "open") {
    bucket.resolved_pct_sum += outcome.pct_since_anchor;
    bucket.resolved_count += 1;
  }
  if (outcome.r_multiple != null) {
    bucket.r_sum += outcome.r_multiple;
    bucket.r_count += 1;
  }
}

function finalize(bucket: MutableBucket): StatsBucket {
  const resolved = bucket.hit_target + bucket.hit_stop + bucket.held_range + bucket.broke_range;
  return {
    total: bucket.total,
    hit_target: bucket.hit_target,
    hit_stop: bucket.hit_stop,
    held_range: bucket.held_range,
    broke_range: bucket.broke_range,
    open: bucket.open,
    unjudged: bucket.unjudged,
    win_rate: resolved > 0 ? (bucket.hit_target + bucket.held_range) / resolved : null,
    avg_pct: bucket.resolved_count > 0 ? bucket.resolved_pct_sum / bucket.resolved_count : null,
    avg_r: bucket.r_count > 0 ? bucket.r_sum / bucket.r_count : null,
  };
}

export function aggregateStats(rows: StatsRow[]): PredictionStats {
  const overall = emptyBucket();
  const long = emptyBucket();
  const short = emptyBucket();
  const neutral = emptyBucket();
  const analyst = emptyBucket();
  const manual = emptyBucket();

  for (const row of rows) {
    addRow(overall, row.outcome);
    if (row.direction === "long") addRow(long, row.outcome);
    else if (row.direction === "short") addRow(short, row.outcome);
    else if (row.direction === "neutral") addRow(neutral, row.outcome);
    addRow(row.origin === "analyst" ? analyst : manual, row.outcome);
  }

  return {
    total: rows.length,
    overall: finalize(overall),
    by_direction: { long: finalize(long), short: finalize(short), neutral: finalize(neutral) },
    by_origin: { analyst: finalize(analyst), manual: finalize(manual) },
  };
}
