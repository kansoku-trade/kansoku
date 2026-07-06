import type { FastifyPluginAsync } from "fastify";
import type { ChartMeta, IntradayPrediction, OverviewRecap, RawBar, RecapSettlementRow } from "../../../shared/types.js";
import { BASE_URL } from "../env.js";
import { ClientError } from "../errors.js";
import { listComments } from "../ai/comments.js";
import { listUsage, summarizeUsage } from "../ai/usageStore.js";
import { buildOverviewBoard, latestPerSymbol } from "../services/cockpit/board.js";
import { judgeOutcome } from "../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome } from "../services/cockpit/outcomeCache.js";
import { aggregateStats, type StatsRow } from "../services/cockpit/stats.js";
import { getProvider } from "../services/marketdata/registry.js";
import { classifySession, easternDate } from "../services/session.js";
import { predictionStale } from "../services/staleness.js";
import { listCharts, loadChart } from "../services/store.js";
import { normalizeQuote } from "../realtime/quotes.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOME_BARS = 300;
const RECAP_TTL_MS = 60_000;

function chartUrl(id: string): string {
  return `${BASE_URL}/charts/${encodeURIComponent(id)}`;
}

export const overviewRoute: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const data = await buildOverviewBoard(chartUrl);
    return { ok: true, data };
  });

  async function buildRecap(today: string): Promise<OverviewRecap> {
    const metas = (await listCharts({ type: "intraday" })).filter(
      (m) => easternDate(new Date(m.created_at)) === today,
    );
    const bySymbol = latestPerSymbol(metas);
    const symbols = [...bySymbol.keys()];
    const usage = summarizeUsage(today, await listUsage(today));
    if (!symbols.length) {
      return { date: today, settlements: [], alerts: [], usage };
    }

    const nowMs = Date.now();
    const latestMetas = [...bySymbol.values()];
    const [quotesRes, docs, commentsList, cached] = await Promise.all([
      getProvider()
        .getQuotes(symbols)
        .catch(() => []),
      Promise.all(latestMetas.map((m) => loadChart(m.id))),
      Promise.all(symbols.map((s) => listComments(s, today))),
      getResolvedOutcomes(latestMetas.map((m) => m.id)),
    ]);
    const quoteBySymbol = new Map(
      quotesRes.map((q) => {
        const cell = normalizeQuote(q, nowMs);
        return [cell.symbol, cell] as const;
      }),
    );

    const settlements: RecapSettlementRow[] = await Promise.all(
      latestMetas.map(async (meta, i) => {
        const doc = docs[i];
        const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
        const direction = prediction?.direction ?? null;
        const anchor = prediction?.anchor ? { time: prediction.anchor.time, price: prediction.anchor.price } : null;
        const plan =
          doc && doc.built.kind === "intraday" && doc.built.entryPlan
            ? { stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
            : null;
        let outcome = cached.get(meta.id) ?? null;
        if (!outcome && direction && anchor) {
          const bars = await getProvider()
            .getKline(meta.symbol!, "15m", OUTCOME_BARS)
            .catch(() => null);
          outcome = bars ? judgeOutcome(direction, anchor, plan, bars) : null;
          if (outcome && outcome.status !== "open") {
            void saveResolvedOutcome({ chartId: meta.id, symbol: meta.symbol!, direction }, outcome).catch(() => {});
          }
        }
        const quote = quoteBySymbol.get(meta.symbol!) ?? null;
        return {
          symbol: meta.symbol!,
          chart_id: meta.id,
          direction,
          day_pct: quote?.regularPct ?? quote?.pct ?? null,
          outcome,
        };
      }),
    );

    const alerts = commentsList
      .flat()
      .filter((c) => c.level === "alert")
      .sort((a, b) => (a.ts < b.ts ? -1 : 1))
      .map((c) => ({ ts: c.ts, symbol: c.symbol, level: c.level, text: c.text }));

    return { date: today, settlements, alerts, usage };
  }

  let recapCache: { at: number; data: OverviewRecap } | null = null;
  let recapInflight: Promise<OverviewRecap> | null = null;

  app.get("/recap", async () => {
    const today = easternDate();
    const usable = recapCache && recapCache.data.date === today ? recapCache : null;
    if (usable && Date.now() - usable.at < RECAP_TTL_MS) {
      return { ok: true, data: usable.data };
    }
    if (!recapInflight) {
      recapInflight = buildRecap(today)
        .then((data) => {
          recapCache = { at: Date.now(), data };
          return data;
        })
        .finally(() => {
          recapInflight = null;
        });
    }
    if (usable) {
      void recapInflight.catch(() => {});
      return { ok: true, data: usable.data };
    }
    return { ok: true, data: await recapInflight };
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
