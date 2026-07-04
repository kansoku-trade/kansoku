import type {
  ChartDoc,
  ChartMeta,
  CockpitComment,
  CockpitPosition,
  FlowRow,
  IntradayPrediction,
  IntradayTfSummary,
  QuoteCell,
  RawBar,
  TimeframeKey,
} from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { normalizeQuote, type RawQuote } from "../realtime/quotes.js";
import { buildCockpitPosition } from "../services/cockpit/position.js";
import { macd } from "../services/indicators.js";
import { coerceIntradayTimeframe } from "../services/intraday.js";
import { fetchFlow, fetchKline, fetchPositions, longbridgeJson, type RawPosition } from "../services/longbridge.js";
import { easternDate } from "../services/session.js";
import { listCharts, loadChart, type ListFilter } from "../services/store.js";
import { listComments } from "./comments.js";

const KLINE_COUNT = 150;
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
  fetchPositions: () => Promise<RawPosition[]>;
  listComments: (symbol: string, date: string) => Promise<CockpitComment[]>;
  listCharts: (filter: ListFilter) => Promise<ChartMeta[]>;
  loadChart: (id: string) => Promise<ChartDoc | null>;
  now: () => Date;
}

export const defaultDatapackDeps: DatapackDeps = {
  fetchQuote: async (symbol) => {
    const quotes = await longbridgeJson<RawQuote[]>(["quote", symbol]);
    if (!quotes.length) throw new ClientError(`no quote data for ${symbol}`, undefined, 502);
    return normalizeQuote(quotes[0], Date.now());
  },
  fetchKline,
  fetchFlow,
  fetchPositions,
  listComments,
  listCharts,
  loadChart,
  now: () => new Date(),
};

export interface PredictionSummary {
  chartId: string;
  direction: IntradayPrediction["direction"] | null;
  anchor: IntradayPrediction["anchor"] | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
}

export interface CommentPack {
  symbol: string;
  as_of: string;
  quote: QuoteCell;
  m5: { bars: RawBar[]; macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } };
  flow: FlowRow[];
  prediction: PredictionSummary | null;
  recent_comments: CockpitComment[];
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

function predictionSummary(doc: ChartDoc | null): PredictionSummary | null {
  if (!doc) return null;
  const prediction = (doc.input.prediction as IntradayPrediction | undefined) ?? null;
  const plan = doc.built.kind === "intraday" ? doc.built.entryPlan : null;
  return {
    chartId: doc.id,
    direction: prediction?.direction ?? null,
    anchor: prediction?.anchor ?? null,
    stop: plan?.stop ?? null,
    target1: plan?.target1 ?? null,
    target2: plan?.target2 ?? null,
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
  const [quote, m5Bars, flow, doc, comments] = await Promise.all([
    deps.fetchQuote(symbol),
    deps.fetchKline(symbol, "5m", KLINE_COUNT),
    deps.fetchFlow(symbol),
    findTodayLatestIntradayDoc(symbol, deps),
    deps.listComments(symbol, easternDate(now)),
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
  };
}

export async function buildReassessPack(
  symbol: string,
  deps: DatapackDeps = defaultDatapackDeps,
): Promise<ReassessPack> {
  const now = deps.now();
  const [barsList, flow, doc, positions] = await Promise.all([
    Promise.all(REASSESS_TIMEFRAMES.map((tf) => deps.fetchKline(symbol, tf.period, KLINE_COUNT))),
    deps.fetchFlow(symbol),
    findTodayLatestIntradayDoc(symbol, deps),
    deps.fetchPositions().catch(() => [] as RawPosition[]),
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

  return {
    symbol,
    as_of: now.toISOString(),
    timeframes,
    flow,
    prediction,
    prediction_chart_id: doc?.id ?? null,
    position,
  };
}

export function truncateForPrompt(pack: unknown, maxChars: number): string {
  const json = JSON.stringify(pack);
  return json.length <= maxChars ? json : json.slice(0, maxChars);
}
