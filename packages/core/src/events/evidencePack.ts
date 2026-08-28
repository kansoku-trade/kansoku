import type {
  CockpitComment,
  FlowRow,
  MarketEvent,
  MarketEventTrust,
  RawBar,
} from '@kansoku/shared/types';
import type { Db } from '../db/index.js';
import { easternDate } from '../marketdata/session.js';
import { ClientError } from '../platform/errors.js';
import { eventCanvasSlug } from './eventCanvasSlug.js';
import { getEvent, listEventsByCluster } from './store.js';

export type EventEvidenceKind =
  | 'primary'
  | 'cluster'
  | 'price'
  | 'volume'
  | 'flow'
  | 'peer'
  | 'comment'
  | 'research';

export interface EventEvidenceItem {
  kind: EventEvidenceKind;
  title: string;
  summary?: string;
  url?: string | null;
  occurredAt: string;
  observedAt: string;
  symbols?: string[];
  data?: unknown;
}

export interface ResearchEvidence {
  path: string;
  title: string;
  excerpt: string;
  mtime: string;
}

export interface EventEvidencePack {
  event: MarketEvent;
  cluster: MarketEvent[];
  items: EventEvidenceItem[];
  slug: string;
}

export interface EventEvidencePackDeps {
  db?: Db;
  now?: () => Date;
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  fetchFlow: (symbol: string) => Promise<FlowRow[]>;
  listComments: (symbol: string, date: string) => Promise<CockpitComment[]>;
  listResearch: (symbol: string) => Promise<ResearchEvidence[]>;
}

const TRUST_RANK: Record<MarketEventTrust, number> = {
  official: 0,
  verified: 1,
  unverified: 2,
};

const KLINE_COUNT = 48;
const DAY_KLINE_COUNT = 40;
const BAR_WINDOW = 12;
const PEER_SYMBOL = 'SPY.US';
const INTRADAY_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const INTRADAY_SLACK_MS = 2 * 60 * 60 * 1000;
const DAILY_SLACK_MS = 3 * 24 * 60 * 60 * 1000;

export function sliceAroundTime(
  bars: RawBar[],
  occurredAt: string,
  before = BAR_WINDOW,
  after = BAR_WINDOW,
): RawBar[] {
  if (bars.length === 0) return [];
  const target = Date.parse(occurredAt);
  if (!Number.isFinite(target)) return bars.slice(0, before + after + 1);
  let idx = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bars.length; i += 1) {
    const delta = Math.abs(Date.parse(bars[i].time) - target);
    if (delta < best) {
      best = delta;
      idx = i;
    }
  }
  return bars.slice(Math.max(0, idx - before), Math.min(bars.length, idx + after + 1));
}

export function eventKlinePlan(
  occurredAt: string,
  now: Date,
): { period: '5m' | 'day'; count: number; slackMs: number } {
  const age = now.getTime() - Date.parse(occurredAt);
  if (Number.isFinite(age) && age <= INTRADAY_MAX_AGE_MS) {
    return { period: '5m', count: KLINE_COUNT, slackMs: INTRADAY_SLACK_MS };
  }
  return { period: 'day', count: DAY_KLINE_COUNT, slackMs: DAILY_SLACK_MS };
}

export function nearestBarDeltaMs(bars: RawBar[], occurredAt: string): number | null {
  const target = Date.parse(occurredAt);
  if (!Number.isFinite(target) || bars.length === 0) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const bar of bars) {
    const delta = Math.abs(Date.parse(bar.time) - target);
    if (delta < best) best = delta;
  }
  return Number.isFinite(best) ? best : null;
}

function barsCoverOccurredAt(bars: RawBar[], occurredAt: string, slackMs: number): boolean {
  const delta = nearestBarDeltaMs(bars, occurredAt);
  return delta != null && delta <= slackMs;
}

function sortCluster(events: MarketEvent[], primaryId: string): MarketEvent[] {
  return [...events].sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    return (
      TRUST_RANK[a.trust] - TRUST_RANK[b.trust] ||
      a.occurredAt.localeCompare(b.occurredAt) ||
      a.id.localeCompare(b.id)
    );
  });
}

function eventItem(kind: 'primary' | 'cluster', event: MarketEvent): EventEvidenceItem {
  return {
    kind,
    title: event.payload.title,
    summary: event.payload.summary,
    url: event.payload.url ?? null,
    occurredAt: event.occurredAt,
    observedAt: event.observedAt,
    symbols: event.symbols,
    data: { source: event.source, trust: event.trust, class: event.class, kind: event.kind },
  };
}

function volumeOf(bar: RawBar): number {
  const value = typeof bar.volume === 'number' ? bar.volume : Number(bar.volume);
  return Number.isFinite(value) ? value : 0;
}

