import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@tsuki-hono/common";
import type { ChartDoc } from "../../../../shared/types.js";
import { chartUrl } from "../../chartUrl.js";
import { ClientError } from "../../errors.js";
import { ALL_TYPES, buildChart, mergeForPatch, rebuild, refreshBody } from "../../services/build.js";
import { clampViewCount } from "../../services/history.js";
import { predictionStale } from "../../services/staleness.js";
import { createChart, deleteChart, listCharts, loadChart, saveChart } from "../../services/store.js";

type QueryParams = Record<string, string | undefined>;

function jsonBody(body: unknown, hint?: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ClientError("request body must be JSON", hint);
  }
  return body as Record<string, unknown>;
}

@Controller("charts")
export class ChartsController {
  @Get("/")
  async list(@Query() query: QueryParams) {
    const type = query.type
      ? query.type
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const metas = await listCharts({
      type,
      symbol: query.symbol,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    const now = new Date();
    const withStale = await Promise.all(
      metas.map(async (m) => {
        const doc = m.type === "intraday" ? await loadChart(m.id) : null;
        const stale = doc ? predictionStale(doc, now) : false;
        return { ...m, url: chartUrl(m), prediction_stale: stale };
      }),
    );
    const data = query.stale === "true" ? withStale.filter((m) => m.prediction_stale) : withStale;
    return { ok: true, data };
  }

  @Post("/")
  async create(@Body() body: unknown) {
    const parsed = jsonBody(body, 'e.g. {"type": "sepa", "symbol": "MRVL.US"}');
    const result = await buildChart(parsed);
    const doc = await createChart(result);
    return {
      ok: true,
      data: { id: doc.id, url: chartUrl(doc), type: doc.type, title: doc.title, symbol: doc.symbol, ...result.meta },
      meta: { chart_type: doc.type },
    };
  }

  @Get("/:id/built")
  async built(@Param("id") id: string, @Query() query: QueryParams) {
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    if (doc.type !== "intraday") {
      throw new ClientError(`history view only supports intraday charts, got: ${doc.type}`, undefined, 400);
    }
    const count = clampViewCount(query.count);
    if (count === null) throw new ClientError("`count` must be a positive integer", "e.g. ?count=300", 400);
    const body = refreshBody(doc.type, doc.input);
    if (!body) throw new ClientError("chart has no symbol to refetch", undefined, 400);
    const result = await buildChart({ ...body, count, title: doc.title });
    return { ok: true, data: { built: result.built, count } };
  }

  @Get("/:id")
  async getOne(@Param("id") id: string) {
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    return { ok: true, data: { ...doc, prediction_stale: predictionStale(doc, new Date()) } };
  }

  @Patch("/:id")
  async patch(@Param("id") id: string, @Body() body: unknown) {
    const doc = await loadChart(id);
    if (!doc) throw new ClientError(`chart not found: ${id}`, "GET /api/charts lists available ids", 404);
    if (!ALL_TYPES.includes(doc.type)) {
      throw new ClientError(
        `chart type '${doc.type}' is no longer supported`,
        "legacy charts are read-only; create an intraday chart instead",
        400,
      );
    }
    const parsed = jsonBody(body);
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
      ok: true,
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
  }

  @Delete("/:id")
  async remove(@Param("id") id: string) {
    const removed = await deleteChart(id);
    if (!removed) throw new ClientError(`chart not found: ${id}`, undefined, 404);
    return { ok: true, data: { id, deleted: true } };
  }
}
