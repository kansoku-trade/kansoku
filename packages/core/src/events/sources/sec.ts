import type { MarketEventSeverity } from '@kansoku/shared/types';
import type { EventPollContext, EventPollResult, EventSourceAdapter } from '../registry.js';
import type { MarketEventDraft } from '../types.js';
import {
  createHighWaterTracker,
  parseHighWaterCursor,
  type HighWater,
  type HighWaterCursor,
} from './highWaterCursor.js';
import { fetchJsonCapped } from './httpFetch.js';
import { dateOnlyInstant } from './instants.js';

export const SEC_SOURCE = 'sec-edgar';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SUBMISSIONS_URL = 'https://data.sec.gov/submissions';
const ARCHIVES_URL = 'https://www.sec.gov/Archives/edgar/data';

// Inside the plan's 10–15s band: fast enough that an 8-K is on the timeline while
// it still matters, slow enough to leave SEC's budget to everyone else.
const DEFAULT_INTERVAL_MS = 12_000;
// SEC allows 10 requests per second; 120ms serial spacing keeps us at ~8/s even
// before the queue in the runtime adds its own slack.
const DEFAULT_REQUEST_GAP_MS = 120;
const DEFAULT_TICKER_TTL_MS = 24 * 60 * 60_000;
// One cycle must fit comfortably inside the poll interval, so a large watch list is
// walked over several cycles instead of one long burst.
const DEFAULT_MAX_SYMBOLS_PER_CYCLE = 20;
// EDGAR's ticker map is a few megabytes; a submissions document is far smaller.
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

// The forms that actually move a price. Amendments are kept too: a restated 8-K is
// news in its own right.
const WATCHED_FORMS = new Set([
  '10-K',
  '10-Q',
  '20-F',
  '4',
  '6-K',
  '8-K',
  'S-1',
  'SC 13D',
  'SC 13G',
]);

const NOTABLE_FORMS = new Set(['8-K', 'S-1', 'SC 13D']);

