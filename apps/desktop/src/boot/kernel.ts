// Loaded before the pro slot so global Reflect is patched when the pro slot's
// Tsuki controller/module decorators run inside loadPro(); otherwise their
// route metadata is written before reflect-metadata installs and Tsuki maps no
// routes. bootstrap.js also imports it, but that runs after loadPro().
import 'reflect-metadata';
import { join } from 'node:path';
import { app, ipcMain, safeStorage, shell } from 'electron';
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from '../data/credentials/bridge.js';
import { createDesktopSecretBox } from '../data/credentials/secretBox.js';
import { IS_DEV } from './env.js';
import { startProActivationWatch } from './proActivationWatch.js';
import { promptProRelaunch } from './proRelaunch.js';

export async function bootKernel() {
  const [
    { initServerHostRuntime, resolveServerProComposition, activateProComposition },
    { attachRealtimeBridge },
    { CHART_DATA_DIR },
    { hasEncBundle, isProPresent },
    { getActiveBundleKey },
    { loadPro },
    { disposeMarketData },
  ] = await Promise.all([
    import('../../../server/src/runtimeInit.js'),
    import('../kernel/realtime/bridge.js'),
    import('@kansoku/core/platform/env'),
    import('@kansoku/core/pro/bundleState'),
    import('@kansoku/core/license/licenseState'),
    import('@kansoku/core/pro/loader'),
    import('@kansoku/core/marketdata/registry'),
  ]);

  // Dev keeps the pre-P3 plaintext keyfile so ELECTRON_DEV workflows are
  // unaffected; packaged builds move the AI master key into safeStorage.
  const secretBox = IS_DEV
    ? undefined
    : createDesktopSecretBox({
        safeStorage,
        wrappedKeyPath: join(app.getPath('userData'), 'ai-master-key.json'),
        legacyKeyPath: join(CHART_DATA_DIR, 'ai-secret.key'),
      });

  // Three phases in a fixed order, because two conflicting constraints meet
  // on the desktop host: loadPro must run AFTER host init (it reads the
  // bundle key off the license state initServerHostRuntime sets up), and
  // both edition composition imports must run AFTER loadPro (in a packaged
  // build the plaintext __pro__ chunks are gone, so the pro node chunks only
  // resolve once loadPro has registered them as virtual modules).
  await initServerHostRuntime({
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
    productionHost: app.isPackaged,
  });

  const proPayload = await loadPro(app.getAppPath());

  // Only the server edition's module list is needed here — the desktop
  // host does not own the server composition's lifecycle, so this must not
  // register or start it (that would double-run the composition alongside
  // the desktop edition's own composition below).
  const serverProComposition = await resolveServerProComposition();

  const { createKernel } = await import('../../../server/src/bootstrap.js');
  const kernel = await createKernel(serverProComposition?.modules ?? []);

  const proComposition = await import('../edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[desktop] pro composition unavailable, running free', error);
      return null;
    });

  console.log(`[boot] proComposition=${proComposition ? 'active' : 'free'}`);

  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  await activateProComposition(proComposition);
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request('http://localhost/api/health'));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  startProActivationWatch({
    hasEncBundle,
    isProPresent,
    getBundleKey: getActiveBundleKey,
    relaunch: () => void promptProRelaunch(),
  });

  let disposed = false;
  return {
    kernel,
    proComposition,
    webFiles: proPayload?.webFiles ?? null,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      disposeMarketData();
      await Promise.race([
        Promise.resolve(proComposition?.dispose?.()),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    },
  };
}
