import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { listQuestions, loadQuestionForScorer } from '../dataset/loader.js';
import { readCache, writeCache } from '../generate/cache.js';
import { gkgDateToIso, mapArchiveMatches } from '../generate/gdeltArchiveMapping.js';
import type { ArchiveMatch } from '../generate/gdeltArchiveMapping.js';
import { assertNoLeak, mapEdgarFilings } from '../generate/newsMapping.js';
import type { EdgarFiling } from '../generate/newsMapping.js';
import { edgarWindow } from '../generate/newsWindow.js';
import { layerForSymbol, specForSymbol } from '../generate/symbols.js';
import type { EpisodeKlinePeriod } from '../generate/source.js';
import type { BenchNewsItem } from '../schema/newsItem.js';
import type { Question } from '../schema/question.js';
import { anonymizeEpisodeQuestion, type BlindCaseProvenance } from './anonymize.js';
import { auditEpisodeQuestion, type EpisodeDataAudit } from './audit.js';
import { assembleEpisodeQuestion, type FetchEpisodeKlineHistory, marketDate } from './generate.js';
import type { EpisodeDatasetPlan, EpisodeDatasetPlanCase } from './datasetPlan.js';

export interface BuildEpisodeDatasetOptions {
  plan: EpisodeDatasetPlan;
  datasetsRoot: string;
  sourceCacheRoot: string;
  fresh?: boolean;
  fetchKlineHistory: FetchEpisodeKlineHistory;
  log?: (line: string) => void;
}

export interface EpisodeDatasetCaseQuality {
  questionId: string;
  sourceSymbol: string;
  sourceCutoff: string;
  finalSymbol: string;
  finalCutoff: string;
  sourceAuditPassed: boolean;
  finalAuditPassed: boolean;
  newsCount: number;
  policyChecks: Record<string, boolean>;
}

export interface EpisodeDatasetQualityReport {
  schemaVersion: 1;
  datasetId: string;
  cohort: EpisodeDatasetPlan['cohort'];
  generatedAt: string;
  passed: boolean;
  cases: EpisodeDatasetCaseQuality[];
}

interface PreliminaryCaseRecord {
  planCase: EpisodeDatasetPlanCase;
  questionId: string;
  sourceAudit: EpisodeDataAudit;
}

