import type { ChartDoc, RawBar, TimeframeKey } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import {
  buildChart,
  getDayKlineCached,
  hasDayKlineCached,
  rebuild,
  refreshBody,
} from '../charts/build.js';
import { getEventRisk } from '../marketdata/events.js';
import { TIMEFRAME_ORDER } from '../analysis/intraday/constants.js';
import { activeProDetectors } from '../pro/detectors.js';
import { featureStateSync } from '../pro/features.js';
import { getStream } from '../marketdata/registry.js';
import type { CandlePeriod } from '../marketdata/quoteStream.js';
import { classifySession, isCurrentSessionId } from '../marketdata/session.js';
import { predictionStale } from '../platform/staleness.js';
import { loadChart } from '../charts/store.js';
import { marketOf, normalizeSymbol, type Market } from '../symbols/symbol.utils.js';
import {
  mergeCandleBar,
  mergeFreshBars,
  type FrozenBarRange,
  type PushBar,
} from './candleMerge.js';
import { loadCandleCache, maybeSaveCandleCache, saveCandleCache } from './candleCache.js';
import { createPoller, type PollerHandle } from './poller.js';
import { isPushFresh, pollIntervalMs } from './pushFallback.js';
import { overlayAnalysisInput } from './previewOverlay.js';
import { latestIntradayDoc } from '../cockpit/entryPlan.js';

const LIVE_TYPES = new Set(['flow', 'intraday']);

const TF_TO_CANDLE_PERIOD: Record<TimeframeKey, CandlePeriod> = { m5: '5m', m15: '15m', h1: '60m' };
const DEBOUNCE_MS = 250;
const PUSH_FRESH_WINDOW_MS = 3_000;

const chartMarkets = new Map<string, Market>();

// Cache pool: after the last subscriber leaves, chart state lingers (streams
// unwired, polling stopped, zero quota spend) so a revisit gets the cached
// frame instantly and only backfills the tail. LRU-bounded across symbols.
const LINGER_MS = 30 * 60_000;
const LINGER_MAX = 12;
const lingeringKeys = new Set<string>();

const TAIL_MARGIN_BARS = 5;
const TAIL_BASE_TF_MS = 5 * 60_000;
const FULL_FETCH_COUNT = 1000;

export function tailFetchCount(
  lastFetchAt: number,
  now: number,
  fullCount = FULL_FETCH_COUNT,
): number {
  const elapsed = Math.max(0, now - lastFetchAt);
  return Math.min(fullCount, Math.ceil(elapsed / TAIL_BASE_TF_MS) + TAIL_MARGIN_BARS);
}

function chartIntervalMs(key?: string): number {
  const state = key ? candleStates.get(key) : undefined;
  const market = (key ? chartMarkets.get(key) : undefined) ?? state?.market ?? 'US';
  const session = classifySession(Math.floor(Date.now() / 1000), market);
  const now = Date.now();
  const lastPushAt = state?.lastPushAt ?? null;
  if (state) {
    const fresh = isPushFresh(lastPushAt, now, PUSH_FRESH_WINDOW_MS);
    if (state.pushMode !== fresh) {
      state.pushMode = fresh;
      console.log(
        `[chart-live] ${key} ${fresh ? 'push-driven — poller demoted to overnight tier' : 'push stale — poller reverting to session tier'}`,
      );
    }
  }
  return pollIntervalMs(lastPushAt, now, session, PUSH_FRESH_WINDOW_MS);
}

const chartPollers = new Map<string, PollerHandle>();
const chartPollerSetups = new Map<string, Promise<PollerHandle>>();

// Concurrent first subscribers for one key must share a single setup: without this
// both see no poller, both build one, and the loser's onStop later tears down the
// shared candle state under the winner. The in-flight entry is cleared on both
// success and failure so a failed setup can be retried by a later subscriber.
async function getOrCreatePoller(
  key: string,
  setup: () => Promise<PollerHandle>,
): Promise<PollerHandle> {
  const existing = chartPollers.get(key);
  if (existing) return existing;
  const inflight = chartPollerSetups.get(key);
  if (inflight) return inflight;
  const promise = setup()
    .then((handle) => {
      chartPollers.set(key, handle);
      return handle;
    })
    .finally(() => {
      chartPollerSetups.delete(key);
    });
  chartPollerSetups.set(key, promise);
  return promise;
}

