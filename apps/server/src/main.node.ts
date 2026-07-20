import { disposeMarketData } from '@kansoku/core/marketdata/registry';
import { HOST_MODE, KERNEL_PORT, PORT } from '@kansoku/core/platform/env';
import { startHost } from './host.js';
import { initServerRuntime } from './runtimeInit.js';

const proComposition = await initServerRuntime();

const isDevKernel = HOST_MODE === 'dev';
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel, proComposition?.modules ?? []);

async function cleanup(): Promise<void> {
  disposeMarketData();
  await proComposition?.dispose?.();
}

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, closing market data + disposing pro composition`);
  try {
    await Promise.race([
      cleanup(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  } catch (error) {
    console.error('[server] shutdown cleanup failed', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// vite-node --watch re-runs this entry in-process on file change (no SIGTERM);
// without closing here each restart would leak a live Longbridge socket that
// lingers as a server-side ghost session (~25 min) and burns an account slot.
interface HotContext {
  dispose(cb: () => void): void;
  on(event: string, cb: () => void): void;
}
const hot = (import.meta as ImportMeta & { hot?: HotContext }).hot;
hot?.dispose(() => disposeMarketData());
hot?.on('vite:beforeFullReload', () => disposeMarketData());