interface PreliminaryReport {
  schemaVersion: 1;
  datasetId: string;
  cohort: EpisodeDatasetPlan['cohort'];
  generatedAt: string;
  cases: PreliminaryCaseRecord[];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function safeSegment(value: string): string {
  return value.replaceAll(/[^\w.-]/g, '_');
}

async function cachedKlines(
  options: BuildEpisodeDatasetOptions,
  symbol: string,
  period: EpisodeKlinePeriod,
  start: string,
  end: string,
) {
  const file = join(
    options.sourceCacheRoot,
    'episode-market',
    safeSegment(symbol),
    `${period}-${start}-${end}.json`,
  );
  if (!options.fresh) {
    const cached = await readCache<Awaited<ReturnType<FetchEpisodeKlineHistory>>>(file);
    if (cached) return cached;
  }
  const bars = await options.fetchKlineHistory(symbol, period, start, end);
  await writeCache(file, bars);
  return bars;
}

async function sourceQuestion(
  entry: EpisodeDatasetPlanCase,
  options: BuildEpisodeDatasetOptions,
): Promise<{ question: Question; audit: EpisodeDataAudit }> {
  const sessions = options.plan.horizonSessions;
  const hourStart = addDays(entry.cutoff, -90);
  const rangeEnd = addDays(entry.cutoff, Math.ceil(sessions * 2.5) + 14);
  const historyStart = addDays(entry.cutoff, -1_100);
  const [hourBars, dayBars, weekBars] = await Promise.all([
    cachedKlines(options, entry.symbol, '1h', hourStart, rangeEnd),
    cachedKlines(options, entry.symbol, 'day', historyStart, rangeEnd),
    cachedKlines(options, entry.symbol, 'week', historyStart, rangeEnd),
  ]);
  const question = assembleEpisodeQuestion({
    symbol: entry.symbol,
    layer: layerForSymbol(entry.symbol),
    cutoffDate: entry.cutoff,
    dayBars,
    weekBars,
    hourBars,
    horizonSessions: sessions,
    calendar: {},
  });
  const audit = auditEpisodeQuestion(question, { hourBars, dayBars, weekBars });
  if (!audit.passed) {
    const failures = audit.checks
      .filter((check) => check.status === 'fail')
      .map((check) => check.id);
    throw new Error(`source audit failed for ${question.id}: ${failures.join(', ')}`);
  }
  return { question, audit };
}

export async function buildEpisodeDataset(options: BuildEpisodeDatasetOptions): Promise<void> {
  const log = options.log ?? (() => {});
  const datasetRoot = join(options.datasetsRoot, options.plan.id);
  const bankRoot = join(datasetRoot, 'swing');
  const existing = await fs.readdir(bankRoot).catch(() => []);
  if (existing.some((file) => file.endsWith('.json'))) {
    throw new Error(`dataset staging directory already contains cases: ${bankRoot}`);
  }
  await fs.mkdir(bankRoot, { recursive: true });

  const preliminary: PreliminaryReport = {
    schemaVersion: 1,
    datasetId: options.plan.id,
    cohort: options.plan.cohort,
    generatedAt: new Date().toISOString(),
    cases: [],
  };
  const provenance: BlindCaseProvenance[] = [];

  for (const [index, entry] of options.plan.cases.entries()) {
    log(`[${index + 1}/${options.plan.cases.length}] ${entry.symbol} cutoff=${entry.cutoff}`);
    const source = await sourceQuestion(entry, options);
    const final =
      options.plan.cohort === 'blind-anonymous'
        ? anonymizeEpisodeQuestion(source.question, {
            alias: entry.alias!,
            syntheticCutoff: entry.syntheticCutoff!,
          })
        : { question: source.question, provenance: null };
    const finalAudit = auditEpisodeQuestion(final.question);
    if (!finalAudit.passed) {
      const failures = finalAudit.checks
        .filter((check) => check.status === 'fail')
        .map((check) => check.id);
      throw new Error(`final audit failed for ${final.question.id}: ${failures.join(', ')}`);
    }
    const file = join(bankRoot, `${final.question.id}.json`);
    await fs.writeFile(file, `${JSON.stringify(final.question, null, 2)}\n`, 'utf8');
    if (final.provenance) provenance.push(final.provenance);
    preliminary.cases.push({
      planCase: entry,
      questionId: final.question.id,
      sourceAudit: source.audit,
    });
  }

  await fs.writeFile(
    join(datasetRoot, 'plan.json'),
    `${JSON.stringify(options.plan, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    join(datasetRoot, '.quality-preliminary.json'),
    `${JSON.stringify(preliminary, null, 2)}\n`,
    'utf8',
  );
  if (provenance.length > 0) {
    await fs.writeFile(
      join(datasetRoot, 'provenance.json'),
      `${JSON.stringify({ schemaVersion: 1, cases: provenance }, null, 2)}\n`,
      'utf8',
    );
  }
}

export async function hydrateLiveEpisodeNewsFromCache(
  plan: EpisodeDatasetPlan,
  datasetsRoot: string,
  sourceCacheRoot: string,
): Promise<void> {
  if (plan.cohort !== 'live-2026') return;
  const cacheEntries = await fs.readdir(sourceCacheRoot);
  const ids = await listQuestions(datasetsRoot, plan.id, 'swing');
  for (const id of ids) {
    const question = await loadQuestionForScorer(datasetsRoot, plan.id, 'swing', id);
    const spec = specForSymbol(question.symbol);
    if (!spec.archiveTerms && !spec.cik) continue;

    const cutoffMs = Date.parse(question.cutoff);
    const notBeforeMs = Math.max(
      Date.parse('2026-01-01T00:00:00Z'),
      cutoffMs - 48 * 60 * 60 * 1000,
    );
    const archiveFiles = cacheEntries.filter(
      (name) => name.startsWith(`${question.symbol}-news-gdelt-arch-`) && name.endsWith('.json'),
    );
    if (spec.archiveTerms && archiveFiles.length === 0) {
      throw new Error(`no cached GDELT archive matches for ${question.symbol}`);
    }
    const archiveMatches: ArchiveMatch[] = [];
    for (const name of archiveFiles) {
      const matches = await readCache<ArchiveMatch[]>(join(sourceCacheRoot, name));
      for (const match of matches ?? []) {
        const publishedMs = Date.parse(gkgDateToIso(match.date));
        if (publishedMs >= notBeforeMs && publishedMs <= cutoffMs) archiveMatches.push(match);
      }
    }
    const archiveNews = mapArchiveMatches(archiveMatches, question.cutoff);

    let edgarNews: BenchNewsItem[] = [];
    if (spec.cik) {
      const filings = await readCache<EdgarFiling[]>(
        join(sourceCacheRoot, `${question.symbol}-news-edgar-full.json`),
      );
      if (!filings) throw new Error(`no cached EDGAR filings for ${question.symbol}`);
      const { startDate, endDate } = edgarWindow(question.cutoff);
      edgarNews = mapEdgarFilings(filings, question.cutoff, spec.cik, startDate, endDate).filter(
        (item) => item.published_at.startsWith('2026-'),
      );
    }
    const news = [...archiveNews, ...edgarNews]
      .filter((item) => item.published_at.startsWith('2026-'))
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
    assertNoLeak(news, question.cutoff);
    question.fixtures.news = news;
    await fs.writeFile(
      join(datasetsRoot, plan.id, 'swing', `${id}.json`),
      `${JSON.stringify(question, null, 2)}\n`,
      'utf8',
    );
  }
}

function policyChecks(
  plan: EpisodeDatasetPlan,
  entry: EpisodeDatasetPlanCase,
  question: Question,
): Record<string, boolean> {
  const serialized = JSON.stringify(question);
  const replayYears2026 = question.replay.bars.every((bar) =>
    marketDate(bar.time).startsWith('2026-'),
  );
  const newsBeforeCutoff = question.fixtures.news.every(
    (item) => Date.parse(item.published_at) <= Date.parse(question.cutoff),
  );
  if (plan.cohort === 'live-2026') {
    return {
      cutoffIn2026: marketDate(question.cutoff).startsWith('2026-'),
      replayIn2026: replayYears2026,
      newsIn2026: question.fixtures.news.every((item) => item.published_at.startsWith('2026-')),
      newsBeforeCutoff,
      calendarEmpty: Object.keys(question.fixtures.calendar).length === 0,
      realIdentityRetained: question.symbol === entry.symbol,
    };
  }
  return {
    cutoffSynthetic2026: marketDate(question.cutoff).startsWith('2026-'),
    replaySynthetic2026: replayYears2026,
    aliasApplied: question.symbol === `${entry.alias}.SIM`,
    sourceSymbolRemoved: !serialized.includes(entry.symbol),
    sourceCutoffShifted: marketDate(question.cutoff) !== entry.cutoff,
    normalizedCutoffClose: Math.abs(Number(question.fixtures.quote.last) - 100) < 1e-6,
    newsEmpty: question.fixtures.news.length === 0,
    calendarEmpty: Object.keys(question.fixtures.calendar).length === 0,
    fundamentalsEmpty: Object.keys(question.fixtures.fundamentals).length === 0,
    capitalFlowEmpty: Object.keys(question.fixtures.capitalFlow).length === 0,
  };
}

export async function finalizeEpisodeDataset(
  plan: EpisodeDatasetPlan,
  datasetsRoot: string,
): Promise<EpisodeDatasetQualityReport> {
  const datasetRoot = join(datasetsRoot, plan.id);
  const preliminary = JSON.parse(
    await fs.readFile(join(datasetRoot, '.quality-preliminary.json'), 'utf8'),
  ) as PreliminaryReport;
  const preliminaryById = new Map(preliminary.cases.map((entry) => [entry.questionId, entry]));
  const ids = await listQuestions(datasetsRoot, plan.id, 'swing');
  const cases: EpisodeDatasetCaseQuality[] = [];

  for (const id of ids) {
    const record = preliminaryById.get(id);
    if (!record) throw new Error(`quality metadata missing for ${id}`);
    const question = await loadQuestionForScorer(datasetsRoot, plan.id, 'swing', id);
    if (plan.cohort === 'live-2026') {
      const filtered = question.fixtures.news.filter((item) =>
        item.published_at.startsWith('2026-'),
      );
      if (filtered.length !== question.fixtures.news.length) {
        question.fixtures.news = filtered;
        await fs.writeFile(
          join(datasetRoot, 'swing', `${id}.json`),
          `${JSON.stringify(question, null, 2)}\n`,
          'utf8',
        );
      }
    }
    const finalAudit = auditEpisodeQuestion(question);
    const checks = policyChecks(plan, record.planCase, question);
    cases.push({
      questionId: id,
      sourceSymbol: record.planCase.symbol,
      sourceCutoff: record.planCase.cutoff,
      finalSymbol: question.symbol,
      finalCutoff: question.cutoff,
      sourceAuditPassed: record.sourceAudit.passed,
      finalAuditPassed: finalAudit.passed,
      newsCount: question.fixtures.news.length,
      policyChecks: checks,
    });
  }

  const report: EpisodeDatasetQualityReport = {
    schemaVersion: 1,
    datasetId: plan.id,
    cohort: plan.cohort,
    generatedAt: new Date().toISOString(),
    passed: cases.every(
      (entry) =>
        entry.sourceAuditPassed &&
        entry.finalAuditPassed &&
        Object.values(entry.policyChecks).every(Boolean),
    ),
    cases,
  };
  await fs.writeFile(
    join(datasetRoot, 'quality-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await fs.rm(join(datasetRoot, '.quality-preliminary.json'), { force: true });
  if (!report.passed) {
    const failed = report.cases
      .filter(
        (entry) =>
          !entry.sourceAuditPassed ||
          !entry.finalAuditPassed ||
          Object.values(entry.policyChecks).some((value) => !value),
      )
      .map((entry) => entry.questionId);
    throw new Error(`dataset quality audit failed: ${failed.join(', ')}`);
  }
  return report;
}
