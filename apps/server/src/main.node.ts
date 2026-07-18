import { HOST_MODE, KERNEL_PORT, PORT } from "../../../packages/core/src/env.js";
import { getPro } from "../../../packages/core/src/pro/registry.js";
import { startHost } from "./host.js";
import { initServerRuntime } from "./runtimeInit.js";

await initServerRuntime();

const isDevKernel = HOST_MODE === "dev";
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel);

if (getPro()?.startScheduler) {
  getPro()!.startScheduler!();
  console.log("ai scheduler started");
}
