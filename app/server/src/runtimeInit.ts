import { initAiSettings } from "./ai/initAiSettings.js";
import { getDb } from "./db/index.js";
import { loadDotenv } from "./dotenv.js";

export function initServerRuntime(): void {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= "long";

  initAiSettings(getDb());
}
