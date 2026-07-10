import { Controller, Get, Query } from "@tsuki-hono/common";
import type { IntradayPrediction, OverviewRecap, RawBar, RecapSettlementRow } from "../../../../shared/types.js";
import { listAllCommentDates, listComments } from "../../ai/comments.js";
import { listUsage, listUsageDates, summarizeUsage } from "../../ai/usageStore.js";
import { chartUrl } from "../../chartUrl.js";
import { ClientError } from "../../errors.js";
import { normalizeQuote } from "../../realtime/quotes.js";
import { buildOverviewBoard, latestPerSymbol } from "../../services/cockpit/board.js";
import { attachRMultiple, judgeOutcome, zoneFromPrediction } from "../../services/cockpit/outcome.js";
import { getResolvedOutcomes, saveResolvedOutcome } from "../../services/cockpit/outcomeCache.js";
import { aggregateStats, type StatsRow } from "../../services/cockpit/stats.js";
import { getProvider } from "../../services/marketdata/registry.js";
import { easternDate } from "../../services/session.js";
import { listCharts, loadChart } from "../../services/store.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOME_BARS = 300;
const DAILY_BARS = 30;
const RECAP_TTL_MS = 60_000;
const RECAP_HISTORICAL_TTL_MS = 60 * 60_000;
const RECAP_CACHE_MAX = 10;
const RECAP_DATES_LIMIT = 30;

let recapCache = new Map<string, { at: number; data: OverviewRecap }>();
let recapInflight = new Map<string, Promise<OverviewRecap>>();

export function resetOverviewCacheForTests(): void {
  recapCache = new Map();
  recapInflight = new Map();
}

function cacheRecap(date: string, data: OverviewRecap): void {
  recapCache.delete(date);
  recapCache.set(date, { at: Date.now(), data });
  while (recapCache.size > RECAP_CACHE_MAX) {
    const oldestKey = recapCache.keys().next().value;
    if (oldestKey === undefined) break;
    recapCache.delete(oldestKey);
  }
}

async function computeHistoricalDayPct(symbol: string, date: string): Promise<number | null> {
  const bars = await getProvider()
    .getKline(symbol, "day", DAILY_BARS)
    .catch(() => null);
  if (!bars) return null;
  const idx = bars.findIndex((bar) => easternDate(new Date(bar.time)) === date);
  if (idx <= 0) return null;
  const close = Number(bars[idx].close);
  const prevClose = Number(bars[idx - 1].close);
  if (!Number.isFinite(close) || !Number.isFinite(prevClose) || prevClose === 0) return null;
  return ((close - prevClose) / prevClose) * 100;
}

