import type { FastifyPluginAsync } from "fastify";
import type { ChartDoc } from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { BASE_URL } from "../env.js";
import { ALL_TYPES, buildChart, mergeForPatch, rebuild, refreshBody } from "../services/build.js";
import { clampViewCount } from "../services/history.js";
import { predictionStale } from "../services/staleness.js";
import { createChart, deleteChart, listCharts, loadChart, saveChart } from "../services/store.js";

function chartUrl(id: string): string {
  return `${BASE_URL}/charts/${encodeURIComponent(id)}`;
}

type Query = Record<string, string | undefined>;
type Params = { id: string };

function jsonBody(body: unknown, hint?: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ClientError("request body must be JSON", hint);
  }
  return body as Record<string, unknown>;
}

export const chartsRoute: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>("/", async (req) => {
    const metas = await listCharts({
      type: req.query.type,
      symbol: req.query.symbol,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    const now = new Date();
    const withStale = await Promise.all(
      metas.map(async (m) => {
        const doc = m.type === "intraday" ? await loadChart(m.id) : null;
        const stale = doc ? predictionStale(doc, now) : false;
        return { ...m, url: chartUrl(m.id), prediction_stale: stale };
      }),
    );
    const data = req.query.stale === "true" ? withStale.filter((m) => m.prediction_stale) : withStale;
    return { ok: true, data };
  });

  app.post("/", async (req) => {
    const body = jsonBody(req.body, 'e.g. {"type": "sepa", "symbol": "MRVL.US"}');
    const result = await buildChart(body);
    const doc = await createChart(result);
    return {
      ok: true,
      data: { id: doc.id, url: chartUrl(doc.id), type: doc.type, title: doc.title, symbol: doc.symbol, ...result.meta },
      meta: { chart_type: doc.type },
    };
  });

  app.get<{ Params: Params; Querystring: Query }>("/:id/built", async (req) => {
    const id = req.params.id;
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    if (doc.type !== "intraday") {
      throw new ClientError(`history view only supports intraday charts, got: ${doc.type}`, undefined, 400);
    }
    const count = clampViewCount(req.query.count);
    if (count === null) throw new ClientError("`count` must be a positive integer", "e.g. ?count=300", 400);
    const body = refreshBody(doc.type, doc.input);
    if (!body) throw new ClientError("chart has no symbol to refetch", undefined, 400);
    const result = await buildChart({ ...body, count, title: doc.title });
    return { ok: true, data: { built: result.built, count } };
  });

  app.get<{ Params: Params }>("/:id", async (req) => {
    const doc = await loadChart(req.params.id);
    if (!doc) throw new ClientError(`chart not found: ${req.params.id}`, "GET /api/charts lists available ids", 404);
    return { ok: true, data: { ...doc, prediction_stale: predictionStale(doc, new Date()) } };
  });

  app.patch<{ Params: Params }>("/:id", async (req) => {
    const id = req.params.id;
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    if (!ALL_TYPES.includes(doc.type)) {
      throw new ClientError(
        `chart type '${doc.type}' is no longer supported`,
        "legacy charts are read-only; create an intraday chart instead",
        400,
      );
    }
    const body = jsonBody(req.body);
    const merged = mergeForPatch(doc.type, doc.input, body);
    const title = typeof body.title === "string" && body.title ? body.title : doc.title;
    const refreshable = body.refresh === true ? refreshBody(doc.type, merged) : null;
    const result = refreshable ? await buildChart({ ...refreshable, title }) : rebuild(doc.type, merged, title);
    const updated: ChartDoc = {
      ...doc,
      title: result.title,
      input: result.input,
      built: result.built,
      updated_at: new Date().toISOString(),
      ...("prediction" in body ? { prediction_updated_at: new Date().toISOString() } : {}),
    };
    await saveChart(updated);
    return {
      ok: true,
      data: { id, url: chartUrl(id), type: doc.type, title: result.title, symbol: result.symbol, ...result.meta },
      meta: { chart_type: doc.type },
    };
  });

  app.delete<{ Params: Params }>("/:id", async (req) => {
    const removed = await deleteChart(req.params.id);
    if (!removed) throw new ClientError(`chart not found: ${req.params.id}`, undefined, 404);
    return { ok: true, data: { id: req.params.id, deleted: true } };
  });
};
