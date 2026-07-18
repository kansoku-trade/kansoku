import type {
  ChartDoc,
  ChartMeta,
  CockpitComment,
  CockpitPosition,
  FlowRow,
  IntradayDayContext,
  IntradayEventRisk,
  IntradayOptionsLevels,
  IntradayPrediction,
  IntradayTfSummary,
  NewsItem,
  QuoteCell,
  RawBar,
  RelativeVolume,
  TimeframeKey,
} from "@kansoku/shared/types";
import { ClientError } from "../errors.js";
import { normalizeQuote } from "../realtime/quotes.js";
import { buildCockpitPosition } from "../services/cockpit/position.js";
import { buildDayContext, openingRange, preMarketRange, prevDayLevels, type DayLevels } from "../services/dayLevels.js";
import { lastVwap, sessionVwap } from "../services/vwap.js";
import { macd } from "../services/indicators.js";
import { getEventRisk } from "../services/events.js";
import { coerceIntradayTimeframe } from "../services/intraday.js";
import { computeRelativeVolume } from "../services/relvol.js";
import { readActiveLessons } from "../services/lessons.js";
import { getProvider } from "../services/marketdata/registry.js";
import { getOptionsLevels } from "../services/optionsLevels.js";
import type { RawPosition } from "../services/marketdata/types.js";
import { easternDate } from "../services/session.js";
import { listCharts, loadChart, type ListFilter } from "../services/store.js";
import { marketOf } from "../services/symbol.utils.js";
import { listComments } from "./comments.js";

const KLINE_COUNT = 150;
const REASSESS_DAY_KLINE_COUNT = 60;
const COMMENT_M5_FETCH = 240;
const RELVOL_M15_BARS = 500;
const DAY_KLINE_COUNT = 10;
const COMMENT_M5_BARS = 48;
const REASSESS_TF_BARS = 60;
const RECENT_COMMENTS = 5;
const REASSESS_TIMEFRAMES: { key: TimeframeKey; period: string }[] = [
  { key: "m5", period: "5m" },
  { key: "m15", period: "15m" },
  { key: "h1", period: "1h" },
];

export interface DatapackDeps {
  fetchQuote: (symbol: string) => Promise<QuoteCell>;
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  fetchFlow: (symbol: string) => Promise<FlowRow[]>;
  fetchNews: (symbol: string) => Promise<NewsItem[]>;
  fetchPositions: () => Promise<RawPosition[]>;
  listComments: (symbol: string, date: string) => Promise<CockpitComment[]>;
  listCharts: (filter: ListFilter) => Promise<ChartMeta[]>;
  loadChart: (id: string) => Promise<ChartDoc | null>;
  fetchOptionsLevels: (symbol: string) => Promise<IntradayOptionsLevels | null>;
  fetchEventRisk: (symbol: string) => Promise<IntradayEventRisk | null>;
  readLessons: () => Promise<string[]>;
  now: () => Date;
}

export const defaultDatapackDeps: DatapackDeps = {
  fetchQuote: async (symbol) => {
    const quotes = await getProvider(marketOf(symbol)).getQuotes([symbol]);
    if (!quotes.length) throw new ClientError(`no quote data for ${symbol}`, undefined, 502);
    return normalizeQuote(quotes[0], Date.now());
  },
  fetchKline: (symbol, period, count) => getProvider(marketOf(symbol)).getKline(symbol, period, count),
  fetchFlow: (symbol) => getProvider(marketOf(symbol)).getFlow?.(symbol) ?? Promise.resolve([]),
  fetchNews: (symbol) => getProvider(marketOf(symbol)).getNews(symbol),
  fetchPositions: () => getProvider().getPositions?.() ?? Promise.resolve([]),
  listComments,
  listCharts,
  loadChart,
  fetchOptionsLevels: getOptionsLevels,
  fetchEventRisk: getEventRisk,
  readLessons: readActiveLessons,
  now: () => new Date(),
};

export interface PredictionSummary {
  chartId: string;
  direction: IntradayPrediction["direction"] | null;
  anchor: IntradayPrediction["anchor"] | null;
  entry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  zones: { label: string; low: number; high: number }[];
}

export interface CommentPack {
  symbol: string;
  as_of: string;
  quote: QuoteCell;
  m5: { bars: RawBar[]; macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } };
  flow: FlowRow[];
  prediction: PredictionSummary | null;
  recent_comments: CockpitComment[];
  day_levels: DayLevels;
  rel_volume: RelativeVolume | null;
}

