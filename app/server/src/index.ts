import middie from "@fastify/middie";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";
import { startAiScheduler } from "./ai/scheduler.js";
import { createApp } from "./app.js";
import { loadDotenv } from "./dotenv.js";
import { BASE_URL, PORT, WEB_ROOT } from "./env.js";

loadDotenv();

const app = await createApp();
await app.register(middie);

const vite = await createViteServer({
  configFile: join(WEB_ROOT, "vite.config.ts"),
  root: WEB_ROOT,
  appType: "spa",
  server: { middlewareMode: true, hmr: { server: app.server } },
});

app.use((req, res, next) => {
  if (req.url?.startsWith("/api") || req.url?.startsWith("/legacy")) return next();
  vite.middlewares(req, res, next);
});

await app.listen({ port: PORT });
console.log(`trade chart server listening on ${BASE_URL}`);

if (startAiScheduler()) console.log("ai scheduler started");
