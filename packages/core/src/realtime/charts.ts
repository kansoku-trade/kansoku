import type { ChartDoc, RawBar, TimeframeKey } from "@kansoku/shared/types";
import { ClientError } from "../errors.js";
import { buildChart, rebuild, refreshBody } from "../services/build.js";
import { getEventRisk } from "../services/events.js";
import { TIMEFRAME_ORDER } from "../services/intraday.js";
import { getOptionsLevels } from "../services/optionsLevels.js";
import { getStream } from "../services/marketdata/registry.js";
import type { CandlePeriod } from "../services/marketdata/quoteStream.js";
import { classifySession, isCurrentSessionId } from "../services/session.js";
import { predictionStale } from "../services/staleness.js";
import { loadChart } from "../services/store.js";
import { marketOf, normalizeSymbol, type Market } from "../services/symbol.utils.js";
import { mergeCandleBar, mergeFreshBars, type FrozenBarRange, type PushBar } from "./candleMerge.js";
import { createPoller, type PollerHandle } from "./poller.js";
import { isPushFresh, pollIntervalMs } from "./pushFallback.js";

const LIVE_TYPES = new Set(["flow", "intraday"]);

const TF_TO_CANDLE_PERIOD: Record<TimeframeKey, CandlePeriod> = { m5: "5m", m15: "15m", h1: "60m" };
const DEBOUNCE_MS = 250;
const PUSH_FRESH_WINDOW_MS = 3_000;

const chartMarkets = new Map<string, Market>();

function chartIntervalMs(key?: string): number {
  const state = key ? candleStates.get(key) : undefined;
  const market = (key ? chartMarkets.get(key) : undefined) ?? state?.market ?? "US";
  const session = classifySession(Math.floor(Date.now() / 1000), market);
  const now = Date.now();
  const lastPushAt = state?.lastPushAt ?? null;
  if (state) {
    const fresh = isPushFresh(lastPushAt, now, PUSH_FRESH_WINDOW_MS);
    if (state.pushMode !== fresh) {
      state.pushMode = fresh;
      console.log(`[chart-live] ${key} ${fresh ? "push-driven — poller demoted to overnight tier" : "push stale — poller reverting to session tier"}`);
    }
  }
  return pollIntervalMs(lastPushAt, now, session, PUSH_FRESH_WINDOW_MS);
}

const chartPollers = new Map<string, PollerHandle>();

function predictionFields(doc: ChartDoc) {
  return { prediction_updated_at: doc.prediction_updated_at, prediction_stale: predictionStale(doc, new Date()) };
}

interface LatestDoc {
  title: string;
  input: Record<string, unknown>;
  prediction?: { prediction_updated_at: string | undefined; prediction_stale: boolean };
}

interface CandleState {
  viewCount: number | undefined;
  market: Market;
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  frozenRanges: Partial<Record<TimeframeKey, FrozenBarRange>>;
  lastPushAt: number | null;
  lastRebuildAt: number;
  pushMode: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  unsubs: Array<() => void>;
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
    const end = Date.parse(bars[bars.length - 1].time);
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
      console.warn("[chart-live] push rebuild failed", key, err);
    });
  }, wait);
}

// Rebuild an intraday chart from the live in-memory candle state (the frozen
// analysis snapshot plus whatever bars push/poller have merged in). Both the
// streaming push path and the poller safety net funnel through here so the two
// never diverge on the same series.
async function buildFromState(state: CandleState, latest: LatestDoc): Promise<Record<string, unknown>> {
  const latestInput = latest.input;
  const timeframes = state.timeframes;
  const lastM5 = timeframes.m5?.[timeframes.m5.length - 1];
  // Docs persisted before options/event support have no such input fields, and
  // stored values freeze at analysis time — the live view refetches both (the
  // getters are memory-cached, so this is free on the streaming hot path).
  const symbol = latestInput.symbol;
  const [optionsLevels, eventRisk] =
    typeof symbol === "string"
      ? await Promise.all([getOptionsLevels(symbol).catch(() => null), getEventRisk(symbol).catch(() => null)])
      : [null, null];
  const input: Record<string, unknown> = {
    ...latestInput,
    timeframes,
    as_of: lastM5?.time ?? latestInput.as_of,
    options_levels: optionsLevels ?? latestInput.options_levels ?? null,
    event_risk: eventRisk ?? latestInput.event_risk ?? null,
  };
  const result = rebuild("intraday", input, latest.title);
  return latest.prediction ? { built: result.built, ...latest.prediction } : { built: result.built };
}

async function runPushRebuild(key: string): Promise<void> {
  const state = candleStates.get(key);
  const handle = chartPollers.get(key);
  if (!state || !handle) return;
  const latest = await state.loadDoc();
  if (!latest) return;
  handle.pushData(await buildFromState(state, latest));
}