export interface ReassessTimeframe {
  bars: RawBar[];
  summary: IntradayTfSummary | null;
}

export interface ReassessPack {
  symbol: string;
  as_of: string;
  timeframes: Record<TimeframeKey, ReassessTimeframe>;
  flow: FlowRow[];
  rel_volume: RelativeVolume | null;
  day_levels: DayLevels | null;
  day_context: IntradayDayContext | null;
  options_levels: IntradayOptionsLevels | null;
  event_risk: IntradayEventRisk | null;
  lessons: string[];
  market: { spy: QuoteCell | null; qqq: QuoteCell | null };
  news: NewsItem[];
  prediction: IntradayPrediction | null;
  prediction_chart_id: string | null;
  position: CockpitPosition | null;
}

export async function findTodayLatestIntradayDoc(
  symbol: string,
  deps: Pick<DatapackDeps, "listCharts" | "loadChart" | "now">,
): Promise<ChartDoc | null> {
  const today = easternDate(deps.now());
  const metas = await deps.listCharts({ symbol, type: "intraday" });
  const todays = metas
    .filter((m) => easternDate(new Date(m.created_at)) === today)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (!todays.length) return null;
  return deps.loadChart(todays[0].id);
}

const PLAN_ZONE_KINDS = new Set(["entry", "stop", "target"]);

function predictionSummary(doc: ChartDoc | null): PredictionSummary | null {
  if (!doc) return null;
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;
  const plan = doc.built.kind === "intraday" ? doc.built.entryPlan : null;
  const zones = (plan?.price_zones ?? [])
    .filter((z) => !PLAN_ZONE_KINDS.has(z.kind) && Number.isFinite(z.low) && Number.isFinite(z.high))
    .map((z) => ({ label: z.label, low: z.low, high: z.high }));
  return {
    chartId: doc.id,
    direction: prediction?.direction ?? null,
    anchor: prediction?.anchor ?? null,
    entry: plan?.entry ?? null,
    stop: plan?.stop ?? null,
    target1: plan?.target1 ?? null,
    target2: plan?.target2 ?? null,
    zones,
  };
}

function summarizeTimeframe(bars: RawBar[], key: TimeframeKey): IntradayTfSummary | null {
  try {
    return coerceIntradayTimeframe(bars, key).summary;
  } catch {
    return null;
  }
}

export async function buildCommentPack(
  symbol: string,
  deps: DatapackDeps = defaultDatapackDeps,
): Promise<CommentPack> {
  const now = deps.now();
  const [quote, m5Bars, flow, doc, comments, dayBars, m15Bars] = await Promise.all([
    deps.fetchQuote(symbol),
    deps.fetchKline(symbol, "5m", COMMENT_M5_FETCH),
    deps.fetchFlow(symbol),
    findTodayLatestIntradayDoc(symbol, deps),
    deps.listComments(symbol, easternDate(now)),
    deps.fetchKline(symbol, "day", DAY_KLINE_COUNT).catch(() => [] as RawBar[]),
    deps.fetchKline(symbol, "15m", RELVOL_M15_BARS).catch(() => [] as RawBar[]),
  ]);

  const closes = m5Bars.map((b) => Number(b.close));
  const { dif, dea, hist } = macd(closes);
  const tail = <T>(arr: T[]): T[] => arr.slice(-COMMENT_M5_BARS);

  return {
    symbol,
    as_of: now.toISOString(),
    quote,
    m5: { bars: tail(m5Bars), macd: { dif: tail(dif), dea: tail(dea), hist: tail(hist) } },
    flow,
    prediction: predictionSummary(doc),
    recent_comments: comments.slice(-RECENT_COMMENTS),
    day_levels: {
      prev_day: prevDayLevels(dayBars, now),
      pre_market: preMarketRange(m5Bars, now),
      opening_range: openingRange(m5Bars, now),
    },
    rel_volume: computeRelativeVolume(m15Bars, now),
  };
}

const UPDATE_FLOW_ROWS = 10;

export interface CommentUpdate {
  symbol: string;
  as_of: string;
  quote: QuoteCell;
  m5: CommentPack["m5"];
  flow: FlowRow[];
  day_levels: Pick<DayLevels, "opening_range">;
  rel_volume: RelativeVolume | null;
}

