import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadQuestionFile, loadQuestionForScorer } from "../dataset/loader.js";
import type { BenchNewsItem } from "../schema/newsItem.js";
import type { Question } from "../schema/question.js";
import type { FetchArchiveFile, ReadArchiveCsv } from "./archiveSource.js";
import { cacheFile, readCache, writeCache } from "./cache.js";
import { archiveCachePeriod, enumerateArchiveGrid } from "./gdeltArchiveWindow.js";
import { extractArchiveMatches, mapArchiveMatches } from "./gdeltArchiveMapping.js";
import type { ArchiveMatch, ArchiveWindowRequest } from "./gdeltArchiveMapping.js";
import { assertNoLeak, mapEdgarFilings, mapGdeltArticles } from "./newsMapping.js";
import type { EdgarFiling, GdeltArticle } from "./newsMapping.js";
import type { FetchEdgarFilings, FetchGdeltArticles } from "./newsSource.js";
import { edgarWindow, gdeltWindow, toGdeltStamp } from "./newsWindow.js";
import { specForSymbol } from "./symbols.js";

export type NewsSourceMode = "doc" | "archive" | "auto";

export const DEFAULT_ARCHIVE_THROTTLE_MS = 1000;

export interface NewsBackfillDeps {
  sourceCacheRoot: string;
  fresh: boolean;
  fetchGdelt: FetchGdeltArticles;
  fetchEdgar: FetchEdgarFilings;
  fetchArchiveFile?: FetchArchiveFile;
  readArchiveCsv?: ReadArchiveCsv;
  archiveThrottleMs?: number;
  log: (line: string) => void;
}

export const GDELT_CIRCUIT_BREAKER_THRESHOLD = 2;

export interface GdeltCircuitBreaker {
  consecutiveFailures: number;
  tripped: boolean;
}

export function newGdeltCircuitBreaker(): GdeltCircuitBreaker {
  return { consecutiveFailures: 0, tripped: false };
}

export function recordGdeltOutcome(breaker: GdeltCircuitBreaker, failed: boolean): void {
  if (!failed) {
    breaker.consecutiveFailures = 0;
    return;
  }
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= GDELT_CIRCUIT_BREAKER_THRESHOLD) breaker.tripped = true;
}

export interface QuestionNewsResult {
  news: BenchNewsItem[];
  gdeltCount: number;
  archiveCount: number;
  edgarCount: number;
  gdeltError: string | null;
  gdeltSkipped: boolean;
  usedArchive: boolean;
}

async function loadGdeltArticles(
  symbol: string,
  companyQuery: string,
  startIso: string,
  endIso: string,
  deps: NewsBackfillDeps,
): Promise<GdeltArticle[]> {
  const period = `news-gdelt-${toGdeltStamp(startIso)}-${toGdeltStamp(endIso)}`;
  const file = cacheFile(deps.sourceCacheRoot, symbol, period);
  if (!deps.fresh) {
    const cached = await readCache<GdeltArticle[]>(file);
    if (cached) return cached;
  }
  const articles = await deps.fetchGdelt(companyQuery, startIso, endIso);
  await writeCache(file, articles);
  return articles;
}

async function loadEdgarFilings(symbol: string, cik: string, deps: NewsBackfillDeps): Promise<EdgarFiling[]> {
  const file = cacheFile(deps.sourceCacheRoot, symbol, "news-edgar-full");
  if (!deps.fresh) {
    const cached = await readCache<EdgarFiling[]>(file);
    if (cached) return cached;
  }
  const filings = await deps.fetchEdgar(cik);
  await writeCache(file, filings);
  return filings;
}

