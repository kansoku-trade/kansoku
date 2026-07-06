import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type { ChartDoc, IntradayPrediction, RawBar, SymbolAnalysisRow } from "../../../shared/types.js";
import { BASE_URL, JOURNAL_DIR, STOCKS_DIR } from "../env.js";
import { ClientError } from "../errors.js";
import { toTs } from "../services/indicators.js";
import { buildBenchmark } from "../services/cockpit/benchmark.js";
import { buildCockpitFlow } from "../services/cockpit/flow.js";
import { judgeOutcome } from "../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome } from "../services/cockpit/outcomeCache.js";
import { buildCockpitPosition } from "../services/cockpit/position.js";
import { entryPlanFromDoc, latestIntradayDoc } from "../services/cockpit/entryPlan.js";
import { computeRelativeVolume } from "../services/relvol.js";
import { getProvider } from "../services/marketdata/registry.js";
import type { RawPosition } from "../services/marketdata/types.js";
import { classifySession, easternDate } from "../services/session.js";
import { listCommentDates, listComments } from "../ai/comments.js";
import { runAnalyst } from "../ai/analyst.js";
import { deepDiveState, startDeepDive } from "../ai/deepDive.js";
import { aiConfig } from "../ai/models.js";
import { predictionStale } from "../services/staleness.js";
import { listCharts, loadChart } from "../services/store.js";
import { normalizeQuote } from "../realtime/quotes.js";

const SYMBOL_RE = /^[A-Z0-9.]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_NAME_RE = /^[A-Z0-9._-]+$/;
const JOURNAL_FILE_RE = /^(\d{4}-\d{2}-\d{2})-([\w-]+)\.md$/;
const JOURNAL_NAME_RE = /^\d{4}-\d{2}-\d{2}-[\w-]+\.md$/;
const BENCHMARK_SYMBOLS = ["SMH.US", "QQQ.US"];

function noteFileName(raw: string): string {
  const name = raw.trim().replace(/\.US$/i, "").toUpperCase();
  if (!NOTE_NAME_RE.test(name) || name.includes("..")) {
    throw new ClientError(`invalid symbol: ${raw}`, "expected a plain ticker like MU or MU.US");
  }
  return name;
}

export function normalizeSymbol(raw: string): string {
  let sym = raw.trim().toUpperCase();
  if (!sym.includes(".")) sym += ".US";
  if (!SYMBOL_RE.test(sym)) {
    throw new ClientError(`invalid symbol: ${raw}`, "e.g. MU or MU.US");
  }
  return sym;
}

function chartUrl(id: string): string {
  return `${BASE_URL}/charts/${encodeURIComponent(id)}`;
}

type Params = { sym: string };

