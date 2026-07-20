import { HOST_MODE, KERNEL_PORT, PORT } from '@kansoku/core/env';
import { startHost } from './host.js';
import { initServerRuntime } from './runtimeInit.js';

const proComposition = await initServerRuntime();

const isDevKernel = HOST_MODE === 'dev';
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel, proComposition?.modules ?? []);

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, disposing pro composition`);
  try {
    await proComposition?.dispose?.();
  } catch (error) {
    console.error('[server] pro composition dispose failed', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
