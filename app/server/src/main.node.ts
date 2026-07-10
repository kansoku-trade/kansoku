import { startAiScheduler } from "./ai/scheduler.js";
import { HOST_MODE, KERNEL_PORT, PORT } from "./env.js";
import { startHost } from "./host.js";
import { initServerRuntime } from "./runtimeInit.js";

initServerRuntime();

const isDevKernel = HOST_MODE === "dev";
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel);

if (startAiScheduler()) console.log("ai scheduler started");
