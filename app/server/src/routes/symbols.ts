import type { FastifyPluginAsync } from "fastify";
import type { ChartDoc, IntradayPrediction, RawBar, SymbolAnalysisRow } from "../../../shared/types.js";
import { BASE_URL } from "../env.js";
import { ClientError } from "../errors.js";
import { toTs } from "../services/indicators.js";
import { buildBenchmark } from "../services/cockpit/benchmark.js";
import { buildCockpitFlow } from "../services/cockpit/flow.js";
import { judgeOutcome } from "../services/cockpit/outcome.js";
import { buildCockpitPosition } from "../services/cockpit/position.js";
import {
  fetchCapitalDistribution,
  fetchFlow,
  fetchKline,
  fetchPositions,
  longbridgeJson,
} from "../services/longbridge.js";
import { classifySession, easternDate } from "../services/session.js";
import { listComments } from "../ai/comments.js";
import { predictionStale } from "../services/staleness.js";
import { listCharts, loadChart } from "../services/store.js";
import { normalizeQuote, type RawQuote } from "../realtime/quotes.js";

const SYMBOL_RE = /^[A-Z0-9.]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BENCHMARK_SYMBOLS = ["SMH.US", "QQQ.US"];

export function normalizeSymbol(raw: string): string {
  let sym = raw.trim().toUpperCase();
  if (!sym.includes(".")) sym += ".US";
  if (!SYMBOL_RE.test(sym)) {
    throw new ClientError(`invalid symbol: ${raw}`, "e.g. MU or MU.US");
  }
  return sym;
}

function chartUrl(id: string): string {
  return `${BASE_URL}/#/charts/${encodeURIComponent(id)}`;
}

async function latestIntradayDoc(sym: string): Promise<ChartDoc | null> {
  const metas = await listCharts({ symbol: sym, type: "intraday", limit: 1 });
  if (!metas.length) return null;
  return loadChart(metas[0].id);
}

type Params = { sym: string };

export const symbolsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: Params }>("/:sym/flow", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const [flowRes, distRes] = await Promise.allSettled([fetchFlow(sym), fetchCapitalDistribution(sym)]);
    if (flowRes.status === "rejected") throw flowRes.reason;
    const dist = distRes.status === "fulfilled" ? distRes.value : null;
    return { ok: true, data: buildCockpitFlow(flowRes.value, dist) };
  });

  app.get<{ Params: Params }>("/:sym/benchmark", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const symbols = [sym, ...BENCHMARK_SYMBOLS.filter((s) => s !== sym)];
    const barsList = await Promise.all(symbols.map((s) => fetchKline(s, "5m", 100)));
    const regularBars = barsList.map((bars) => bars.filter((b) => classifySession(toTs(b.time)) === "regular"));
    const data = buildBenchmark(symbols.map((s, i) => ({ symbol: s, bars: regularBars[i] })));
    return { ok: true, data };
  });

  app.get<{ Params: Params }>("/:sym/position", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const [positions, quotes] = await Promise.all([fetchPositions(), longbridgeJson<RawQuote[]>(["quote", sym])]);
    if (quotes.length === 0) {
      throw new ClientError(`no quote data for ${sym}`, undefined, 502);
    }
    const quote = normalizeQuote(quotes[0], Date.now());
    const doc = await latestIntradayDoc(sym);
    const plan =
      doc && doc.built.kind === "intraday" && doc.built.entryPlan
        ? { stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1, target2: doc.built.entryPlan.target2 }
        : null;
    const data = buildCockpitPosition(positions, sym, quote.last, plan);
    return { ok: true, data };
  });

  app.get<{ Params: Params }>("/:sym/analyses", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const metas = await listCharts({ symbol: sym, type: "intraday" });
    const docs = await Promise.all(metas.map((m) => loadChart(m.id)));
    let bars: RawBar[] | null = null;
    try {
      bars = await fetchKline(sym, "15m", 300);
    } catch {
      bars = null;
    }
    const rows: SymbolAnalysisRow[] = metas.map((meta, i) => {
      const doc = docs[i];
      const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
      const direction = prediction?.direction ?? null;
      const anchor = prediction?.anchor ? { time: prediction.anchor.time, price: prediction.anchor.price } : null;
      const plan =
        doc && doc.built.kind === "intraday" && doc.built.entryPlan
          ? { stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
          : null;
      const outcome = direction && anchor && bars ? judgeOutcome(direction, anchor, plan, bars) : null;
      return { ...meta, url: chartUrl(meta.id), direction, anchor, outcome };
    });
    return { ok: true, data: rows };
  });

  app.get<{ Params: Params; Querystring: { date?: string } }>("/:sym/comments", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const date = req.query.date ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    return { ok: true, data: await listComments(sym, date) };
  });

  app.get<{ Params: Params }>("/:sym/latest", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const doc = await latestIntradayDoc(sym);
    if (!doc) {
      throw new ClientError(`no intraday analysis for ${sym}`, "run intraday-signal for this symbol first", 404);
    }
    return {
      ok: true,
      data: { ...doc, url: chartUrl(doc.id), prediction_stale: predictionStale(doc, new Date()) },
    };
  });
};