function predictionFields(doc: ChartDoc) {
  return {
    prediction_updated_at: doc.prediction_updated_at,
    prediction_stale: predictionStale(doc, new Date()),
  };
}

interface LatestDoc {
  title: string;
  input: Record<string, unknown>;
  prediction?: { prediction_updated_at: string | undefined; prediction_stale: boolean };
}

interface CandleState {
  symbol: string;
  viewCount: number | undefined;
  market: Market;
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  frozenRanges: Partial<Record<TimeframeKey, FrozenBarRange>>;
  lastPushAt: number | null;
  lastFetchAt: number;
  lastRebuildAt: number;
  pushMode: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  unsubs: Array<() => void>;
  baseInput?: Record<string, unknown>;
  loadDoc: () => Promise<LatestDoc | null>;
}

const candleStates = new Map<string, CandleState>();

function frozenRangesOf(
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>,
): Partial<Record<TimeframeKey, FrozenBarRange>> {
  const ranges: Partial<Record<TimeframeKey, FrozenBarRange>> = {};
  for (const tf of TIMEFRAME_ORDER) {
    const bars = timeframes[tf];
    if (!bars?.length) continue;
    const start = Date.parse(bars[0].time);
    const end = Date.parse(bars.at(-1)!.time);
    if (Number.isFinite(start) && Number.isFinite(end)) ranges[tf] = { start, end };
  }
  return ranges;
}

// Leading-edge throttle: an idle chart rebuilds immediately on the first push,
// then at most every DEBOUNCE_MS while pushes keep streaming in.
function scheduleDebouncedRebuild(key: string): void {
  const state = candleStates.get(key);
  if (!state || state.debounceTimer) return;
  const wait = Math.max(0, DEBOUNCE_MS - (Date.now() - state.lastRebuildAt));
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    state.lastRebuildAt = Date.now();
    void runPushRebuild(key).catch((err) => {
      console.warn('[chart-live] push rebuild failed', key, err);
    });
  }, wait);
}

// Live rebuilds must never re-materialize stored options_levels for a client
// whose options-walls feature is inactive: fall back to the persisted value only
// when the feature is active, otherwise null.
export function liveOptionsLevels(fetched: unknown, latestInput: Record<string, unknown>): unknown {
  if (fetched != null) return fetched;
  return featureStateSync('options-walls') === 'active'
    ? (latestInput.options_levels ?? null)
    : null;
}

// A frame must not stall on sidebar enrichment: cold options/event-risk
// fetches get this long, then the frame ships with the persisted fallback and
// the warmed cache fills the next rebuild.
const ENRICH_WAIT_MS = 250;

function enrichWithin<T>(request: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    request,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ENRICH_WAIT_MS)),
  ]);
}

// Rebuild an intraday chart from the live in-memory candle state (the frozen
// analysis snapshot plus whatever bars push/poller have merged in). Both the
// streaming push path and the poller safety net funnel through here so the two
// never diverge on the same series.
async function buildFromState(
  state: CandleState,
  latest: LatestDoc,
): Promise<Record<string, unknown>> {
  const latestInput = latest.input;
  const timeframes = state.timeframes;
  const lastM5 = timeframes.m5?.at(-1);
  // Docs persisted before options/event support have no such input fields, and
  // stored values freeze at analysis time — the live view refetches both (the
  // getters are memory-cached, so this is free on the streaming hot path).
  const symbol = latestInput.symbol;
  const getOptions = activeProDetectors().getOptionsLevels;
  const [optionsLevels, eventRisk] =
    typeof symbol === 'string'
      ? await Promise.all([
          enrichWithin(
            getOptions ? getOptions(symbol).catch(() => null) : Promise.resolve(null),
            null,
          ),
          enrichWithin(getEventRisk(symbol).catch(() => null), null),
        ])
      : [null, null];
  const input: Record<string, unknown> = {
    ...latestInput,
    timeframes,
    as_of: lastM5?.time ?? latestInput.as_of,
    options_levels: liveOptionsLevels(optionsLevels, latestInput),
    event_risk: eventRisk ?? latestInput.event_risk ?? null,
  };
  const result = rebuild('intraday', input, latest.title);
  return latest.prediction
    ? { built: result.built, ...latest.prediction }
    : { built: result.built };
}

