import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from 'typebox/value';
import { runBackfillNews } from './generate/backfillPipeline.js';
import type { NewsSourceMode } from './generate/backfillPipeline.js';
import { fetchArchiveFileLive, readArchiveCsvLive } from './generate/archiveSource.js';
import { generateEpisodeCase } from './episode/generate.js';
import {
  buildEpisodeDataset,
  finalizeEpisodeDataset,
  hydrateLiveEpisodeNewsFromCache,
} from './episode/dataset.js';
import { loadEpisodeDatasetPlan } from './episode/datasetPlan.js';
import { auditEpisodeQuestionLive } from './episode/audit.js';
import { readEpisodeAnswers } from './episode/results.js';
import {
  renderEpisodeReportHtml,
  type EpisodeProvenanceEntry,
  type EpisodeReportConfigSnapshot,
  type EpisodeReportTraceLine,
} from './episode/report.js';
import type { EpisodeDataAudit } from './episode/audit.js';
import { fetchGdeltArticlesLive, fetchEdgarFilingsLive } from './generate/newsSource.js';
import { runGenerate } from './generate/pipeline.js';
import { fetchCalendarLive, fetchKlineHistoryLive } from './generate/source.js';
import { fetchKlineHistoryYahoo } from './generate/yahooFetcher.js';
import type { FetchEpisodeKlineHistory } from './episode/generate.js';
import { DEFAULT_SYMBOLS, layerForSymbol, type SymbolSpec } from './generate/symbols.js';
import { listQuestions, loadQuestionForScorer } from './dataset/loader.js';
import { parseDatasetPathOptions, type DatasetPaths } from './dataset/paths.js';
import { syncDataset } from './dataset/sync.js';
import { type ReportConfigSnapshot, renderReport } from './report/render.js';
import { parseBaselineArgs } from './baseline/args.js';
import { runBenchBaseline } from './baseline/run.js';
import { type Scores, scoresSchema } from './schema/scores.js';
import { runGold } from './score/gold.js';
import { runScore } from './score/score.js';

const SUBCOMMANDS = [
  'generate',
  'generate-episode-case',
  'generate-episode-dataset',
  'verify-episode-case',
  'run',
  'baseline',
  'score',
  'gold',
  'report',
  'backfill-news',
  'sync-dataset',
] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const USAGE = `Usage: bench <command> [options]

Commands:
  generate       Build benchmark question datasets
  generate-episode-case
                 Build one multi-timeframe episode case (1h/day/week)
  generate-episode-dataset
                 Build and audit a planned live or anonymous-blind Episode cohort
  verify-episode-case
                 Audit one episode case against fresh Longbridge CLI data
  run            (moved) drive models against the question bank — run from apps/pro
  baseline       Emit deterministic baseline answer sheets
  score          Score recorded answer sheets
  gold           Emit hindsight-optimal gold answer sheets
  report         Render a leaderboard report
  backfill-news  Backfill fixtures.news from GDELT + SEC EDGAR
  sync-dataset   Download and verify an immutable dataset release

Global options:
  --dataset-dir <path>       dataset installation root
  --source-cache-dir <path>  raw market/news source cache root
  -h, --help                 show this help message

Environment:
  KANSOKU_BENCH_DATA_DIR          fallback dataset installation root
  KANSOKU_BENCH_SOURCE_CACHE_DIR  fallback raw source cache root
`;

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_RESULTS_ROOT = join(PACKAGE_ROOT, 'results');

function gitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

const RUN_POINTER = [
  'run requires the pro slot — run it from apps/pro.',
  '  cd apps/pro && pnpm bench:run --help',
  'The public @kansoku/bench package ships the pure framework (generate, backfill-news, score, gold, report, baseline).',
  'Driving live models against the question bank lives in the private @kansoku/pro package.',
].join('\n');

function runRunCommand(): void {
  process.stderr.write(`${RUN_POINTER}\n`);
  process.exit(1);
}

