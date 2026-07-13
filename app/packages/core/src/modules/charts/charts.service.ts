import type { ChartDoc, IntradayPrediction, RawBar, TimeframeKey } from "../../../../../shared/types.js";
import { chartUrl } from "../../chartUrl.js";
import type { ChartsApi } from "../../contract/charts.js";
import { ClientError } from "../../errors.js";
import { mergeFreshBars } from "../../realtime/candleMerge.js";
import { ALL_TYPES, buildChart, mergeForPatch, rebuild, refreshBody } from "../../services/build.js";
import { clampViewCount } from "../../services/history.js";
import { TIMEFRAME_ORDER } from "../../services/intraday.js";
import { validatePrediction } from "../../services/predictionRules.js";
import { predictionStale } from "../../services/staleness.js";
import { createChart, deleteChart, listCharts, loadChart, saveChart } from "../../services/store.js";
import { localizeChartDocName } from "../../services/securityName.js";

function assertPredictionValid(prediction: unknown): void {
  if (prediction == null) return;
  const issues = validatePrediction(prediction as IntradayPrediction);
  if (issues.length) {
    throw new ClientError(`预测未通过校验：${issues.join("；")}`, undefined, 400);
  }
}

export const chartsService: ChartsApi = {
  async list(input = {}) {
    const type = input.type
      ? input.type
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const metas = await listCharts({ type, symbol: input.symbol, limit: input.limit });
    const now = new Date();
    const withStale = await Promise.all(
      metas.map(async (m) => {
        const doc = m.type === "intraday" ? await loadChart(m.id) : null;
        const stale = doc ? predictionStale(doc, now) : false;
        return { ...m, url: chartUrl(m), prediction_stale: stale };
      }),
    );
    return input.stale ? withStale.filter((m) => m.prediction_stale) : withStale;
  },

  async get(input) {
    const doc = await loadChart(input.id);
    if (!doc) throw new ClientError(`chart not found: ${input.id}`, "GET /api/charts lists available ids", 404);
    const localized = await localizeChartDocName(doc);
    return { ...localized, prediction_stale: predictionStale(localized, new Date()) };
  },

  async create(input) {
    if (input.type === "intraday" && input.prediction != null) {
      assertPredictionValid(input.prediction);
    }
    const result = await buildChart(input);
    const doc = await createChart(result);
    return {
      data: { id: doc.id, url: chartUrl(doc), type: doc.type, title: doc.title, symbol: doc.symbol, ...result.meta },
      meta: { chart_type: doc.type },
    };
  },

  async built(input) {
    const doc = await loadChart(input.id);
    if (!doc) throw new ClientError(`chart not found: ${input.id}`, "GET /api/charts lists available ids", 404);
    if (doc.type !== "intraday") {
      throw new ClientError(`history view only supports intraday charts, got: ${doc.type}`, undefined, 400);
    }
    const count = clampViewCount(input.count === undefined ? undefined : String(input.count));
    if (count === null) throw new ClientError("`count` must be a positive integer", "e.g. ?count=300", 400);
    const body = refreshBody(doc.type, doc.input);
    if (!body) throw new ClientError("chart has no symbol to refetch", undefined, 400);
    const result = await buildChart({ ...body, count, title: doc.title });
    // Forward mode (historical chart "load subsequent bars"): keep the frozen
    // analysis snapshot pinned and graft on only bars newer than its tail, so the
    // original candles survive the full refetch. Transient view — NOT written
    // back, so reopening shows the frozen snapshot again. Any gap (the latest-N
    // window doesn't reach the snapshot tail) is a longbridge limitation: candles
    // fetch latest-N only, with no time-range parameter.
    if (input.mode === "forward") {
      const frozen = (doc.input.timeframes ?? {}) as Partial<Record<TimeframeKey, RawBar[]>>;
      const fresh = (result.input.timeframes ?? {}) as Partial<Record<TimeframeKey, RawBar[]>>;
      const merged: Partial<Record<TimeframeKey, RawBar[]>> = {};
      for (const tf of TIMEFRAME_ORDER) merged[tf] = mergeFreshBars(frozen[tf] ?? [], fresh[tf] ?? []);
      const lastM5 = merged.m5?.[merged.m5.length - 1];
      const rebuilt = rebuild(
        "intraday",
        {
          ...doc.input,
          timeframes: merged,
          as_of: lastM5?.time ?? doc.input.as_of,
          options_levels: result.input.options_levels,
          event_risk: result.input.event_risk,
        },
        doc.title,
      );
      const mergedCount = Math.max(...TIMEFRAME_ORDER.map((tf) => merged[tf]?.length ?? 0), 0);
      return { built: rebuilt.built, count: mergedCount };
    }
    return { built: result.built, count };
  },

  async update(input) {
    const { id, ...parsed } = input;
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    if (!ALL_TYPES.includes(doc.type)) {
      throw new ClientError(
        `chart type '${doc.type}' is no longer supported`,
        "legacy charts are read-only; create an intraday chart instead",
        400,
      );
    }
    if (doc.type === "intraday" && "prediction" in parsed && parsed.prediction != null) {
      assertPredictionValid(parsed.prediction);
    }
    const merged = mergeForPatch(doc.type, doc.input, parsed);
    const title = typeof parsed.title === "string" && parsed.title ? parsed.title : doc.title;
    const refreshable = parsed.refresh === true ? refreshBody(doc.type, merged) : null;
    const result = refreshable ? await buildChart({ ...refreshable, title }) : rebuild(doc.type, merged, title);
    const updated: ChartDoc = {
      ...doc,
      title: result.title,
      input: result.input,
      built: result.built,
      updated_at: new Date().toISOString(),
      ...("prediction" in parsed ? { prediction_updated_at: new Date().toISOString() } : {}),
    };
    await saveChart(updated);
    return {
      data: {
        id,
        url: chartUrl({ id, type: doc.type, symbol: result.symbol, created_at: doc.created_at }),
        type: doc.type,
        title: result.title,
        symbol: result.symbol,
        ...result.meta,
      },
      meta: { chart_type: doc.type },
    };
  },

  async remove(input) {
    const removed = await deleteChart(input.id);
    if (!removed) throw new ClientError(`chart not found: ${input.id}`, undefined, 404);
    return { id: input.id, deleted: true };
  },
};