async function runPushRebuild(key: string): Promise<void> {
  const state = candleStates.get(key);
  const handle = chartPollers.get(key);
  if (!state || !handle) return;
  const latest = await state.loadDoc();
  if (!latest) return;
  handle.pushData(await buildFromState(state, latest));
}

function wireCandleStream(key: string, state: CandleState): void {
  if (state.unsubs.length > 0) return;
  const stream = getStream(state.market);
  for (const tf of TIMEFRAME_ORDER) {
    const period = TF_TO_CANDLE_PERIOD[tf];
    const unsub = stream.subscribeCandlesticks(
      state.symbol,
      period,
      (bar) => {
        const cur = candleStates.get(key);
        if (!cur) return;
        const bars = cur.timeframes[tf] ?? [];
        const pushBar: PushBar = {
          ts: bar.ts,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        };
        cur.timeframes[tf] = mergeCandleBar(bars, pushBar);
        cur.lastPushAt = Date.now();
        scheduleDebouncedRebuild(key);
      },
      state.timeframes[tf]?.at(-1),
    );
    state.unsubs.push(unsub);
  }
}

function unwireCandleStream(state: CandleState): void {
  for (const unsub of state.unsubs) unsub();
  state.unsubs = [];
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
}

function wireCandleState(key: string, symbol: string, state: CandleState): void {
  candleStates.set(key, state);
  wireCandleStream(key, state);
}

function lingerOptions(key: string) {
  return {
    lingerMs: LINGER_MS,
    onIdle: () => {
      const state = candleStates.get(key);
      if (state) {
        unwireCandleStream(state);
        if (key.startsWith('preview:')) {
          saveCandleCache(state.symbol, {
            timeframes: state.timeframes,
            dayKline: (state.baseInput?.day_kline as RawBar[] | undefined) ?? null,
            lastFetchAt: state.lastFetchAt,
          });
        }
      }
      lingeringKeys.delete(key);
      lingeringKeys.add(key);
      while (lingeringKeys.size > LINGER_MAX) {
        const oldest = lingeringKeys.values().next().value as string;
        lingeringKeys.delete(oldest);
        chartPollers.get(oldest)?.destroy();
      }
    },
    onResume: () => {
      lingeringKeys.delete(key);
      const state = candleStates.get(key);
      if (state) {
        state.lastPushAt = null;
        wireCandleStream(key, state);
      }
    },
  };
}

function setupCandleState(
  key: string,
  id: string,
  viewCount: number | undefined,
  doc: ChartDoc,
): void {
  if (candleStates.has(key)) return;
  const symbol = (doc.input as Record<string, unknown>).symbol;
  if (typeof symbol !== 'string' || !symbol) return;
  const timeframes = {
    ...((doc.input as Record<string, unknown>).timeframes as Partial<
      Record<TimeframeKey, RawBar[]>
    >),
  };
  const state: CandleState = {
    symbol,
    viewCount,
    market: marketOf(symbol),
    timeframes,
    frozenRanges: frozenRangesOf(timeframes),
    lastPushAt: null,
    lastFetchAt: 0,
    lastRebuildAt: 0,
    pushMode: false,
    debounceTimer: null,
    unsubs: [],
    loadDoc: async () => {
      const fresh = await loadChart(id);
      if (!fresh) return null;
      return {
        title: fresh.title,
        input: fresh.input as Record<string, unknown>,
        prediction: predictionFields(fresh),
      };
    },
  };
  wireCandleState(key, symbol, state);
}