async function runBaselineCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseBaselineArgs(argv);
  const result = await runBenchBaseline({
    strategies: args.strategies,
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    modes: args.modes,
    runId: args.runId,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: paths.datasetsRoot,
    questionIds: args.questionIds,
    gitSha: gitSha() ?? undefined,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(
    `\nbaseline ${result.runId}: written ${result.written}, skipped ${result.skipped} of ${result.planned}\n`,
  );
}

interface GenerateArgs {
  symbols: SymbolSpec[];
  version: string;
  windowsPerSymbol: number;
  dryRun: boolean;
  fresh: boolean;
}

function parseGenerateArgs(argv: string[]): GenerateArgs {
  let symbolsArg: string | undefined;
  let version: string | undefined;
  let windowsPerSymbol = 3;
  let dryRun = false;
  let fresh = false;
  let bank = 'swing';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--bank': {
        bank = argv[++i];
        break;
      }
      case '--symbols': {
        symbolsArg = argv[++i];
        break;
      }
      case '--version': {
        version = argv[++i];
        break;
      }
      case '--windows-per-symbol': {
        windowsPerSymbol = Number(argv[++i]);
        break;
      }
      case '--dry-run': {
        dryRun = true;
        break;
      }
      case '--fresh': {
        fresh = true;
        break;
      }
      default: {
        throw new Error(`unknown generate option: ${arg}`);
      }
    }
  }

  if (bank !== 'swing') throw new Error(`unsupported bank: ${bank} (only "swing" is implemented)`);
  if (!version) throw new Error('--version is required');
  if (!Number.isInteger(windowsPerSymbol) || windowsPerSymbol < 1) {
    throw new Error(`--windows-per-symbol must be a positive integer, got: ${windowsPerSymbol}`);
  }

  const symbols = symbolsArg
    ? symbolsArg.split(',').map((symbol) => {
        const trimmed = symbol.trim();
        return { symbol: trimmed, layer: layerForSymbol(trimmed) };
      })
    : DEFAULT_SYMBOLS;

  return { symbols, version, windowsPerSymbol, dryRun, fresh };
}

function parseScoreArgs(argv: string[]): { runId: string; datasetVersion: string; bank?: string } {
  let runId: string | undefined;
  let datasetVersion: string | undefined;
  let bank: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--run-id': {
        runId = argv[++i];
        break;
      }
      case '--dataset-version': {
        datasetVersion = argv[++i];
        break;
      }
      case '--bank': {
        bank = argv[++i];
        break;
      }
      default: {
        throw new Error(`unknown score option: ${arg}`);
      }
    }
  }
  if (!runId) throw new Error('--run-id is required');
  if (!datasetVersion) throw new Error('--dataset-version is required');
  return { runId, datasetVersion, bank };
}

async function runScoreCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseScoreArgs(argv);
  const scores = await runScore({
    runId: args.runId,
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: paths.datasetsRoot,
  });
  process.stdout.write(
    `scored ${args.runId}: ${scores.cells.length} cells, ${scores.models.length} models -> scores.json\n`,
  );
}

function parseGoldArgs(argv: string[]): { datasetVersion: string; bank?: string; check: boolean } {
  let datasetVersion: string | undefined;
  let bank: string | undefined;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dataset-version': {
        datasetVersion = argv[++i];
        break;
      }
      case '--bank': {
        bank = argv[++i];
        break;
      }
      case '--check': {
        check = true;
        break;
      }
      default: {
        throw new Error(`unknown gold option: ${arg}`);
      }
    }
  }
  if (!datasetVersion) throw new Error('--dataset-version is required');
  return { datasetVersion, bank, check };
}

async function runGoldCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseGoldArgs(argv);
  const result = await runGold({
    datasetVersion: args.datasetVersion,
    bank: args.bank,
    check: args.check,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    datasetsRoot: paths.datasetsRoot,
  });
  process.stdout.write(
    `gold ${args.datasetVersion}: ${result.total} questions, ${result.directional} directional (${(result.directionalFraction * 100).toFixed(0)}%)\n`,
  );
  if (!args.check) return;
  if (result.aggregate) {
    process.stdout.write(
      `gold check: winRate ${result.aggregate.winRate.toFixed(3)}, expectancy ${result.aggregate.expectancy.toFixed(3)}\n`,
    );
  }
  if (result.passed) {
    process.stdout.write('gold check: PASS\n');
  } else {
    process.stderr.write(`gold check: FAIL (${result.failures.join('; ')})\n`);
    process.exit(1);
  }
}

