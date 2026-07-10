import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { initAiSettings } from "./ai/initAiSettings.js";
import { startAiScheduler } from "./ai/scheduler.js";
import { createKernel } from "./bootstrap.js";
import { getDb } from "./db/index.js";
import { loadDotenv } from "./dotenv.js";
import { BASE_URL, KERNEL_PORT, LEGACY_CHARTS_DIR, PORT, WEB_DIST } from "./env.js";
import { attachWs } from "./realtime/wsHost.js";

loadDotenv();

// 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
// default 5-min ephemeral TTL expires right at the boundary and misses.
process.env.PI_CACHE_RETENTION ??= "long";

initAiSettings(getDb());

const isDevKernel = Boolean(process.env.KERNEL_PORT);
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

const kernel = await createKernel();
const apiApp = kernel.app.getInstance();

const app = new Hono();
app.all("/api/*", (c) => apiApp.fetch(c.req.raw));
app.use(
  "/legacy/*",
  serveStatic({ root: LEGACY_CHARTS_DIR, rewriteRequestPath: (path) => path.replace(/^\/legacy/, "") }),
);

if (!isDevKernel) {
  if (existsSync(WEB_DIST)) {
    app.use("*", serveStatic({ root: WEB_DIST }));
    app.get("*", async (c) => c.html(await readFile(join(WEB_DIST, "index.html"), "utf-8")));
  } else {
    console.log(`web build not found at ${WEB_DIST} — run "pnpm --filter @trade/web build" to serve it; API-only for now`);
  }
}

const server = serve({ fetch: app.fetch, port: bindPort }, () => {
  console.log(isDevKernel ? `kernel listening on http://localhost:${bindPort}` : `trade chart server listening on ${BASE_URL}`);
});
attachWs(server as Server, "/api/ws");

if (startAiScheduler()) console.log("ai scheduler started");
