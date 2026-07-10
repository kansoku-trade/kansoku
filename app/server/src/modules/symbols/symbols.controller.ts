import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Controller, ContextParam, Get, Param, Post, Query } from "@tsuki-hono/common";
import type { Context } from "hono";
import type { IntradayPrediction, RawBar, SymbolAnalysisRow } from "../../../../shared/types.js";
import { runAnalyst } from "../../ai/analyst.js";
import { listCommentDates, listComments } from "../../ai/comments.js";
import { deepDiveState, startDeepDive } from "../../ai/deepDive.js";
import { aiConfig } from "../../ai/models.js";
import { chartUrl } from "../../chartUrl.js";
import { JOURNAL_DIR, STOCKS_DIR } from "../../env.js";
import { ClientError } from "../../errors.js";
import { normalizeQuote } from "../../realtime/quotes.js";
import { buildBenchmark } from "../../services/cockpit/benchmark.js";
import { entryPlanFromDoc, latestIntradayDoc } from "../../services/cockpit/entryPlan.js";
import { buildCockpitFlow } from "../../services/cockpit/flow.js";
import { attachRMultiple, judgeOutcome, zoneFromPrediction } from "../../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome } from "../../services/cockpit/outcomeCache.js";
import { buildCockpitPosition } from "../../services/cockpit/position.js";
import { toTs } from "../../services/indicators.js";
import { getProvider } from "../../services/marketdata/registry.js";
import type { RawPosition } from "../../services/marketdata/types.js";
import { computeRelativeVolume } from "../../services/relvol.js";
import { classifySession, easternDate } from "../../services/session.js";
import { predictionStale } from "../../services/staleness.js";
import { listCharts, loadChart } from "../../services/store.js";
import { noteFileName, normalizeSymbol } from "../../services/symbol.utils.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JOURNAL_FILE_RE = /^(\d{4}-\d{2}-\d{2})-([\w-]+)\.md$/;
const JOURNAL_NAME_RE = /^\d{4}-\d{2}-\d{2}-[\w-]+\.md$/;
const BENCHMARK_SYMBOLS = ["SMH.US", "QQQ.US"];

@Controller("symbols")
export class SymbolsController {
  @Get("/:sym/flow")
  async getFlow(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    const provider = getProvider();
    if (!provider.getFlow) return { ok: true, data: null };
    const [flowRes, distRes] = await Promise.allSettled([
      provider.getFlow(sym),
      provider.getCapitalDistribution?.(sym) ?? Promise.resolve(null),
    ]);
    if (flowRes.status === "rejected") throw flowRes.reason;
    const dist = distRes.status === "fulfilled" ? distRes.value : null;
    return { ok: true, data: buildCockpitFlow(flowRes.value, dist) };
  }

  @Get("/:sym/benchmark")
  async getBenchmark(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    const symbols = [sym, ...BENCHMARK_SYMBOLS.filter((s) => s !== sym)];
    const barsList = await Promise.all(symbols.map((s) => getProvider().getKline(s, "5m", 100)));
    const regularBars = barsList.map((bars) => bars.filter((b) => classifySession(toTs(b.time)) === "regular"));
    const data = buildBenchmark(symbols.map((s, i) => ({ symbol: s, bars: regularBars[i] })));
    return { ok: true, data };
  }

  @Get("/:sym/position")
  async getPosition(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
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
  }

  @Get("/:sym/analyses")
  async getAnalyses(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
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
          ? { entry: doc.built.entryPlan.entry, stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
          : null;
      let outcome = attachRMultiple(cached.get(meta.id) ?? null, direction, plan);
      if (!outcome && direction && anchor && bars) {
        outcome = judgeOutcome(direction, anchor, plan, bars, zoneFromPrediction(prediction));
        if (outcome && outcome.status !== "open") {
          void saveResolvedOutcome({ chartId: meta.id, symbol: sym, direction }, outcome).catch(() => {});
        }
      }
      return { ...meta, url: chartUrl(meta), direction, anchor, outcome };
    });
    return { ok: true, data: rows };
  }

  @Get("/:sym/relvol")
  async getRelvol(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    const bars = await getProvider().getKline(sym, "15m", 500);
    return { ok: true, data: computeRelativeVolume(bars) };
  }

  @Get("/:sym/comments")
  async getComments(@Param("sym") symParam: string, @Query("date") dateParam: string | undefined) {
    const sym = normalizeSymbol(symParam);
    const date = dateParam ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    return { ok: true, data: await listComments(sym, date) };
  }

  @Get("/:sym/comment-dates")
  async getCommentDates(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    return { ok: true, data: await listCommentDates(sym) };
  }

  @Get("/:sym/journal")
  async getJournal(@Param("sym") symParam: string) {
    const bare = normalizeSymbol(symParam).replace(/\.US$/, "").toLowerCase();
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
  }

  @Get("/:sym/journal/:name")
  async getJournalEntry(@Param("name") name: string) {
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
  }

  @Post("/:sym/reassess")
  async reassess(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    const model = aiConfig().analystModel;
    if (!model) return { ok: true, data: { started: false, reason: "analyst layer disabled" } };
    const result = runAnalyst({ symbol: sym, origin: "manual", deps: { model } });
    void result.done?.catch(() => {});
    return { ok: true, data: { started: result.started, ...(result.reason ? { reason: result.reason } : {}) } };
  }

  @Get("/:sym/note")
  async getNote(@Param("sym") symParam: string) {
    const name = noteFileName(symParam);
    const path = join(STOCKS_DIR, `${name}.md`);
    try {
      const [markdown, stat] = await Promise.all([fs.readFile(path, "utf8"), fs.stat(path)]);
      return { markdown, mtime: stat.mtime.toISOString() };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { markdown: null };
      throw err;
    }
  }

  @Post("/:sym/deep-dive")
  async postDeepDive(@Param("sym") symParam: string, @ContextParam() ctx: Context) {
    const name = noteFileName(symParam);
    const result = startDeepDive(name);
    if (result.started) return ctx.json({ ok: true }, 202);
    if (result.reason === "busy") {
      throw new ClientError(`deep dive already running`, "wait for the current run to finish", 409);
    }
    throw new ClientError(`deep dive disabled`, "未配置深度研究模型，请在 /settings 配置", 503);
  }

  @Get("/:sym/deep-dive/status")
  async getDeepDiveStatus() {
    return deepDiveState();
  }

  @Get("/:sym/latest")
  async getLatest(@Param("sym") symParam: string) {
    const sym = normalizeSymbol(symParam);
    const doc = await latestIntradayDoc(sym);
    if (!doc) {
      throw new ClientError(`no intraday analysis for ${sym}`, "run intraday-signal for this symbol first", 404);
    }
    return {
      ok: true,
      data: { ...doc, url: chartUrl(doc), prediction_stale: predictionStale(doc, new Date()) },
    };
  }
}
