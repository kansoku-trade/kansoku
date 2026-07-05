import type { FastifyPluginAsync } from "fastify";
import type {
  ChartDoc,
  ChartMeta,
  CockpitComment,
  IntradayPrediction,
  OverviewBoard,
  OverviewRow,
  RawBar,
} from "../../../shared/types.js";
import { BASE_URL } from "../env.js";
import { ClientError } from "../errors.js";
import { listComments } from "../ai/comments.js";
import { listUsage, summarizeUsage } from "../ai/usageStore.js";
import { judgeOutcome } from "../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome } from "../services/cockpit/outcomeCache.js";
import { aggregateStats, type StatsRow } from "../services/cockpit/stats.js";
import { getProvider } from "../services/marketdata/registry.js";
import { easternDate } from "../services/session.js";
import { predictionStale } from "../services/staleness.js";
import { listCharts, loadChart } from "../services/store.js";
import { normalizeQuote } from "../realtime/quotes.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOME_BARS = 300;

function chartUrl(id: string): string {
  return `${BASE_URL}/#/charts/${encodeURIComponent(id)}`;
}

function latestPerSymbol(metas: ChartMeta[]): Map<string, ChartMeta> {
  const bySymbol = new Map<string, ChartMeta>();
  for (const meta of metas) {
    if (meta.symbol && !bySymbol.has(meta.symbol)) bySymbol.set(meta.symbol, meta);
  }
  return bySymbol;
}

function distancePct(level: number | null | undefined, last: number | null): number | null {
  if (level == null || last == null || !Number.isFinite(last) || last <= 0) return null;
  return (level / last - 1) * 100;
}

function boardRow(
  meta: ChartMeta,
  doc: ChartDoc | null,
  quote: { last: number; pct: number; session: string } | null,
  comments: CockpitComment[],
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

export const overviewRoute: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const today = easternDate();
    const metas = (await listCharts({ type: "intraday" })).filter(
      (m) => easternDate(new Date(m.created_at)) === today,
    );
    const bySymbol = latestPerSymbol(metas);
    const symbols = [...bySymbol.keys()];
    if (!symbols.length) {
      return { ok: true, data: { date: today, rows: [] } satisfies OverviewBoard };
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
      boardRow(meta, docs[i], quoteBySymbol.get(meta.symbol!) ?? null, commentsList[i]),
    );
    return { ok: true, data: { date: today, rows } satisfies OverviewBoard };
  });

  app.get("/stats", async () => {
    const metas = (await listCharts({ type: "intraday" })).filter((m) => m.symbol);
    const docs = await Promise.all(metas.map((m) => loadChart(m.id)));
    const cached = await getResolvedOutcomes(metas.map((m) => m.id));

    const symbolsNeedingBars = [...new Set(metas.filter((m) => !cached.has(m.id)).map((m) => m.symbol!))];
    const barsBySymbol = new Map<string, RawBar[] | null>();
    await Promise.all(
      symbolsNeedingBars.map(async (symbol) => {
        const bars = await getProvider()
          .getKline(symbol, "15m", OUTCOME_BARS)
          .catch(() => null);
        barsBySymbol.set(symbol, bars);
      }),
    );

    const rows: StatsRow[] = [];
    metas.forEach((meta, i) => {
      const doc = docs[i];
      const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
      if (!prediction?.direction) return;
      const anchor = prediction.anchor ? { time: prediction.anchor.time, price: prediction.anchor.price } : null;
      const plan =
        doc && doc.built.kind === "intraday" && doc.built.entryPlan
          ? { stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
          : null;
      let outcome = cached.get(meta.id) ?? null;
      if (!outcome) {
        const bars = barsBySymbol.get(meta.symbol!) ?? null;
        outcome = anchor && bars ? judgeOutcome(prediction.direction, anchor, plan, bars) : null;
        if (outcome && outcome.status !== "open") {
          void saveResolvedOutcome(
            { chartId: meta.id, symbol: meta.symbol!, direction: prediction.direction },
            outcome,
          ).catch(() => {});
        }
      }
      rows.push({
        direction: prediction.direction,
        origin: doc?.input.origin === "analyst" ? "analyst" : "manual",
        outcome,
      });
    });

    return { ok: true, data: aggregateStats(rows) };
  });

  app.get<{ Querystring: { date?: string } }>("/usage", async (req) => {
    const date = req.query.date ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    return { ok: true, data: summarizeUsage(date, await listUsage(date)) };
  });
};
