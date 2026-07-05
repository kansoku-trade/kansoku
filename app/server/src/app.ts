import { promises as fs } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { ClientError } from "./errors.js";
import { CHART_DATA_DIR, LEGACY_CHARTS_DIR, PORT } from "./env.js";
import { chartsRoute } from "./routes/charts.js";
import { overviewRoute } from "./routes/overview.js";
import { streamsRoute } from "./routes/streams.js";
import { symbolsRoute } from "./routes/symbols.js";

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify();

  app.addHook("onResponse", async (req, reply) => {
    if (!req.url.startsWith("/api")) return;
    const ms = Math.round(reply.elapsedTime);
    console.log(`[api] ${req.method} ${req.url} -> ${reply.statusCode} ${ms}ms`);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ClientError) {
      return reply.status(err.status).send({ ok: false, error: err.message, hint: err.hint });
    }
    if (err instanceof Error && "code" in err && String(err.code).startsWith("FST_ERR_CTP")) {
      return reply.status(400).send({
        ok: false,
        error: "request body must be JSON",
        hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
      });
    }
    console.error(err);
    return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
  });

  app.get("/api/health", async () => ({
    ok: true,
    data: { status: "up", port: PORT, dataDir: CHART_DATA_DIR },
  }));

  await app.register(chartsRoute, { prefix: "/api/charts" });
  await app.register(streamsRoute, { prefix: "/api/stream" });
  await app.register(symbolsRoute, { prefix: "/api/symbols" });
  await app.register(overviewRoute, { prefix: "/api/overview" });

  app.get("/api/legacy", async () => {
    let files: string[] = [];
    try {
      files = (await fs.readdir(LEGACY_CHARTS_DIR)).filter((f) => f.endsWith(".html"));
    } catch {
      files = [];
    }
    files.sort((a, b) => (a < b ? 1 : -1));
    return {
      ok: true,
      data: files.map((f) => ({ file: f, url: `/legacy/${encodeURIComponent(f)}`, date: f.slice(0, 10) })),
    };
  });

  await app.register(fastifyStatic, { root: LEGACY_CHARTS_DIR, prefix: "/legacy/" });

  return app;
}
