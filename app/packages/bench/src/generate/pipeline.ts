import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadQuestionForScorer } from "../dataset/loader.js";
import type { Question } from "../schema/question.js";
import { assembleQuestion, type QuoteBar } from "./assemble.js";
import { cacheFile, readCache, writeCache } from "./cache.js";
import { checkAnomalies } from "./filters.js";
import type { SymbolSpec } from "./symbols.js";
import type { FetchCalendar, FetchKlineHistory } from "./source.js";
import { firstIndexOnOrAfter, hasSufficientWeekHistory, planCutoffIndices } from "./windowing.js";

export const REQUIRED_BEFORE_DAY = 250;
export const REQUIRED_BEFORE_WEEK = 104;
export const HORIZON_BARS = 20;
export const MIN_CUTOFF_DATE = "2026-01-01";
export const HISTORY_START = "2022-01-01";
const CALENDAR_LOOKAHEAD_DAYS = 180;

export interface GenerateOptions {
  bank: "swing";
  symbols: SymbolSpec[];
  version: string;
  windowsPerSymbol: number;
  dryRun: boolean;
  fresh: boolean;
  datasetsRoot: string;
  sourceCacheRoot?: string;
  fetchKlineHistory: FetchKlineHistory;
  fetchCalendar: FetchCalendar;
  now: () => Date;
  log: (line: string) => void;
}

export interface GeneratedFile {
  id: string;
  path: string;
}

export interface SkippedWindow {
  symbol: string;
  cutoffDate: string;
  reasons: string[];
}

export interface GenerateResult {
  written: GeneratedFile[];
  skipped: SkippedWindow[];
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(Date.parse(`${dateStr}T00:00:00Z`));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

async function loadSymbolPeriod(
  symbol: string,
  period: "day" | "week",
  options: GenerateOptions,
  endDate: string,
): Promise<QuoteBar[]> {
  const sourceCacheRoot = options.sourceCacheRoot ?? join(options.datasetsRoot, ".cache");
  const file = cacheFile(sourceCacheRoot, symbol, period);
  if (!options.fresh) {
    const cached = await readCache<QuoteBar[]>(file);
    if (cached) return cached;
  }
  const bars = await options.fetchKlineHistory(symbol, period, HISTORY_START, endDate);
  await writeCache(file, bars);
  return bars;
}

async function fetchCalendarFixture(
  symbol: string,
  cutoffDate: string,
  options: GenerateOptions,
): Promise<Record<string, unknown>> {
  try {
    const events = await options.fetchCalendar(symbol, cutoffDate, addDays(cutoffDate, CALENDAR_LOOKAHEAD_DAYS));
    return { events };
  } catch (error) {
    options.log(`  calendar fetch failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

async function writeQuestionFile(
  datasetsRoot: string,
  version: string,
  bank: string,
  question: Question,
): Promise<string> {
  const dir = join(datasetsRoot, version, bank);
  await fs.mkdir(dir, { recursive: true });
  const file = join(dir, `${question.id}.json`);
  await fs.writeFile(file, `${JSON.stringify(question, null, 2)}\n`, "utf8");
  return file;
}

export async function runGenerate(options: GenerateOptions): Promise<GenerateResult> {
  const written: GeneratedFile[] = [];
  const skipped: SkippedWindow[] = [];
  const endDate = formatDate(options.now());

  for (const spec of options.symbols) {
    const dayBars = await loadSymbolPeriod(spec.symbol, "day", options, endDate);
    const weekBars = await loadSymbolPeriod(spec.symbol, "week", options, endDate);

    const minCandidateIndex = firstIndexOnOrAfter(dayBars, MIN_CUTOFF_DATE);
    const cutoffIndices = planCutoffIndices({
      totalBars: dayBars.length,
      requiredBefore: REQUIRED_BEFORE_DAY,
      requiredAfter: HORIZON_BARS,
      windowsPerSymbol: options.windowsPerSymbol,
      minCandidateIndex,
    });

    options.log(
      `${spec.symbol}: ${dayBars.length} day bars, ${weekBars.length} week bars, ${cutoffIndices.length} candidate cutoff(s)`,
    );

    let seq = 0;
    for (const cutoffIndex of cutoffIndices) {
      const cutoffDate = dayBars[cutoffIndex].time.slice(0, 10);
      const reasons: string[] = checkAnomalies({
        bars: dayBars,
        cutoffIndex,
        requiredBefore: REQUIRED_BEFORE_DAY,
        requiredAfter: HORIZON_BARS,
      });
      if (!hasSufficientWeekHistory(weekBars, cutoffDate, REQUIRED_BEFORE_WEEK)) {
        reasons.push("insufficient_week_history");
      }

      if (reasons.length > 0) {
        options.log(`  skip ${spec.symbol} ${cutoffDate}: ${reasons.join(", ")}`);
        skipped.push({ symbol: spec.symbol, cutoffDate, reasons });
        continue;
      }

      seq += 1;
      const calendar = options.dryRun ? {} : await fetchCalendarFixture(spec.symbol, cutoffDate, options);

      const question = assembleQuestion({
        symbol: spec.symbol,
        layer: spec.layer,
        dayBars,
        weekBars,
        cutoffIndex,
        seq,
        requiredBeforeDay: REQUIRED_BEFORE_DAY,
        requiredBeforeWeek: REQUIRED_BEFORE_WEEK,
        horizonBars: HORIZON_BARS,
        calendar,
      });

      options.log(`  plan ${question.id}: cutoff=${question.cutoff}`);

      if (options.dryRun) continue;

      const file = await writeQuestionFile(options.datasetsRoot, options.version, options.bank, question);
      await loadQuestionForScorer(options.datasetsRoot, options.version, options.bank, question.id);
      written.push({ id: question.id, path: file });
    }
  }

  return { written, skipped };
}