export const symbolsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Params: Params }>("/:sym/flow", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const provider = getProvider();
    if (!provider.getFlow) return { ok: true, data: null };
    const [flowRes, distRes] = await Promise.allSettled([
      provider.getFlow(sym),
      provider.getCapitalDistribution?.(sym) ?? Promise.resolve(null),
    ]);
    if (flowRes.status === "rejected") throw flowRes.reason;
    const dist = distRes.status === "fulfilled" ? distRes.value : null;
    return { ok: true, data: buildCockpitFlow(flowRes.value, dist) };
  });

  app.get<{ Params: Params }>("/:sym/benchmark", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const symbols = [sym, ...BENCHMARK_SYMBOLS.filter((s) => s !== sym)];
    const barsList = await Promise.all(symbols.map((s) => getProvider().getKline(s, "5m", 100)));
    const regularBars = barsList.map((bars) => bars.filter((b) => classifySession(toTs(b.time)) === "regular"));
    const data = buildBenchmark(symbols.map((s, i) => ({ symbol: s, bars: regularBars[i] })));
    return { ok: true, data };
  });

  app.get<{ Params: Params }>("/:sym/position", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const provider = getProvider();
    const [positions, quotes] = await Promise.all([
      provider.getPositions?.() ?? Promise.resolve([] as RawPosition[]),
      provider.getQuotes([sym]),
    ]);
    if (quotes.length === 0) {
      throw new ClientError(`no quote data for ${sym}`, undefined, 502);
    }
    const quote = normalizeQuote(quotes[0], Date.now());
    const plan = entryPlanFromDoc(await latestIntradayDoc(sym));
    const data = buildCockpitPosition(positions, sym, quote.last, plan);
    return { ok: true, data };
  });

  app.get<{ Params: Params }>("/:sym/analyses", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const metas = await listCharts({ symbol: sym, type: "intraday" });
    const docs = await Promise.all(metas.map((m) => loadChart(m.id)));
    const cached = await getResolvedOutcomes(metas.map((m) => m.id));
    let bars: RawBar[] | null = null;
    if (metas.some((m) => !cached.has(m.id))) {
      try {
        bars = await getProvider().getKline(sym, "15m", 300);
      } catch {
        bars = null;
      }
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
      let outcome = cached.get(meta.id) ?? null;
      if (!outcome && direction && anchor && bars) {
        outcome = judgeOutcome(direction, anchor, plan, bars);
        if (outcome && outcome.status !== "open") {
          void saveResolvedOutcome({ chartId: meta.id, symbol: sym, direction }, outcome).catch(() => {});
        }
      }
      return { ...meta, url: chartUrl(meta.id), direction, anchor, outcome };
    });
    return { ok: true, data: rows };
  });

  app.get<{ Params: Params }>("/:sym/relvol", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const bars = await getProvider().getKline(sym, "15m", 500);
    return { ok: true, data: computeRelativeVolume(bars) };
  });

  app.get<{ Params: Params; Querystring: { date?: string } }>("/:sym/comments", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const date = req.query.date ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    return { ok: true, data: await listComments(sym, date) };
  });

  app.get<{ Params: Params }>("/:sym/comment-dates", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    return { ok: true, data: await listCommentDates(sym) };
  });

  app.get<{ Params: Params }>("/:sym/journal", async (req) => {
    const bare = normalizeSymbol(req.params.sym).replace(/\.US$/, "").toLowerCase();
    let files: string[];
    try {
      files = await fs.readdir(JOURNAL_DIR);
    } catch {
      return { ok: true, data: [] };
    }
    const rows: { name: string; date: string }[] = [];
    for (const f of files) {
      const m = JOURNAL_FILE_RE.exec(f);
      if (!m) continue;
      const rest = m[2].toLowerCase();
      if (rest !== bare && !rest.startsWith(`${bare}-`)) continue;
      rows.push({ name: f, date: m[1] });
    }
    rows.sort((a, b) => (a.name < b.name ? 1 : -1));
    return { ok: true, data: rows };
  });

  app.get<{ Params: Params & { name: string } }>("/:sym/journal/:name", async (req) => {
    const name = req.params.name;
    if (!JOURNAL_NAME_RE.test(name)) {
      throw new ClientError(`invalid journal name: ${name}`, "expected YYYY-MM-DD-<slug>.md");
    }
    const path = join(JOURNAL_DIR, name);
    try {
      const [markdown, stat] = await Promise.all([fs.readFile(path, "utf8"), fs.stat(path)]);
      return { ok: true, data: { name, markdown, mtime: stat.mtime.toISOString() } };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ClientError(`journal not found: ${name}`, undefined, 404);
      }
      throw err;
    }
  });

  app.post<{ Params: Params }>("/:sym/reassess", async (req) => {
    const sym = normalizeSymbol(req.params.sym);
    const model = aiConfig().analystModel;
    if (!model) return { ok: true, data: { started: false, reason: "analyst layer disabled" } };
    const result = runAnalyst({ symbol: sym, origin: "manual", deps: { model } });
    void result.done?.catch(() => {});
    return { ok: true, data: { started: result.started, ...(result.reason ? { reason: result.reason } : {}) } };
  });

  app.get<{ Params: Params }>("/:sym/note", async (req) => {
    const name = noteFileName(req.params.sym);
    const path = join(STOCKS_DIR, `${name}.md`);
    try {
      const [markdown, stat] = await Promise.all([fs.readFile(path, "utf8"), fs.stat(path)]);
      return { markdown, mtime: stat.mtime.toISOString() };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { markdown: null };
      throw err;
    }
  });

  app.post<{ Params: Params }>("/:sym/deep-dive", async (req, reply) => {
    const name = noteFileName(req.params.sym);
    const result = startDeepDive(name);
    if (result.started) return reply.status(202).send({ ok: true });
    if (result.reason === "busy") {
      throw new ClientError(`deep dive already running`, "wait for the current run to finish", 409);
    }
    throw new ClientError(`deep dive disabled`, "set AI_DEEPDIVE_MODEL to a valid provider/id", 503);
  });

  app.get<{ Params: Params }>("/:sym/deep-dive/status", async () => deepDiveState());

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
