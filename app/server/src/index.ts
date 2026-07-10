import middie from "@fastify/middie";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";
import { initAiSettings } from "./ai/initAiSettings.js";
import { startAiScheduler } from "./ai/scheduler.js";
import { createApp } from "./app.js";
import { getDb } from "./db/index.js";
import { loadDotenv } from "./dotenv.js";
import { BASE_URL, PORT, WEB_ROOT } from "./env.js";

loadDotenv();

// 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
// default 5-min ephemeral TTL expires right at the boundary and misses.
process.env.PI_CACHE_RETENTION ??= "long";

initAiSettings(getDb());

const app = await createApp();
await app.register(middie);

const vite = await createViteServer({
  configFile: join(WEB_ROOT, "vite.config.ts"),
  root: WEB_ROOT,
  appType: "spa",
  // HMR gets its own port: @fastify/websocket owns the upgrade event on PORT,
  // sharing app.server would break the HMR websocket handshake.
  server: { middlewareMode: true, hmr: { port: PORT + 1 } },
});

app.use((req, res, next) => {
  if (req.url?.startsWith("/api") || req.url?.startsWith("/legacy")) return next();
  vite.middlewares(req, res, next);
});

await app.listen({ port: PORT });
console.log(`trade chart server listening on ${BASE_URL}`);

if (startAiScheduler()) console.log("ai scheduler started");
