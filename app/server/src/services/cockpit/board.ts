import type {
  ChartDoc,
  ChartMeta,
  CockpitComment,
  IntradayPrediction,
  OverviewBoard,
  OverviewRow,
} from "../../../../shared/types.js";
import { listComments } from "../../ai/comments.js";
import { getProvider } from "../marketdata/registry.js";
import { classifySession, easternDate } from "../session.js";
import { predictionStale } from "../staleness.js";
import { listCharts, loadChart } from "../store.js";
import { normalizeQuote } from "../../realtime/quotes.js";

function distancePct(level: number | null | undefined, last: number | null): number | null {
  if (level == null || last == null || !Number.isFinite(last) || last <= 0) return null;
  return (level / last - 1) * 100;
}

export function latestPerSymbol(metas: ChartMeta[]): Map<string, ChartMeta> {
  const bySymbol = new Map<string, ChartMeta>();
  for (const meta of metas) {
    if (meta.symbol && !bySymbol.has(meta.symbol)) bySymbol.set(meta.symbol, meta);
  }
  return bySymbol;
}

export function boardRow(
  meta: ChartMeta,
  doc: ChartDoc | null,
  quote: { last: number; pct: number; session: string } | null,
  comments: CockpitComment[],
  chartUrl: (id: string) => string,
): OverviewRow {
  const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
  const plan = doc && doc.built.kind === "intraday" ? doc.built.entryPlan : null;
  const last = quote?.last ?? null;
  const latest = comments.length ? comments[comments.length - 1] : null;
  return {
    symbol: meta.symbol!,
    chart_id: meta.id,
    url: chartUrl(meta.id),
    title: meta.title,
    direction: prediction?.direction ?? null,
    last,
    pct: quote?.pct ?? null,
    session: quote?.session ?? null,
    entry: plan?.entry ?? null,
    stop: plan?.stop ?? null,
    target1: plan?.target1 ?? null,
    stop_distance_pct: distancePct(plan?.stop, last),
    target1_distance_pct: distancePct(plan?.target1, last),
    prediction_stale: doc ? predictionStale(doc, new Date()) : false,
    latest_comment: latest ? { ts: latest.ts, level: latest.level, text: latest.text } : null,
    alert_count: comments.reduce((n, c) => (c.level === "alert" ? n + 1 : n), 0),
  };
}

export async function buildOverviewBoard(chartUrl: (id: string) => string): Promise<OverviewBoard> {
  const today = easternDate();
  const metas = (await listCharts({ type: "intraday" })).filter(
    (m) => easternDate(new Date(m.created_at)) === today,
  );
  const session = classifySession(Math.floor(Date.now() / 1000));
  const bySymbol = latestPerSymbol(metas);
  const symbols = [...bySymbol.keys()];
  if (!symbols.length) {
    return { date: today, session, rows: [] };
  }

  const nowMs = Date.now();
  const [quotesRes, docs, commentsList] = await Promise.all([
    getProvider()
      .getQuotes(symbols)
      .catch(() => []),
    Promise.all([...bySymbol.values()].map((m) => loadChart(m.id))),
    Promise.all(symbols.map((s) => listComments(s, today))),
  ]);
  const quoteBySymbol = new Map(
    quotesRes.map((q) => {
      const cell = normalizeQuote(q, nowMs);
      return [cell.symbol, cell] as const;
    }),
  );

  const rows = [...bySymbol.values()].map((meta, i) =>
    boardRow(meta, docs[i], quoteBySymbol.get(meta.symbol!) ?? null, commentsList[i], chartUrl),
  );
  return { date: today, session, rows };
}