async function buildRecap(date: string): Promise<OverviewRecap> {
  const isToday = date === easternDate();
  const metas = (await listCharts({ type: "intraday" })).filter((m) => easternDate(new Date(m.created_at)) === date);
  const bySymbol = latestPerSymbol(metas);
  const symbols = [...bySymbol.keys()];
  const usage = summarizeUsage(date, await listUsage(date));
  if (!symbols.length) {
    return { date, settlements: [], alerts: [], usage };
  }

  const nowMs = Date.now();
  const latestMetas = [...bySymbol.values()];
  const [quoteBySymbol, dayPctBySymbol, docs, commentsList, cached] = await Promise.all([
    isToday
      ? getProvider()
          .getQuotes(symbols)
          .then((quotesRes) => {
            const map = new Map<string, ReturnType<typeof normalizeQuote>>();
            for (const q of quotesRes) {
              const cell = normalizeQuote(q, nowMs);
              map.set(cell.symbol, cell);
            }
            return map;
          })
          .catch(() => new Map<string, ReturnType<typeof normalizeQuote>>())
      : Promise.resolve(new Map<string, ReturnType<typeof normalizeQuote>>()),
    isToday
      ? Promise.resolve(new Map<string, number | null>())
      : Promise.all(symbols.map(async (s) => [s, await computeHistoricalDayPct(s, date)] as const)).then(
          (entries) => new Map(entries),
        ),
    Promise.all(latestMetas.map((m) => loadChart(m.id))),
    Promise.all(symbols.map((s) => listComments(s, date))),
    getResolvedOutcomes(latestMetas.map((m) => m.id)),
  ]);

  const settlements: RecapSettlementRow[] = await Promise.all(
    latestMetas.map(async (meta, i) => {
      const doc = docs[i];
      const prediction = (doc?.input.prediction as IntradayPrediction | null | undefined) ?? null;
      const direction = prediction?.direction ?? null;
      const anchor = prediction?.anchor ? { time: prediction.anchor.time, price: prediction.anchor.price } : null;
      const plan =
        doc && doc.built.kind === "intraday" && doc.built.entryPlan
          ? { entry: doc.built.entryPlan.entry, stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
          : null;
      let outcome = attachRMultiple(cached.get(meta.id) ?? null, direction, plan);
      if (!outcome && direction && anchor) {
        const bars = await getProvider()
          .getKline(meta.symbol!, "15m", OUTCOME_BARS)
          .catch(() => null);
        outcome = bars ? judgeOutcome(direction, anchor, plan, bars, zoneFromPrediction(prediction)) : null;
        if (outcome && outcome.status !== "open") {
          void saveResolvedOutcome({ chartId: meta.id, symbol: meta.symbol!, direction }, outcome).catch(() => {});
        }
      }
      const day_pct = isToday
        ? (quoteBySymbol.get(meta.symbol!)?.regularPct ?? quoteBySymbol.get(meta.symbol!)?.pct ?? null)
        : (dayPctBySymbol.get(meta.symbol!) ?? null);
      return {
        symbol: meta.symbol!,
        chart_id: meta.id,
        direction,
        day_pct,
        outcome,
      };
    }),
  );

  const alerts = commentsList
    .flat()
    .filter((c) => c.level === "alert")
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
    .map((c) => ({ ts: c.ts, symbol: c.symbol, level: c.level, text: c.text }));

  return { date, settlements, alerts, usage };
}

@Controller("overview")
export class OverviewController {
  @Get("/")
  async getBoard() {
    const data = await buildOverviewBoard(chartUrl);
    return { ok: true, data };
  }

  @Get("/recap")
  async getRecap(@Query() query: { date?: string }) {
    const date = query.date ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    const isToday = date === easternDate();
    const ttl = isToday ? RECAP_TTL_MS : RECAP_HISTORICAL_TTL_MS;
    const cached = recapCache.get(date) ?? null;
    if (cached && Date.now() - cached.at < ttl) {
      return { ok: true, data: cached.data };
    }
    let inflight = recapInflight.get(date);
    if (!inflight) {
      inflight = buildRecap(date)
        .then((data) => {
          cacheRecap(date, data);
          return data;
        })
        .finally(() => {
          recapInflight.delete(date);
        });
      recapInflight.set(date, inflight);
    }
    if (cached) {
      void inflight.catch(() => {});
      return { ok: true, data: cached.data };
    }
    return { ok: true, data: await inflight };
  }

  @Get("/stats")
  async getStats() {
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
          ? { entry: doc.built.entryPlan.entry, stop: doc.built.entryPlan.stop, target1: doc.built.entryPlan.target1 }
          : null;
      let outcome = attachRMultiple(cached.get(meta.id) ?? null, prediction.direction, plan);
      if (!outcome) {
        const bars = barsBySymbol.get(meta.symbol!) ?? null;
        outcome = anchor && bars ? judgeOutcome(prediction.direction, anchor, plan, bars, zoneFromPrediction(prediction)) : null;
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
  }

  @Get("/usage")
  async getUsage(@Query() query: { date?: string }) {
    const date = query.date ?? easternDate();
    if (!DATE_RE.test(date)) {
      throw new ClientError(`invalid date: ${date}`, "expected YYYY-MM-DD");
    }
    return { ok: true, data: summarizeUsage(date, await listUsage(date)) };
  }

  @Get("/recap-dates")
  async getRecapDates() {
    const [usageDates, commentDates, intradayMetas] = await Promise.all([
      listUsageDates(RECAP_DATES_LIMIT),
      listAllCommentDates(RECAP_DATES_LIMIT),
      listCharts({ type: "intraday" }),
    ]);
    const chartDates = intradayMetas.map((m) => easternDate(new Date(m.created_at)));
    const dates = [...new Set([...usageDates, ...commentDates, ...chartDates])]
      .sort()
      .reverse()
      .slice(0, RECAP_DATES_LIMIT);
    return { ok: true, data: dates };
  }
}