async function runGenerateCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseGenerateArgs(argv);
  const result = await runGenerate({
    bank: 'swing',
    symbols: args.symbols,
    version: args.version,
    windowsPerSymbol: args.windowsPerSymbol,
    dryRun: args.dryRun,
    fresh: args.fresh,
    datasetsRoot: paths.datasetsRoot,
    sourceCacheRoot: paths.sourceCacheRoot,
    fetchKlineHistory: fetchKlineHistoryLive,
    fetchCalendar: fetchCalendarLive,
    now: () => new Date(),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`\nwritten: ${result.written.length}, skipped: ${result.skipped.length}\n`);
}

interface GenerateEpisodeCaseArgs {
  symbol: string;
  cutoffDate: string;
  version: string;
  horizonSessions: number;
  source: 'longbridge' | 'yahoo';
}

const KLINE_FETCHERS: Record<GenerateEpisodeCaseArgs['source'], FetchEpisodeKlineHistory> = {
  longbridge: fetchKlineHistoryLive,
  yahoo: fetchKlineHistoryYahoo,
};

function parseGenerateEpisodeCaseArgs(argv: string[]): GenerateEpisodeCaseArgs {
  let symbol: string | undefined;
  let cutoffDate: string | undefined;
  let version: string | undefined;
  let horizonSessions = 40;
  let source: GenerateEpisodeCaseArgs['source'] = 'longbridge';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--symbol': {
        symbol = argv[++i];
        break;
      }
      case '--cutoff': {
        cutoffDate = argv[++i];
        break;
      }
      case '--version': {
        version = argv[++i];
        break;
      }
      case '--horizon-sessions': {
        horizonSessions = Number(argv[++i]);
        break;
      }
      case '--source': {
        const next = argv[++i];
        if (next !== 'longbridge' && next !== 'yahoo') {
          throw new Error(`--source must be longbridge|yahoo, got: ${next}`);
        }
        source = next;
        break;
      }
      default: {
        throw new Error(`unknown generate-episode-case option: ${arg}`);
      }
    }
  }

  if (!symbol) throw new Error('--symbol is required');
  if (!cutoffDate) throw new Error('--cutoff is required');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) ||
    Number.isNaN(Date.parse(`${cutoffDate}T00:00:00Z`))
  ) {
    throw new Error(`--cutoff must be YYYY-MM-DD, got: ${cutoffDate}`);
  }
  if (!version) throw new Error('--version is required');
  if (!Number.isInteger(horizonSessions) || horizonSessions < 1) {
    throw new Error(`--horizon-sessions must be a positive integer, got: ${horizonSessions}`);
  }

  layerForSymbol(symbol);
  return { symbol, cutoffDate, version, horizonSessions, source };
}

async function runGenerateEpisodeCaseCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseGenerateEpisodeCaseArgs(argv);
  const result = await generateEpisodeCase({
    symbol: args.symbol,
    layer: layerForSymbol(args.symbol),
    cutoffDate: args.cutoffDate,
    version: args.version,
    horizonSessions: args.horizonSessions,
    datasetsRoot: paths.datasetsRoot,
    fetchKlineHistory: KLINE_FETCHERS[args.source],
    fetchCalendar: fetchCalendarLive,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`\nwritten: ${result.file}\n`);
}

function parseGenerateEpisodeDatasetArgs(argv: string[]): { planFile: string; fresh: boolean } {
  let planFile: string | undefined;
  let fresh = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--plan') {
      planFile = argv[++i];
      continue;
    }
    if (arg === '--fresh') {
      fresh = true;
      continue;
    }
    throw new Error(`unknown generate-episode-dataset option: ${arg}`);
  }
  if (!planFile) throw new Error('--plan is required');
  return { planFile, fresh };
}

