import type { ChartDoc } from "../../../../../shared/types.js";
import { chartUrl } from "../../chartUrl.js";
import type { ChartsApi } from "../../contract/charts.js";
import { ClientError } from "../../errors.js";
import { ALL_TYPES, buildChart, mergeForPatch, rebuild, refreshBody } from "../../services/build.js";
import { clampViewCount } from "../../services/history.js";
import { predictionStale } from "../../services/staleness.js";
import { createChart, deleteChart, listCharts, loadChart, saveChart } from "../../services/store.js";

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
    return { ...doc, prediction_stale: predictionStale(doc, new Date()) };
  },

  async create(input) {
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
