import { Hono } from "hono";
import type { ChartDoc } from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { BASE_URL } from "../env.js";
import { buildChart, mergeForPatch, rebuild, refreshBody } from "../services/build.js";
import { predictionStale } from "../services/staleness.js";
import { allocateId, deleteChart, listCharts, loadChart, saveChart } from "../services/store.js";

export const chartsRoute = new Hono();

function chartUrl(id: string): string {
  return `${BASE_URL}/#/charts/${encodeURIComponent(id)}`;
}

chartsRoute.get("/", async (c) => {
  const metas = await listCharts({
    type: c.req.query("type"),
    symbol: c.req.query("symbol"),
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });
  const now = new Date();
  const withStale = await Promise.all(
    metas.map(async (m) => {
      const doc = m.type === "intraday" ? await loadChart(m.id) : null;
      const stale = doc ? predictionStale(doc, now) : false;
      return { ...m, url: chartUrl(m.id), prediction_stale: stale };
    }),
  );
  const data = c.req.query("stale") === "true" ? withStale.filter((m) => m.prediction_stale) : withStale;
  return c.json({ ok: true, data });
});

chartsRoute.post("/", async (c) => {
  const body = (await c.req.json().catch(() => {
    throw new ClientError("request body must be JSON", 'e.g. {"type": "sepa", "symbol": "MRVL.US"}');
  })) as Record<string, unknown>;
  const result = await buildChart(body);
  const id = await allocateId(result.sessionDate, result.slug);
  const now = new Date().toISOString();
  const doc: ChartDoc = {
    id,
    schema_version: 1,
    type: result.type,
    title: result.title,
    symbol: result.symbol,
    created_at: now,
    updated_at: now,
    input: result.input,
    built: result.built,
  };
  await saveChart(doc);
  return c.json({
    ok: true,
    data: { id, url: chartUrl(id), type: result.type, title: result.title, symbol: result.symbol, ...result.meta },
    meta: { chart_type: result.type },
  });
});

chartsRoute.get("/:id", async (c) => {
  const doc = await loadChart(c.req.param("id"));
  if (!doc) throw new ClientError(`chart not found: ${c.req.param("id")}`, "GET /api/charts lists available ids", 404);
  return c.json({ ok: true, data: { ...doc, prediction_stale: predictionStale(doc, new Date()) } });
});

chartsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const doc = await loadChart(id);
  if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
  const body = (await c.req.json().catch(() => {
    throw new ClientError("request body must be JSON");
  })) as Record<string, unknown>;
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
  return c.json({
    ok: true,
    data: { id, url: chartUrl(id), type: doc.type, title: result.title, symbol: result.symbol, ...result.meta },
    meta: { chart_type: doc.type },
  });
});

chartsRoute.delete("/:id", async (c) => {
  const removed = await deleteChart(c.req.param("id"));
  if (!removed) throw new ClientError(`chart not found: ${c.req.param("id")}`, undefined, 404);
  return c.json({ ok: true, data: { id: c.req.param("id"), deleted: true } });
});