export interface SecAdapterDeps {
  symbols: () => Promise<string[]>;
  // "Name <email>" per SEC's fair-access policy. Absent means the source stays off:
  // a fabricated identity would get the whole app banned, not just this feature.
  userAgent?: string | null;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  requestGapMs?: number;
  tickerCacheTtlMs?: number;
  maxSymbolsPerCycle?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

interface TickerRow {
  cik_str?: number | string;
  ticker?: string;
}

interface RecentFilings {
  accessionNumber?: unknown;
  acceptanceDateTime?: unknown;
  filingDate?: unknown;
  form?: unknown;
  primaryDocument?: unknown;
}

// Only US-listed common tickers exist in EDGAR: index proxies (".SOX.US") and non-US
// listings ("700.HK") are skipped rather than looked up and missed. Class shares are
// the exception worth handling — EDGAR writes Berkshire's B shares as "BRK-B", so the
// dot inside a US symbol becomes a dash instead of disqualifying it.
export function edgarTickerOf(symbol: string): string | null {
  const text = symbol.trim().toUpperCase();
  if (!text || text.startsWith('.')) return null;
  const usSuffixed = text.endsWith('.US');
  const base = usSuffixed ? text.slice(0, -3) : text;
  if (!base || base.startsWith('.') || base.endsWith('.')) return null;
  // A dot with no ".US" behind it is a foreign venue ("700.HK"), not a share class.
  if (!usSuffixed && base.includes('.')) return null;
  const edgar = base.replaceAll('.', '-');
  return /^[A-Z]+(?:-[A-Z]+)*$/.test(edgar) ? edgar : null;
}

// Rotation lives in the cursor next to the per-symbol marks, so a restart resumes
// where the last cycle stopped instead of re-reading the head of the list forever.
export interface SecCursor {
  rotation: number;
  symbols: HighWaterCursor;
}

export function parseSecCursor(raw: string | null): SecCursor {
  if (!raw) return { rotation: 0, symbols: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rotation: 0, symbols: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { rotation: 0, symbols: {} };
  }
  const { rotation, symbols } = parsed as { rotation?: unknown; symbols?: unknown };
  const at = typeof rotation === 'number' && Number.isFinite(rotation) ? Math.trunc(rotation) : 0;
  return {
    rotation: Math.max(0, at),
    symbols: parseHighWaterCursor(symbols === undefined ? raw : JSON.stringify(symbols)),
  };
}

function column(recent: RecentFilings, key: keyof RecentFilings): string[] {
  const value = recent[key];
  return Array.isArray(value) ? value.map((entry) => (typeof entry === 'string' ? entry : '')) : [];
}

function normalizeForm(form: string): string {
  return form.trim().toUpperCase().replaceAll(/\s+/g, ' ');
}

function baseForm(form: string): string {
  const [base] = form.split('/');
  return base.trim();
}

function severityOf(form: string): MarketEventSeverity {
  return NOTABLE_FORMS.has(baseForm(form)) ? 'notable' : 'info';
}

function acceptedAt(acceptance: string, filingDate: string): string | null {
  // A bare date is a date wherever it appears, acceptance field included: parsing it
  // as midnight UTC would file the document on the previous evening in New York.
  for (const candidate of [acceptance, filingDate]) {
    if (!candidate) continue;
    const dateOnly = dateOnlyInstant(candidate);
    if (dateOnly) return dateOnly;
    const at = Date.parse(candidate);
    if (Number.isFinite(at)) return new Date(at).toISOString();
  }
  return null;
}

function filingUrl(cik: string, accession: string, primaryDocument: string): string {
  const folder = accession.replaceAll('-', '');
  const document = primaryDocument.trim() || `${accession}-index.htm`;
  return `${ARCHIVES_URL}/${cik}/${folder}/${document}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSecAdapter(deps: SecAdapterDeps): EventSourceAdapter {
  const userAgent = deps.userAgent?.trim() ?? '';
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;

  if (!userAgent) {
    const reason =
      'SEC_USER_AGENT is not set — SEC requires a real "Name <email>" identity, so this source stays off';
    return {
      disabledReason: reason,
      enabled: false,
      intervalMs,
      // Present but refusing: a direct call has to fail loudly rather than look
      // like a source that simply had nothing to report.
      poll: () => Promise.reject(new Error(reason)),
      source: SEC_SOURCE,
    };
  }

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const requestGapMs = deps.requestGapMs ?? DEFAULT_REQUEST_GAP_MS;
  const tickerTtlMs = deps.tickerCacheTtlMs ?? DEFAULT_TICKER_TTL_MS;
  const maxPerCycle = deps.maxSymbolsPerCycle ?? DEFAULT_MAX_SYMBOLS_PER_CYCLE;

  let tickerCache: { at: number; map: Map<string, string> } | null = null;
  // The live rotation for this process. The cursor is what a fresh process starts
  // from; within one process this is the more recent truth.
  let rotation: number | null = null;
  let lastRequestAt = Number.NEGATIVE_INFINITY;

  async function request(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    const wait = requestGapMs - (now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
    return await fetchJsonCapped(url, {
      headers: { 'user-agent': userAgent },
      maxBytes: deps.maxBytes ?? DEFAULT_MAX_BYTES,
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async function tickerMap(signal: AbortSignal | undefined): Promise<Map<string, string>> {
    if (tickerCache && now() - tickerCache.at < tickerTtlMs) return tickerCache.map;
    const payload = await request(TICKERS_URL, signal);
    const map = new Map<string, string>();
    for (const row of Object.values((payload ?? {}) as Record<string, TickerRow>)) {
      const ticker = row?.ticker?.trim().toUpperCase();
      const cik = row?.cik_str;
      if (!ticker || cik === undefined || cik === null) continue;
      const numeric = Number(cik);
      if (!Number.isFinite(numeric)) continue;
      map.set(ticker, String(numeric).padStart(10, '0'));
    }
    tickerCache = { at: now(), map };
    return map;
  }

  function draftsFor(
    symbol: string,
    cik: string,
    recent: RecentFilings,
    seen: HighWater | undefined,
  ): { drafts: MarketEventDraft[]; cursor: HighWater | null } {
    const accessions = column(recent, 'accessionNumber');
    const forms = column(recent, 'form');
    const filingDates = column(recent, 'filingDate');
    const acceptances = column(recent, 'acceptanceDateTime');
    const documents = column(recent, 'primaryDocument');
    const unpaddedCik = String(Number(cik));
    const ticker = edgarTickerOf(symbol) ?? symbol;

    const drafts: MarketEventDraft[] = [];
    const tracker = createHighWaterTracker(seen);

    for (const [index, accession] of accessions.entries()) {
      const form = normalizeForm(forms[index] ?? '');
      if (!WATCHED_FORMS.has(baseForm(form))) continue;
      const occurredAt = acceptedAt(acceptances[index] ?? '', filingDates[index] ?? '');
      if (!accession || !occurredAt) continue;

      const known = tracker.isKnown(occurredAt, accession);
      tracker.observe(occurredAt, accession);
      if (known) continue;

      drafts.push({
        class: 'filing',
        dedupeKey: accession,
        kind: form,
        occurredAt,
        payload: {
          data: {
            accessionNumber: accession,
            acceptanceDateTime: acceptances[index] ?? '',
            cik,
            filingDate: filingDates[index] ?? '',
            form,
            primaryDocument: documents[index] ?? '',
          },
          title: `${ticker} 提交 ${form}`,
          url: filingUrl(unpaddedCik, accession, documents[index] ?? ''),
        },
        severity: severityOf(form),
        source: SEC_SOURCE,
        symbols: [symbol],
        trust: 'official',
      });
    }

    return { cursor: tracker.value(), drafts };
  }

  async function poll({ cursor, signal }: EventPollContext): Promise<EventPollResult> {
    const stored = parseSecCursor(cursor);
    const watched = await deps.symbols();
    const mappable = watched
      .map((symbol) => ({ symbol: symbol.trim().toUpperCase(), ticker: edgarTickerOf(symbol) }))
      .filter((entry): entry is { symbol: string; ticker: string } => entry.ticker !== null);
    if (mappable.length === 0) return { drafts: [] };

    const tickers = await tickerMap(signal);
    const resolvable = mappable
      .map((entry) => ({ ...entry, cik: tickers.get(entry.ticker) }))
      .filter((entry): entry is { cik: string; symbol: string; ticker: string } => !!entry.cik);
    if (resolvable.length === 0) return { drafts: [] };

    const start = (rotation ?? stored.rotation) % resolvable.length;
    const take = Math.min(maxPerCycle, resolvable.length);
    const slice = Array.from(
      { length: take },
      (_, i) => resolvable[(start + i) % resolvable.length],
    );
    rotation = (start + take) % resolvable.length;

    const nextCursor = stored.symbols;
    const drafts: MarketEventDraft[] = [];
    const failures: unknown[] = [];

    for (const { cik, symbol } of slice) {
      let payload: unknown;
      try {
        payload = await request(`${SUBMISSIONS_URL}/CIK${cik}.json`, signal);
      } catch (error) {
        // One name SEC would not serve must not cost us the rest of the list.
        failures.push(error);
        continue;
      }
      const recent = ((payload as { filings?: { recent?: RecentFilings } })?.filings?.recent ??
        {}) as RecentFilings;
      const outcome = draftsFor(symbol, cik, recent, nextCursor[symbol]);
      drafts.push(...outcome.drafts);
      if (outcome.cursor) nextCursor[symbol] = outcome.cursor;
    }

    if (failures.length === slice.length) {
      throw new Error(
        `SEC submissions failed for all ${slice.length} names this cycle: ${messageOf(failures[0])}`,
      );
    }

    return {
      cursor: JSON.stringify({ rotation, symbols: nextCursor } satisfies SecCursor),
      drafts,
    };
  }

  return { intervalMs, poll, source: SEC_SOURCE };
}
