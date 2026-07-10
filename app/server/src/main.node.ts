import { initAiSettings } from "./ai/initAiSettings.js";
import { startAiScheduler } from "./ai/scheduler.js";
import { getDb } from "./db/index.js";
import { loadDotenv } from "./dotenv.js";
import { KERNEL_PORT, PORT } from "./env.js";
import { startHost } from "./host.js";

loadDotenv();

// 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
// default 5-min ephemeral TTL expires right at the boundary and misses.
process.env.PI_CACHE_RETENTION ??= "long";

initAiSettings(getDb());

const isDevKernel = Boolean(process.env.KERNEL_PORT);
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel);

if (startAiScheduler()) console.log("ai scheduler started");