function setupPreviewCandleState(
  key: string,
  symbol: string,
  input: Record<string, unknown>,
  title: string,
): void {
  if (candleStates.has(key)) return;
  const timeframes = { ...(input.timeframes as Partial<Record<TimeframeKey, RawBar[]>>) };
  const state: CandleState = {
    symbol,
    viewCount: undefined,
    market: marketOf(symbol),
    timeframes,
    frozenRanges: frozenRangesOf(timeframes),
    lastPushAt: null,
    lastFetchAt: Date.now(),
    lastRebuildAt: 0,
    pushMode: false,
    debounceTimer: null,
    unsubs: [],
    baseInput: input,
    loadDoc: async () => {
      const latestDoc = await latestIntradayDoc(symbol);
      return {
        title,
        input: overlayAnalysisInput(input, latestDoc),
        prediction: latestDoc ? predictionFields(latestDoc) : undefined,
      };
    },
  };
  wireCandleState(key, symbol, state);
}

function teardownCandleState(key: string): void {
  const state = candleStates.get(key);
  if (!state) return;
  unwireCandleStream(state);
  candleStates.delete(key);
}

export async function subscribeChart(
  id: string,
  push: (envelope: string) => void,
  count?: number,
): Promise<() => void> {
  const doc = await loadChart(id);
  if (!doc) throw new ClientError(`chart not found: ${id}`, undefined, 404);

  const viewCount = count !== undefined && doc.type === 'intraday' ? count : undefined;
  if (viewCount === undefined) {
    push(JSON.stringify({ type: 'data', data: { built: doc.built, ...predictionFields(doc) } }));
  }

  const docSymbol = (doc.input as Record<string, unknown>).symbol;
  const market = typeof docSymbol === 'string' && docSymbol ? marketOf(docSymbol) : 'US';
  if (
    !LIVE_TYPES.has(doc.type) ||
    !refreshBody(doc.type, doc.input) ||
    !isCurrentSessionId(id, market)
  )
    return () => {};

  const key = viewCount === undefined ? id : `${id}#${viewCount}`;
  const handle = await getOrCreatePoller(key, async () => {
    chartMarkets.set(key, market);
    if (doc.type === 'intraday') setupCandleState(key, id, viewCount, doc);
    return createPoller({
      intervalMs: () => chartIntervalMs(key),
      task: async () => {
        const latest = await loadChart(id);
        if (!latest) throw new ClientError(`chart not found: ${id}`, undefined, 404);
        const body = refreshBody(latest.type, latest.input);
        if (!body) return { built: latest.built, ...predictionFields(latest) };
        const state = latest.type === 'intraday' ? candleStates.get(key) : undefined;
        const count = state
          ? tailFetchCount(
              state.lastFetchAt,
              Date.now(),
              Math.max(FULL_FETCH_COUNT, state.viewCount ?? 0),
            )
          : viewCount;
        const result = await buildChart(count === undefined ? body : { ...body, count });
        if (state) {
          state.lastFetchAt = Date.now();
          // Safety net converges WITHOUT clobbering the frozen analysis snapshot:
          // fold the tail refetch into state.timeframes while pinning the original
          // snapshot range. The immutable range lets a later poll fill any gap
          // behind an already-appended live bar and retain requested older history.
          const freshTf = (result.input.timeframes ?? {}) as Partial<
            Record<TimeframeKey, RawBar[]>
          >;
          for (const tf of TIMEFRAME_ORDER) {
            const incoming = freshTf[tf];
            if (incoming) {
              state.timeframes[tf] = mergeFreshBars(
                state.timeframes[tf] ?? [],
                incoming,
                state.frozenRanges[tf],
              );
            }
          }
          return await buildFromState(state, {
            title: latest.title,
            input: latest.input as Record<string, unknown>,
            prediction: predictionFields(latest),
          });
        }
        return { built: result.built, ...predictionFields(latest) };
      },
      ...lingerOptions(key),
      onStop: () => {
        lingeringKeys.delete(key);
        chartPollers.delete(key);
        chartMarkets.delete(key);
        teardownCandleState(key);
      },
    });
  });
  return handle.subscribe(push);
}


