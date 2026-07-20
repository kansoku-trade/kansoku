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
    { initServerRuntime },
    { attachRealtimeBridge },
    { CHART_DATA_DIR },
    { getPro, hasEncBundle, isProPresent },
    { getActiveBundleKey },
  ] = await Promise.all([
    import('../../../server/src/runtimeInit.js'),
    import('../kernel/realtime/bridge.js'),
    import('@kansoku/core/platform/env'),
    import('@kansoku/core/pro/registry'),
    import('@kansoku/core/license/licenseState'),
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

  await initServerRuntime({
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
    proAppDir: app.getAppPath(),
    productionHost: app.isPackaged,
    // Pro is part of the same vite graph as main: packaged builds load it from
    // pro.enc through the virtual root; dev loads the plaintext chunk the
    // watch build emits at dist-main/__pro__ (absent → clean free mode).
    proEntry: app.isPackaged
      ? undefined
      : join(app.getAppPath(), 'dist-main', '__pro__', 'index.mjs'),
  });
  // bootstrap.js is imported lazily, after initServerRuntime() has awaited
  // loadPro() above, so AppModule's registry-derived AI module composition
  // sees the pro module (when present).
  const { createKernel } = await import('../../../server/src/bootstrap.js');
  const kernel = await createKernel();
  if (getPro()?.startScheduler) {
    getPro()!.startScheduler!();
    console.log('[desktop] ai scheduler started');
  }
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request('http://localhost/api/health'));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  startProActivationWatch({
    hasEncBundle,
    isProPresent,
    getBundleKey: getActiveBundleKey,
    relaunch: () => void promptProRelaunch(),
  });

  return kernel;
}
