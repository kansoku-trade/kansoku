import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createKernel } from "./bootstrap.js";
import { BASE_URL, LEGACY_CHARTS_DIR, WEB_DIST } from "../../packages/core/src/env.js";
import { attachWs } from "./realtime/wsHost.js";

export interface HostHandle {
  server: Server;
}

export async function startHost(port: number, isDevKernel: boolean): Promise<HostHandle> {
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
      console.log(`web build not found at ${WEB_DIST} — run "pnpm --filter @kansoku/web build" to serve it; API-only for now`);
    }
  }

  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(isDevKernel ? `kernel listening on http://localhost:${port}` : `trade chart server listening on ${BASE_URL}`);
  });
  attachWs(server as Server, "/api/ws");
  return { server: server as Server };
}