async function runGenerateEpisodeDatasetCommand(
  argv: string[],
  paths: DatasetPaths,
): Promise<void> {
  const args = parseGenerateEpisodeDatasetArgs(argv);
  const plan = await loadEpisodeDatasetPlan(args.planFile);
  await buildEpisodeDataset({
    plan,
    datasetsRoot: paths.datasetsRoot,
    sourceCacheRoot: paths.sourceCacheRoot,
    fresh: args.fresh,
    fetchKlineHistory: fetchKlineHistoryLive,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  await hydrateLiveEpisodeNewsFromCache(plan, paths.datasetsRoot, paths.sourceCacheRoot);
  const quality = await finalizeEpisodeDataset(plan, paths.datasetsRoot);
  process.stdout.write(
    `\ndataset ${plan.id}: ${quality.cases.length} ${plan.cohort} cases, quality ${quality.passed ? 'PASS' : 'FAIL'}\n`,
  );
}

interface VerifyEpisodeCaseArgs {
  datasetVersion: string;
  bank: string;
  questionId: string;
  runId?: string;
}

function parseVerifyEpisodeCaseArgs(argv: string[]): VerifyEpisodeCaseArgs {
  let datasetVersion: string | undefined;
  let bank = 'swing';
  let questionId: string | undefined;
  let runId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dataset-version': {
        datasetVersion = argv[++i];
        break;
      }
      case '--bank': {
        bank = argv[++i];
        break;
      }
      case '--question': {
        questionId = argv[++i];
        break;
      }
      case '--run-id': {
        runId = argv[++i];
        break;
      }
      default: {
        throw new Error(`unknown verify-episode-case option: ${arg}`);
      }
    }
  }
  if (!datasetVersion) throw new Error('--dataset-version is required');
  if (!questionId) throw new Error('--question is required');
  return { datasetVersion, bank, questionId, runId };
}

async function runVerifyEpisodeCaseCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseVerifyEpisodeCaseArgs(argv);
  const question = await loadQuestionForScorer(
    paths.datasetsRoot,
    args.datasetVersion,
    args.bank,
    args.questionId,
  );
  const audit = await auditEpisodeQuestionLive(question, fetchKlineHistoryLive);
  if (args.runId) {
    const output = join(DEFAULT_RESULTS_ROOT, args.runId, 'data-audit.json');
    await fs.mkdir(dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    process.stdout.write(`audit written: ${output}\n`);
  }
  const failed = audit.checks.filter((check) => check.status === 'fail');
  process.stdout.write(
    `audit ${audit.questionId}: ${audit.checks.length - failed.length}/${audit.checks.length} checks passed\n`,
  );
  for (const check of failed)
    process.stderr.write(`FAIL ${check.id}: ${check.detail ?? check.label}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

interface BackfillNewsArgs {
  version: string;
  bank: string;
  symbols?: string[];
  dryRun: boolean;
  fresh: boolean;
  newsSource: NewsSourceMode;
}

const NEWS_SOURCE_MODES: NewsSourceMode[] = ['doc', 'archive', 'auto'];

function isNewsSourceMode(value: string): value is NewsSourceMode {
  return (NEWS_SOURCE_MODES as string[]).includes(value);
}

function parseBackfillNewsArgs(argv: string[]): BackfillNewsArgs {
  let version: string | undefined;
  let bank = 'swing';
  let symbols: string[] | undefined;
  let dryRun = false;
  let fresh = false;
  let newsSource: NewsSourceMode = 'auto';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dataset-version': {
        version = argv[++i];
        break;
      }
      case '--bank': {
        bank = argv[++i];
        break;
      }
      case '--symbols': {
        symbols = argv[++i].split(',').map((symbol) => symbol.trim());
        break;
      }
      case '--dry-run': {
        dryRun = true;
        break;
      }
      case '--fresh': {
        fresh = true;
        break;
      }
      case '--news-source': {
        const value = argv[++i];
        if (!isNewsSourceMode(value))
          throw new Error(`--news-source must be one of doc|archive|auto, got: ${value}`);
        newsSource = value;
        break;
      }
      default: {
        throw new Error(`unknown backfill-news option: ${arg}`);
      }
    }
  }

  if (!version) throw new Error('--dataset-version is required');
  return { version, bank, symbols, dryRun, fresh, newsSource };
}

async function runBackfillNewsCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseBackfillNewsArgs(argv);
  const result = await runBackfillNews({
    datasetsRoot: paths.datasetsRoot,
    sourceCacheRoot: paths.sourceCacheRoot,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    version: args.version,
    bank: args.bank,
    symbols: args.symbols,
    dryRun: args.dryRun,
    fresh: args.fresh,
    newsSource: args.newsSource,
    fetchGdelt: fetchGdeltArticlesLive,
    fetchEdgar: fetchEdgarFilingsLive,
    fetchArchiveFile: fetchArchiveFileLive,
    readArchiveCsv: readArchiveCsvLive,
    log: (line) => process.stdout.write(`${line}\n`),
    listQuestionIds: listQuestions,
  });
  process.stdout.write(
    `\nbackfill-news ${args.version}: ${result.processed.length} processed, ${result.failed.length} failed, ${result.gdeltFailures.length} gdelt-only failures (edgar still applied)${result.gdeltCircuitTripped ? ', GDELT circuit breaker tripped (durably rate-limited, rest of run skipped GDELT)' : ''}\n`,
  );
  if (result.failed.length > 0) process.exitCode = 1;
}

function parseReportArgs(argv: string[]): { runId: string } {
  let runId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--run-id': {
        runId = argv[++i];
        break;
      }
      default: {
        throw new Error(`unknown report option: ${arg}`);
      }
    }
  }
  if (!runId) throw new Error('--run-id is required');
  return { runId };
}

async function readJsonFile(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw == null) return null;
  return JSON.parse(raw) as unknown;
}

interface RawProvenanceCase {
  outputId?: unknown;
  aliasSymbol?: unknown;
  sourceSymbol?: unknown;
  sourceCutoff?: unknown;
  syntheticCutoff?: unknown;
  dayShift?: unknown;
  priceScale?: unknown;
  volumeScale?: unknown;
}

async function loadEpisodeProvenance(
  datasetsRoot: string,
  datasetVersion: string,
): Promise<Map<string, EpisodeProvenanceEntry> | undefined> {
  const raw = (await readJsonFile(
    join(datasetsRoot, datasetVersion, 'provenance.json'),
  )) as { cases?: RawProvenanceCase[] } | null;
  if (!raw || !Array.isArray(raw.cases)) return undefined;
  const map = new Map<string, EpisodeProvenanceEntry>();
  for (const entry of raw.cases) {
    if (typeof entry.outputId !== 'string') continue;
    if (typeof entry.sourceSymbol !== 'string' || typeof entry.sourceCutoff !== 'string') continue;
    map.set(entry.outputId, {
      sourceSymbol: entry.sourceSymbol,
      sourceCutoff: entry.sourceCutoff,
      syntheticCutoff:
        typeof entry.syntheticCutoff === 'string' ? entry.syntheticCutoff : undefined,
      dayShift: typeof entry.dayShift === 'number' ? entry.dayShift : undefined,
      priceScale: typeof entry.priceScale === 'number' ? entry.priceScale : undefined,
      volumeScale: typeof entry.volumeScale === 'number' ? entry.volumeScale : undefined,
    });
  }
  return map.size > 0 ? map : undefined;
}

async function readEpisodeTraceLines(file: string): Promise<EpisodeReportTraceLine[]> {
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw == null) return [];
  const lines: EpisodeReportTraceLine[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        lines.push(parsed as EpisodeReportTraceLine);
      }
    } catch {
      // A malformed auxiliary trace line must not prevent the benchmark result report from rendering.
    }
  }
  return lines;
}

async function runReportCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseReportArgs(argv);
  const runDir = join(DEFAULT_RESULTS_ROOT, args.runId);
  const config = ((await readJsonFile(join(runDir, 'config.json'))) ?? {}) as ReportConfigSnapshot &
    EpisodeReportConfigSnapshot;
  const episodesFile = join(runDir, 'episodes.jsonl');
  const hasEpisodes = await fs.access(episodesFile).then(
    () => true,
    () => false,
  );
  if (hasEpisodes) {
    const answers = await readEpisodeAnswers(episodesFile);
    const datasetVersion = config.datasetVersion ?? config.config?.datasetVersion;
    const bank = config.bank ?? config.config?.bank ?? 'swing';
    if (!datasetVersion)
      throw new Error(`datasetVersion missing from config.json for run ${args.runId}`);
    const questions = new Map();
    for (const questionId of new Set(answers.map((answer) => answer.questionId))) {
      questions.set(
        questionId,
        await loadQuestionForScorer(paths.datasetsRoot, datasetVersion, bank, questionId),
      );
    }
    const rawAudit = await readJsonFile(join(runDir, 'data-audit.json'));
    const audits =
      rawAudit == null
        ? []
        : ((Array.isArray(rawAudit) ? rawAudit : [rawAudit]) as EpisodeDataAudit[]);
    const traces = new Map<string, EpisodeReportTraceLine[]>();
    for (const traceRef of new Set(answers.map((answer) => answer.traceRef).filter(Boolean))) {
      traces.set(traceRef, await readEpisodeTraceLines(join(runDir, traceRef)));
    }
    const provenance = await loadEpisodeProvenance(paths.datasetsRoot, datasetVersion);
    const { html, summary } = renderEpisodeReportHtml({
      answers,
      questions,
      config,
      audits,
      traces,
      provenance,
    });
    await fs.writeFile(join(runDir, 'report.html'), html, 'utf8');
    await fs.writeFile(
      join(runDir, 'episode-report-summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(
      `episode report ${args.runId}: ${answers.length} cases -> report.html, episode-report-summary.json\n`,
    );
    return;
  }
  const rawScores = await readJsonFile(join(runDir, 'scores.json'));
  if (rawScores == null)
    throw new Error(`scores.json not found for run ${args.runId} (run "bench score" first)`);
  if (!Value.Check(scoresSchema, rawScores)) {
    const first = Value.Errors(scoresSchema, rawScores)[0];
    throw new Error(
      `invalid scores.json: ${first?.instancePath ?? '(root)'} ${first?.message ?? 'schema mismatch'}`,
    );
  }
  const scores = rawScores as Scores;
  const { markdown, summary } = renderReport(scores, config);
  await fs.writeFile(join(runDir, 'report.md'), markdown, 'utf8');
  await fs.writeFile(
    join(runDir, 'report-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(
    `report ${args.runId}: ${scores.models.length} models -> report.md, report-summary.json\n`,
  );
}

function isSubcommand(value: string | undefined): value is Subcommand {
  return SUBCOMMANDS.includes(value as Subcommand);
}

function printUsage(): void {
  process.stdout.write(USAGE);
}

function parseSyncDatasetArgs(argv: string[]): { datasetVersion: string } {
  let datasetVersion: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dataset-version') {
      datasetVersion = argv[++i];
      continue;
    }
    throw new Error(`unknown sync-dataset option: ${arg}`);
  }
  if (!datasetVersion) throw new Error('--dataset-version is required');
  return { datasetVersion };
}

async function runSyncDatasetCommand(argv: string[], paths: DatasetPaths): Promise<void> {
  const args = parseSyncDatasetArgs(argv);
  const result = await syncDataset({ id: args.datasetVersion, datasetsRoot: paths.datasetsRoot });
  const verb = result.status === 'installed' ? 'installed' : 'already present';
  process.stdout.write(
    `dataset ${result.manifest.id}@${result.manifest.revision} ${verb}: ${result.target}\n`,
  );
}

async function main(argv: string[]): Promise<void> {
  let parsedPaths;
  try {
    parsedPaths = parseDatasetPathOptions(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
    return;
  }
  const { argv: commandArgs, datasetsRoot, sourceCacheRoot } = parsedPaths;
  const [command, ...rest] = commandArgs;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (!isSubcommand(command)) {
    process.stderr.write(`unknown command: ${command}\n\n`);
    printUsage();
    process.exit(1);
  }

  const handlers: Partial<
    Record<Subcommand, (argv: string[], paths: DatasetPaths) => Promise<void>>
  > = {
    'generate': runGenerateCommand,
    'generate-episode-case': runGenerateEpisodeCaseCommand,
    'generate-episode-dataset': runGenerateEpisodeDatasetCommand,
    'verify-episode-case': runVerifyEpisodeCaseCommand,
    'run': async () => runRunCommand(),
    'baseline': runBaselineCommand,
    'score': runScoreCommand,
    'gold': runGoldCommand,
    'report': runReportCommand,
    'backfill-news': runBackfillNewsCommand,
    'sync-dataset': runSyncDatasetCommand,
  };
  const handler = handlers[command];
  if (!handler) {
    process.stderr.write('not implemented\n');
    process.exit(1);
  }
  try {
    await handler(rest, { datasetsRoot, sourceCacheRoot });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export type { Subcommand };
export { main, printUsage, SUBCOMMANDS, USAGE };

if (!process.env.VITEST) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