async function fileExists(path: string): Promise<boolean> {
  return fs.stat(path).then(
    () => true,
    () => false,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function filterUncachedArchiveRequests(
  sourceCacheRoot: string,
  cutoffIso: string,
  requests: ArchiveWindowRequest[],
): Promise<ArchiveWindowRequest[]> {
  const pending: ArchiveWindowRequest[] = [];
  for (const request of requests) {
    const file = cacheFile(sourceCacheRoot, request.symbol, archiveCachePeriod(cutoffIso));
    const cached = await readCache<ArchiveMatch[]>(file);
    if (cached == null) pending.push(request);
  }
  return pending;
}

async function scanArchiveWindowAndCache(
  cutoffIso: string,
  requests: ArchiveWindowRequest[],
  deps: NewsBackfillDeps,
): Promise<void> {
  if (!deps.fetchArchiveFile || !deps.readArchiveCsv) {
    throw new Error("archive news source selected but fetchArchiveFile/readArchiveCsv were not provided");
  }
  const fetchArchiveFile = deps.fetchArchiveFile;
  const readArchiveCsv = deps.readArchiveCsv;
  const throttleMs = deps.archiveThrottleMs ?? DEFAULT_ARCHIVE_THROTTLE_MS;

  const zipCacheDir = join(deps.sourceCacheRoot, "gdelt-arch");
  const stamps = enumerateArchiveGrid(cutoffIso);
  const bySymbol = new Map<string, ArchiveMatch[]>();
  for (const request of requests) bySymbol.set(request.symbol, []);

  let downloaded = 0;
  let gaps = 0;

  for (const stamp of stamps) {
    const zipPath = join(zipCacheDir, `${stamp}.gkg.csv.zip`);
    const alreadyCached = await fileExists(zipPath);
    if (!alreadyCached) {
      const buf = await fetchArchiveFile(stamp);
      if (buf == null) {
        gaps += 1;
        deps.log(`  gdelt-arch: grid gap at ${stamp} (404, skipping)`);
        continue;
      }
      await fs.mkdir(zipCacheDir, { recursive: true });
      await fs.writeFile(zipPath, buf);
      downloaded += 1;
      await sleep(throttleMs);
    }

    let csv: string;
    try {
      csv = await readArchiveCsv(zipPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(`  gdelt-arch: failed to unzip ${stamp}: ${message}`);
      continue;
    }

    const matches = extractArchiveMatches(csv, requests);
    for (const [symbol, rows] of matches) {
      bySymbol.get(symbol)!.push(...rows);
    }
  }

  deps.log(
    `  gdelt-arch window ${cutoffIso}: ${stamps.length} grid points, ${downloaded} downloaded, ${gaps} gaps, ${requests.length} symbols scanned`,
  );

  for (const [symbol, rows] of bySymbol) {
    const file = cacheFile(deps.sourceCacheRoot, symbol, archiveCachePeriod(cutoffIso));
    await writeCache(file, rows);
  }
}

async function ensureArchiveWindowScanned(
  cutoffIso: string,
  windowRequests: Map<string, ArchiveWindowRequest[]>,
  scannedWindows: Set<string>,
  deps: NewsBackfillDeps,
): Promise<void> {
  if (scannedWindows.has(cutoffIso)) return;
  scannedWindows.add(cutoffIso);

  const requests = windowRequests.get(cutoffIso) ?? [];
  if (requests.length === 0) return;

  const pending = deps.fresh
    ? requests
    : await filterUncachedArchiveRequests(deps.sourceCacheRoot, cutoffIso, requests);
  if (pending.length === 0) return;

  await scanArchiveWindowAndCache(cutoffIso, pending, deps);
}

async function loadArchiveNewsForSymbol(
  symbol: string,
  cutoff: string,
  windowRequests: Map<string, ArchiveWindowRequest[]>,
  scannedWindows: Set<string>,
  deps: NewsBackfillDeps,
): Promise<BenchNewsItem[]> {
  await ensureArchiveWindowScanned(cutoff, windowRequests, scannedWindows, deps);
  const file = cacheFile(deps.sourceCacheRoot, symbol, archiveCachePeriod(cutoff));
  const matches = (await readCache<ArchiveMatch[]>(file)) ?? [];
  return mapArchiveMatches(matches, cutoff);
}

export interface ComputeNewsOptions {
  symbol: string;
  cutoff: string;
  companyQuery: string | null;
  cik: string | null;
  deps: NewsBackfillDeps;
  newsSource?: NewsSourceMode;
  breaker?: GdeltCircuitBreaker;
  windowRequests?: Map<string, ArchiveWindowRequest[]>;
  scannedWindows?: Set<string>;
}

export async function computeNewsForQuestion(options: ComputeNewsOptions): Promise<QuestionNewsResult> {
  const { symbol, cutoff, companyQuery, cik, deps, breaker } = options;
  const newsSource = options.newsSource ?? "doc";
  const windowRequests = options.windowRequests ?? new Map<string, ArchiveWindowRequest[]>();
  const scannedWindows = options.scannedWindows ?? new Set<string>();

  let gdeltItems: BenchNewsItem[] = [];
  let archiveItems: BenchNewsItem[] = [];
  let gdeltError: string | null = null;
  let gdeltSkipped = false;
  let usedArchive = false;

  if (companyQuery) {
    if (newsSource === "archive") {
      usedArchive = true;
      archiveItems = await loadArchiveNewsForSymbol(symbol, cutoff, windowRequests, scannedWindows, deps);
    } else if (breaker?.tripped) {
      if (newsSource === "auto") {
        usedArchive = true;
        deps.log(`  gdelt circuit breaker already tripped: using archive for ${symbol} (cutoff ${cutoff})`);
        archiveItems = await loadArchiveNewsForSymbol(symbol, cutoff, windowRequests, scannedWindows, deps);
      } else {
        gdeltSkipped = true;
        deps.log(`  gdelt skipped for ${symbol} (circuit breaker tripped: durably rate-limited this run)`);
      }
    } else {
      try {
        const { startIso, endIso } = gdeltWindow(cutoff);
        const articles = await loadGdeltArticles(symbol, companyQuery, startIso, endIso, deps);
        gdeltItems = mapGdeltArticles(articles, cutoff);
        if (breaker) recordGdeltOutcome(breaker, false);
      } catch (error) {
        gdeltError = error instanceof Error ? error.message : String(error);
        deps.log(`  gdelt fetch failed for ${symbol} (cutoff ${cutoff}): ${gdeltError}`);
        if (breaker) recordGdeltOutcome(breaker, true);
        if (newsSource === "auto" && breaker?.tripped) {
          usedArchive = true;
          deps.log(`  gdelt circuit breaker just tripped: switching to archive for ${symbol} (cutoff ${cutoff})`);
          archiveItems = await loadArchiveNewsForSymbol(symbol, cutoff, windowRequests, scannedWindows, deps);
        }
      }
    }
  }

  let edgarItems: BenchNewsItem[] = [];
  if (cik) {
    const filings = await loadEdgarFilings(symbol, cik, deps);
    const { startDate, endDate } = edgarWindow(cutoff);
    edgarItems = mapEdgarFilings(filings, cutoff, cik, startDate, endDate);
  }

  const news = [...gdeltItems, ...archiveItems, ...edgarItems];
  assertNoLeak(news, cutoff);
  return {
    news,
    gdeltCount: gdeltItems.length,
    archiveCount: archiveItems.length,
    edgarCount: edgarItems.length,
    gdeltError,
    gdeltSkipped,
    usedArchive,
  };
}

function questionFilePath(datasetsRoot: string, version: string, bank: string, id: string): string {
  return join(datasetsRoot, version, bank, `${id}.json`);
}

function buildWindowRequests(questions: Question[]): Map<string, ArchiveWindowRequest[]> {
  const windowRequests = new Map<string, ArchiveWindowRequest[]>();
  for (const question of questions) {
    const spec = specForSymbol(question.symbol);
    if (!spec.archiveTerms) continue;
    const requests = windowRequests.get(question.cutoff) ?? [];
    if (!requests.some((request) => request.symbol === question.symbol)) {
      requests.push({ symbol: question.symbol, terms: spec.archiveTerms });
    }
    windowRequests.set(question.cutoff, requests);
  }
  return windowRequests;
}

export interface BackfillNewsOptions {
  datasetsRoot: string;
  sourceCacheRoot?: string;
  resultsRoot: string;
  version: string;
  bank: string;
  symbols?: string[];
  dryRun: boolean;
  fresh: boolean;
  newsSource?: NewsSourceMode;
  fetchGdelt: FetchGdeltArticles;
  fetchEdgar: FetchEdgarFilings;
  fetchArchiveFile?: FetchArchiveFile;
  readArchiveCsv?: ReadArchiveCsv;
  archiveThrottleMs?: number;
  log: (line: string) => void;
  listQuestionIds: (datasetsRoot: string, version: string, bank: string) => Promise<string[]>;
}

export interface QuestionBackfillOutcome {
  id: string;
  symbol: string;
  gdeltCount: number;
  edgarCount: number;
  archiveCount?: number;
  gdeltError?: string;
  gdeltSkipped?: boolean;
}

export interface BackfillNewsResult {
  processed: QuestionBackfillOutcome[];
  frozenWarning: string[];
  failed: { id: string; error: string }[];
  gdeltFailures: string[];
  gdeltCircuitTripped: boolean;
}

export async function findRunsReferencingVersion(resultsRoot: string, version: string): Promise<string[]> {
  const found: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(resultsRoot);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const configFile = join(resultsRoot, entry, "config.json");
    try {
      const raw = await fs.readFile(configFile, "utf8");
      const parsed = JSON.parse(raw) as { datasetVersion?: string };
      if (parsed.datasetVersion === version) found.push(entry);
    } catch {
      continue;
    }
  }
  return found;
}

export async function runBackfillNews(options: BackfillNewsOptions): Promise<BackfillNewsResult> {
  const frozenWarning = await findRunsReferencingVersion(options.resultsRoot, options.version);
  if (frozenWarning.length > 0) {
    options.log(
      `WARNING: dataset version ${options.version} is already referenced by run(s): ${frozenWarning.join(", ")}. In-place rewrite may invalidate recorded scores.`,
    );
  }

  const ids = await options.listQuestionIds(options.datasetsRoot, options.version, options.bank);
  const symbolFilter = options.symbols ? new Set(options.symbols) : null;

  const loaded: { id: string; question: Question }[] = [];
  for (const id of ids) {
    const file = questionFilePath(options.datasetsRoot, options.version, options.bank, id);
    const question: Question = await loadQuestionFile(file);
    if (symbolFilter && !symbolFilter.has(question.symbol)) continue;
    loaded.push({ id, question });
  }

  const windowRequests = buildWindowRequests(loaded.map((entry) => entry.question));
  const scannedWindows = new Set<string>();

  const processed: QuestionBackfillOutcome[] = [];
  const deps: NewsBackfillDeps = {
    sourceCacheRoot: options.sourceCacheRoot ?? join(options.datasetsRoot, ".cache"),
    fresh: options.fresh,
    fetchGdelt: options.fetchGdelt,
    fetchEdgar: options.fetchEdgar,
    fetchArchiveFile: options.fetchArchiveFile,
    readArchiveCsv: options.readArchiveCsv,
    archiveThrottleMs: options.archiveThrottleMs,
    log: options.log,
  };

  const failed: { id: string; error: string }[] = [];
  const gdeltFailures: string[] = [];
  const breaker = newGdeltCircuitBreaker();

  for (const { id, question } of loaded) {
    const file = questionFilePath(options.datasetsRoot, options.version, options.bank, id);
    const spec = specForSymbol(question.symbol);

    try {
      const result = await computeNewsForQuestion({
        symbol: question.symbol,
        cutoff: question.cutoff,
        companyQuery: spec.companyQuery ?? null,
        cik: spec.cik ?? null,
        deps,
        newsSource: options.newsSource,
        breaker,
        windowRequests,
        scannedWindows,
      });

      options.log(
        `${id}: gdelt ${result.gdeltCount}, archive ${result.archiveCount}, edgar ${result.edgarCount}`,
      );
      const outcome: QuestionBackfillOutcome = {
        id,
        symbol: question.symbol,
        gdeltCount: result.gdeltCount,
        edgarCount: result.edgarCount,
      };
      if (result.usedArchive) outcome.archiveCount = result.archiveCount;
      if (result.gdeltError) {
        outcome.gdeltError = result.gdeltError;
        gdeltFailures.push(id);
      }
      if (result.gdeltSkipped) outcome.gdeltSkipped = true;
      processed.push(outcome);

      if (options.dryRun) continue;

      const updated: Question = { ...question, fixtures: { ...question.fixtures, news: result.news } };
      await fs.writeFile(file, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await loadQuestionForScorer(options.datasetsRoot, options.version, options.bank, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log(`${id}: FAILED ${message}`);
      failed.push({ id, error: message });
    }
  }

  return { processed, frozenWarning, failed, gdeltFailures, gdeltCircuitTripped: breaker.tripped };
}