function wireCandleState(key: string, symbol: string, state: CandleState): void {
  candleStates.set(key, state);
  const stream = getStream(marketOf(symbol));
  for (const tf of TIMEFRAME_ORDER) {
    const period = TF_TO_CANDLE_PERIOD[tf];
    const unsub = stream.subscribeCandlesticks(symbol, period, (bar) => {
      const cur = candleStates.get(key);
      if (!cur) return;
      const bars = cur.timeframes[tf] ?? [];
      const pushBar: PushBar = { ts: bar.ts, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
      cur.timeframes[tf] = mergeCandleBar(bars, pushBar);
      cur.lastPushAt = Date.now();
      scheduleDebouncedRebuild(key);
    });
    state.unsubs.push(unsub);
  }
}

function setupCandleState(key: string, id: string, viewCount: number | undefined, doc: ChartDoc): void {
  if (candleStates.has(key)) return;
  const symbol = (doc.input as Record<string, unknown>).symbol;
  if (typeof symbol !== "string" || !symbol) return;
  const timeframes = {
    ...((doc.input as Record<string, unknown>).timeframes as Partial<Record<TimeframeKey, RawBar[]>>),
  };
  const state: CandleState = {
    viewCount,
    market: marketOf(symbol),
    timeframes,
    frozenRanges: frozenRangesOf(timeframes),
    lastPushAt: null,
    lastRebuildAt: 0,
    pushMode: false,
    debounceTimer: null,
    unsubs: [],
    loadDoc: async () => {
      const fresh = await loadChart(id);
      if (!fresh) return null;
      return { title: fresh.title, input: fresh.input as Record<string, unknown>, prediction: predictionFields(fresh) };
    },
  };
  wireCandleState(key, symbol, state);
}

function setupPreviewCandleState(key: string, symbol: string, input: Record<string, unknown>, title: string): void {
  if (candleStates.has(key)) return;
  const timeframes = { ...(input.timeframes as Partial<Record<TimeframeKey, RawBar[]>>) };
  const state: CandleState = {
    viewCount: undefined,
    market: marketOf(symbol),
    timeframes,
    frozenRanges: frozenRangesOf(timeframes),
    lastPushAt: null,
    lastRebuildAt: 0,
    pushMode: false,
    debounceTimer: null,
    unsubs: [],
    loadDoc: async () => ({ title, input }),
  };
  wireCandleState(key, symbol, state);
}

function teardownCandleState(key: string): void {
  const state = candleStates.get(key);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  for (const unsub of state.unsubs) unsub();
  candleStates.delete(key);
}

export async function subscribeChart(id: string, push: (envelope: string) => void, count?: number): Promise<() => void> {
  const doc = await loadChart(id);
  if (!doc) throw new ClientError(`chart not found: ${id}`, undefined, 404);

  const viewCount = count !== undefined && doc.type === "intraday" ? count : undefined;
  if (viewCount === undefined) {
    push(JSON.stringify({ type: "data", data: { built: doc.built, ...predictionFields(doc) } }));
  }

  const docSymbol = (doc.input as Record<string, unknown>).symbol;
  const market = typeof docSymbol === "string" && docSymbol ? marketOf(docSymbol) : "US";
  if (!LIVE_TYPES.has(doc.type) || !refreshBody(doc.type, doc.input) || !isCurrentSessionId(id, market)) return () => {};

  const key = viewCount === undefined ? id : `${id}#${viewCount}`;
  let handle = chartPollers.get(key);
  if (!handle) {
    chartMarkets.set(key, market);
    if (doc.type === "intraday") setupCandleState(key, id, viewCount, doc);
    handle = createPoller({
      intervalMs: () => chartIntervalMs(key),
      task: async () => {
        const latest = await loadChart(id);
        if (!latest) throw new ClientError(`chart not found: ${id}`, undefined, 404);
        const body = refreshBody(latest.type, latest.input);
        if (!body) return { built: latest.built, ...predictionFields(latest) };
        const result = await buildChart(viewCount === undefined ? body : { ...body, count: viewCount });
        if (latest.type === "intraday") {
          // Safety net converges WITHOUT clobbering the frozen analysis snapshot:
          // fold the full refetch into state.timeframes while pinning the original
          // snapshot range. The immutable range lets a later poll fill any gap
          // behind an already-appended live bar and retain requested older history.
          const state = candleStates.get(key);
          if (state) {
            const freshTf = (result.input.timeframes ?? {}) as Partial<Record<TimeframeKey, RawBar[]>>;
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
            return await buildFromState(state, { title: latest.title, input: latest.input as Record<string, unknown>, prediction: predictionFields(latest) });
          }
        }
        return { built: result.built, ...predictionFields(latest) };
      },
      onStop: () => {
        chartPollers.delete(key);
        chartMarkets.delete(key);
        teardownCandleState(key);
      },
    });
    chartPollers.set(key, handle);
  }
  return handle.subscribe(push);
}

const previewInitialBuilt = new Map<string, unknown>();

export async function subscribePreview(symbol: string, push: (envelope: string) => void): Promise<() => void> {
  const normalized = normalizeSymbol(symbol);
  const key = `preview:${normalized}`;

  let handle = chartPollers.get(key);
  if (!handle) {
    const result = await buildChart({ type: "intraday", symbol: normalized, session: "intraday" });
    previewInitialBuilt.set(key, result.built);
    chartMarkets.set(key, marketOf(normalized));
    setupPreviewCandleState(key, normalized, result.input, result.title);
    handle = createPoller({
      intervalMs: () => chartIntervalMs(key),
      task: async () => {
        const state = candleStates.get(key);
        if (!state) return { built: result.built };
        const latest = await state.loadDoc();
        if (!latest) return { built: result.built };
        const body = refreshBody("intraday", latest.input);
        if (body) {
          const fresh = await buildChart(body);
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
        }
        return await buildFromState(state, latest);
      },
      onStop: () => {
        chartPollers.delete(key);
        chartMarkets.delete(key);
        teardownCandleState(key);
        previewInitialBuilt.delete(key);
      },
    });
    chartPollers.set(key, handle);
  }

  const built = previewInitialBuilt.get(key);
  if (built !== undefined && !handle.hasData()) push(JSON.stringify({ type: "data", data: { built } }));
  return handle.subscribe(push);
}