// Incremental follow-up message for a reused commentator session: only fields
// that move intraday. prediction / prev_day / pre_market / recent_comments are
// already in the session transcript (first message or the agent's own replies).
export function buildCommentUpdate(pack: CommentPack, lastBarTime: string | null): CommentUpdate {
  const { bars, macd } = pack.m5;
  const lastMs = lastBarTime ? Date.parse(lastBarTime) : Number.NaN;
  const startIdx = Number.isFinite(lastMs) ? bars.findIndex((b) => Date.parse(b.time) > lastMs) : 0;
  const newBars = startIdx === -1 ? [] : bars.slice(startIdx);
  const tail = <T>(arr: T[]): T[] => (newBars.length ? arr.slice(-newBars.length) : []);

  return {
    symbol: pack.symbol,
    as_of: pack.as_of,
    quote: pack.quote,
    m5: { bars: newBars, macd: { dif: tail(macd.dif), dea: tail(macd.dea), hist: tail(macd.hist) } },
    flow: pack.flow.slice(-UPDATE_FLOW_ROWS),
    day_levels: { opening_range: pack.day_levels.opening_range },
    rel_volume: pack.rel_volume,
  };
}

export async function buildReassessPack(
  symbol: string,
  deps: DatapackDeps = defaultDatapackDeps,
): Promise<ReassessPack> {
  const now = deps.now();
  const [barsList, flow, doc, positions, relvolBars, dayBars, news, spy, qqq, optionsLevels, eventRisk, lessons] =
    await Promise.all([
      Promise.all(REASSESS_TIMEFRAMES.map((tf) => deps.fetchKline(symbol, tf.period, KLINE_COUNT))),
      deps.fetchFlow(symbol),
      findTodayLatestIntradayDoc(symbol, deps),
      deps.fetchPositions().catch(() => [] as RawPosition[]),
      deps.fetchKline(symbol, "15m", RELVOL_M15_BARS).catch(() => [] as RawBar[]),
      deps.fetchKline(symbol, "day", REASSESS_DAY_KLINE_COUNT).catch(() => [] as RawBar[]),
      deps.fetchNews(symbol).catch(() => [] as NewsItem[]),
      deps.fetchQuote("SPY.US").catch(() => null),
      deps.fetchQuote("QQQ.US").catch(() => null),
      deps.fetchOptionsLevels(symbol).catch(() => null),
      deps.fetchEventRisk(symbol).catch(() => null),
      deps.readLessons().catch(() => [] as string[]),
    ]);

  const timeframes = {} as Record<TimeframeKey, ReassessTimeframe>;
  REASSESS_TIMEFRAMES.forEach((tf, i) => {
    const bars = barsList[i];
    timeframes[tf.key] = { bars: bars.slice(-REASSESS_TF_BARS), summary: summarizeTimeframe(bars, tf.key) };
  });

  const prediction = (doc?.input.prediction as IntradayPrediction | undefined) ?? null;
  const plan = doc && doc.built.kind === "intraday" ? doc.built.entryPlan : null;
  const m5Closes = barsList[0].map((b) => Number(b.close));
  const last = m5Closes[m5Closes.length - 1];
  const position =
    last != null && Number.isFinite(last)
      ? buildCockpitPosition(
          positions,
          symbol,
          last,
          plan ? { stop: plan.stop, target1: plan.target1, target2: plan.target2 } : null,
        )
      : null;

  const m5Bars = barsList[0];
  return {
    symbol,
    as_of: now.toISOString(),
    timeframes,
    flow,
    rel_volume: relvolBars.length ? computeRelativeVolume(relvolBars, now) : null,
    day_levels: {
      prev_day: prevDayLevels(dayBars, now),
      pre_market: preMarketRange(m5Bars, now),
      opening_range: openingRange(m5Bars, now),
    },
    day_context: buildDayContext(dayBars, m5Bars, now, lastVwap(sessionVwap(m5Bars))),
    options_levels: optionsLevels,
    event_risk: eventRisk,
    lessons,
    market: { spy, qqq },
    news: news.slice(0, 6),
    prediction,
    prediction_chart_id: doc?.id ?? null,
    position,
  };
}

export function truncateForPrompt(pack: unknown, maxChars: number): string {
  const json = JSON.stringify(pack);
  return json.length <= maxChars ? json : json.slice(0, maxChars);
}