export async function subscribePreview(
  symbol: string,
  push: (envelope: string) => void,
): Promise<() => void> {
  const normalized = normalizeSymbol(symbol);
  const key = `preview:${normalized}`;

  // The cold build runs inside the poller task, not the setup factory: a
  // rate-limited first fetch then surfaces as a degraded status the poller
  // retries with backoff, instead of a hard error the client cannot recover
  // from without re-navigating.
  const handle = await getOrCreatePoller(key, async () => {
    chartMarkets.set(key, marketOf(normalized));
    return createPoller({
      intervalMs: () => chartIntervalMs(key),
      task: async () => {
        let state = candleStates.get(key);
        if (!state) {
          const cached = loadCandleCache(normalized);
          const result = await buildChart({
            type: 'intraday',
            symbol: normalized,
            session: 'all',
            skip_news: true,
            day_kline_lazy: true,
            enrichment_lazy: true,
            ...(cached
              ? {
                  timeframes: cached.timeframes,
                  ...(cached.dayKline?.length ? { day_kline: cached.dayKline } : {}),
                }
              : {}),
          });
          setupPreviewCandleState(key, normalized, result.input, result.title);
          state = candleStates.get(key);
          if (!state) return { built: result.built };
          if (cached) state.lastFetchAt = cached.lastFetchAt;
          backfillDayKline(key, normalized);
          backfillEnrichment(key, normalized);
          const latest = await state.loadDoc();
          if (!latest) return { built: result.built };
          if (cached) {
            try {
              await refreshPreviewTail(normalized, state, latest.input);
            } catch (err) {
              console.warn('[chart-live] tail refresh after cache seed failed', key, err);
            }
          }
          return await buildFromState(state, latest);
        }
        const latest = await state.loadDoc();
        if (!latest) throw new ClientError(`preview doc unavailable: ${normalized}`);
        await refreshPreviewTail(normalized, state, latest.input);
        return await buildFromState(state, latest);
      },
      ...lingerOptions(key),
      onStop: () => {
        lingeringKeys.delete(key);
        chartPollers.delete(key);
        chartMarkets.delete(key);
        teardownCandleState(key);
      },
    });
  });

  return handle.subscribe(push);
}

async function refreshPreviewTail(
  symbol: string,
  state: CandleState,
  latestInput: Record<string, unknown>,
): Promise<void> {
  const body = refreshBody('intraday', latestInput);
  if (!body) return;
  const fresh = await buildChart({
    ...body,
    count: tailFetchCount(state.lastFetchAt, Date.now()),
  });
  state.lastFetchAt = Date.now();
  const freshTf = (fresh.input.timeframes ?? {}) as Partial<Record<TimeframeKey, RawBar[]>>;
  for (const tf of TIMEFRAME_ORDER) {
    const incoming = freshTf[tf];
    if (incoming) {
      state.timeframes[tf] = mergeFreshBars(
        state.timeframes[tf] ?? [],
        incoming,
        state.frozenRanges[tf],
      );
    }
  }
  maybeSaveCandleCache(symbol, {
    timeframes: state.timeframes,
    dayKline: (state.baseInput?.day_kline as RawBar[] | undefined) ?? null,
    lastFetchAt: state.lastFetchAt,
  });
}

function backfillDayKline(key: string, symbol: string): void {
  if (hasDayKlineCached(symbol)) return;
  void getDayKlineCached(symbol).then((bars) => {
    const state = candleStates.get(key);
    const base = state?.baseInput;
    if (!bars.length || !base) return;
    base.day_kline = bars;
    chartPollers.get(key)?.refresh();
  });
}

function backfillEnrichment(key: string, symbol: string): void {
  const getOptions = activeProDetectors().getOptionsLevels;
  const jobs: Promise<unknown>[] = [getEventRisk(symbol).catch(() => null)];
  if (getOptions) jobs.push(getOptions(symbol).catch(() => null));
  void Promise.allSettled(jobs).then(() => chartPollers.get(key)?.refresh());
}