function closeOf(bar: RawBar): number {
  const value = typeof bar.close === 'number' ? bar.close : Number(bar.close);
  return Number.isFinite(value) ? value : 0;
}

function summarizeBars(symbol: string, bars: RawBar[], occurredAt: string, observedAt: string) {
  const split = Date.parse(occurredAt);
  const before = bars.filter((bar) => Date.parse(bar.time) < split);
  const after = bars.filter((bar) => Date.parse(bar.time) >= split);
  const first = bars[0];
  const last = bars.at(-1);
  return {
    symbol,
    occurredAt,
    observedAt,
    coverage: 'event-window' as const,
    first: first ? { time: first.time, close: closeOf(first) } : null,
    last: last ? { time: last.time, close: closeOf(last) } : null,
    volumeBefore: before.reduce((sum, bar) => sum + volumeOf(bar), 0),
    volumeAfter: after.reduce((sum, bar) => sum + volumeOf(bar), 0),
    bars,
  };
}

async function settled<T>(task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch {
    return null;
  }
}

function commentDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 10);
  return easternDate(new Date(parsed));
}

export async function buildEventEvidencePack(
  eventId: string,
  deps: EventEvidencePackDeps,
): Promise<EventEvidencePack> {
  const event = await getEvent(eventId, deps.db);
  if (!event) throw new ClientError(`event not found: ${eventId}`, undefined, 404);
  const observedAt = deps.now?.().toISOString() ?? new Date().toISOString();
  const cluster = sortCluster(await listEventsByCluster(event.clusterId, deps.db), event.id);
  const items: EventEvidenceItem[] = [eventItem('primary', event)];
  for (const sibling of cluster) {
    if (sibling.id === event.id) continue;
    items.push(eventItem('cluster', sibling));
  }

  const symbols = event.symbols.length > 0 ? event.symbols : [];
  const klineSymbols = symbols.length > 0 ? symbols : [PEER_SYMBOL];

  for (const symbol of klineSymbols) {
    const plan = eventKlinePlan(event.occurredAt, new Date(observedAt));
    const bars = await settled(deps.fetchKline(symbol, plan.period, plan.count));
    const kind: EventEvidenceKind = symbols.includes(symbol) ? 'price' : 'peer';
    if (!bars || bars.length === 0) continue;
    const windowed = sliceAroundTime(bars, event.occurredAt);
    if (windowed.length === 0 || !barsCoverOccurredAt(windowed, event.occurredAt, plan.slackMs)) {
      items.push({
        kind,
        title: `${symbol} 没有取到事件当日行情`,
        occurredAt: event.occurredAt,
        observedAt,
        symbols: [symbol],
        data: {
          symbol,
          coverage: 'unavailable',
          period: plan.period,
          reason: 'nearest bar is outside the event window',
        },
      });
      continue;
    }
    const summary = summarizeBars(symbol, windowed, event.occurredAt, observedAt);
    items.push({
      kind,
      title: kind === 'peer' ? `${symbol} 市场反应` : `${symbol} 事件前后价格`,
      occurredAt: event.occurredAt,
      observedAt,
      symbols: [symbol],
      data: summary,
    });
    items.push({
      kind: 'volume',
      title: `${symbol} 事件前后成交量`,
      occurredAt: event.occurredAt,
      observedAt,
      symbols: [symbol],
      data: {
        symbol,
        volumeBefore: summary.volumeBefore,
        volumeAfter: summary.volumeAfter,
      },
    });
  }

  for (const symbol of symbols) {
    const flow = await settled(deps.fetchFlow(symbol));
    if (!flow || flow.length === 0) continue;
    items.push({
      kind: 'flow',
      title: `${symbol} 资金流`,
      occurredAt: event.occurredAt,
      observedAt,
      symbols: [symbol],
      data: { symbol, rows: flow.slice(-12) },
    });

    const comments = await settled(deps.listComments(symbol, commentDate(event.occurredAt)));
    for (const comment of comments ?? []) {
      items.push({
        kind: 'comment',
        title: `${symbol} 已有点评`,
        summary: comment.text,
        occurredAt: comment.ts,
        observedAt,
        symbols: [symbol],
        data: comment,
      });
    }

    const research = await settled(deps.listResearch(symbol));
    for (const doc of (research ?? []).slice(0, 5)) {
      items.push({
        kind: 'research',
        title: doc.title,
        summary: doc.excerpt,
        url: doc.path,
        occurredAt: doc.mtime,
        observedAt,
        symbols: [symbol],
        data: doc,
      });
    }
  }

  return {
    event,
    cluster,
    items,
    slug: eventCanvasSlug(event.id),
  };
}
