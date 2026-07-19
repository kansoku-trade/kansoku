// Loaded before the pro slot so global Reflect is patched when the pro slot's
// Tsuki controller/module decorators run inside loadPro(); otherwise their
// route metadata is written before reflect-metadata installs and Tsuki maps no
// routes. bootstrap.js also imports it, but that runs after loadPro().
import 'reflect-metadata';
import { join } from 'node:path';
import { app, ipcMain, safeStorage, shell } from 'electron';
import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { BaseDesktopEdition } from '@kansoku/core/edition/base';
import { DefaultIpcRegistry } from '@kansoku/core/edition/ipcRegistry';
import type { DesktopEditionHost } from '@kansoku/core/edition/host';
import { DefaultRealtimeChannelRegistry } from '@kansoku/core/edition/realtimeRegistry';
import { loadEdition } from '@kansoku/core/pro/editionLoader';
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from '../credentials/bridge.js';
import { createDesktopSecretBox } from '../credentials/secretBox.js';
import { nonAiIpcServiceClasses } from '../ipc/index.js';
import { serverEncLayout } from '../../../server/src/proEncLayout.js';
import { IS_DEV } from './env.js';
import { LegacyCompatDesktopEdition } from './legacyDesktopEdition.js';
import { startProActivationWatch } from './proActivationWatch.js';
import { promptProRelaunch } from './proRelaunch.js';

export async function bootKernel() {
  if (__DESKTOP_DEV__) {
    // The pro slot ships as TS and loads at runtime. tsx transforms it with the
    // pro package's tsconfig (experimentalDecorators); tsx otherwise picks the
    // desktop tsconfig, which lacks the flag. Packaged builds load built JS and
    // skip this entirely (the branch is stripped by the __DESKTOP_DEV__ define).
    process.env.TSX_TSCONFIG_PATH = join(app.getAppPath(), '..', 'pro', 'tsconfig.json');
    const { register } = await import('tsx/esm/api');
    register();
  }

  const [
    { initServerRuntime },
    { attachRealtimeBridge },
    { CHART_DATA_DIR },
    { hasEncBundle, isProPresent },
    { getActiveBundleKey },
  ] = await Promise.all([
    import('../../../server/src/runtimeInit.js'),
    import('../realtime/bridge.js'),
    import('@kansoku/core/env'),
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

  const { host: serverHost, edition: serverEdition, protocol } = await initServerRuntime({
    secretBox,
    openAuthUrl: (url) => {
      shell.openExternal(url).catch(() => {});
    },
    proAppDir: app.getAppPath(),
    productionHost: app.isPackaged,
    // Packaged builds only ever stage pro.enc (see desktop/scripts/
    // stagePro.mjs) — no plaintext dist/ to fall back to, so loadPro's
    // default entryFile is fine (it just fails cleanly into free mode when
    // absent). Only dev needs an explicit entry, for the sibling slot
    // checkout it runs straight from TS.
    proEntry: app.isPackaged ? undefined : 'src/index.ts',
  });
  await serverEdition.initialize();

  // bootstrap.js is imported lazily, after initServerRuntime() has awaited
  // loadPro() above, so AppModule's registry-derived AI module composition
  // sees the pro module (when present).
  const { createKernel } = await import('../../../server/src/bootstrap.js');
  const kernel = await createKernel(serverEdition);

  const ipcRegistry = new DefaultIpcRegistry();
  const realtimeRegistry = new DefaultRealtimeChannelRegistry();
  const desktopHost: DesktopEditionHost = {
    ...serverHost,
    aiRuntimeAlreadyInitialized: true,
    ipc: ipcRegistry,
    realtime: realtimeRegistry,
  };

  // Attempt at most one pro protocol per process (see protocolClaim.ts):
  // initServerRuntime() already resolved the server-side edition and, when
  // the packaged bundle was absent/locked/incompatible, fell back to the
  // legacy loadPro() protocol and claimed it. Calling loadEdition() again
  // here in that case would throw a protocol-conflict error, so only retry
  // the edition protocol for the desktop runtime when the server side
  // actually activated it — a legacy claim goes straight to the legacy
  // desktop adapter without touching loadEdition() again.
  let desktopEdition: BaseDesktopEdition;
  if (protocol === 'edition') {
    const { encPath, virtualDir } = serverEncLayout(app.getAppPath());
    const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY ?? null;
    const desktopActivation = await loadEdition<DesktopEditionHost, BaseDesktopEdition>({
      encPath,
      virtualDir,
      runtime: 'desktop',
      keyHex,
      host: desktopHost,
    });
    desktopEdition =
      desktopActivation.state === 'active' && desktopActivation.edition
        ? desktopActivation.edition
        : new LegacyCompatDesktopEdition(desktopHost);
  } else {
    desktopEdition = new LegacyCompatDesktopEdition(desktopHost);
  }
  desktopEdition.configureIpc(ipcRegistry);
  desktopEdition.configureRealtime(realtimeRegistry);
  await desktopEdition.initialize();

  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge(realtimeRegistry.list());
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request('http://localhost/api/health'));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  await desktopEdition.start();
  await serverEdition.start();

  startProActivationWatch({
    hasEncBundle,
    isProPresent,
    getBundleKey: getActiveBundleKey,
    relaunch: () => void promptProRelaunch(),
  });

  return {
    kernel,
    ipcServiceClasses: [
      ...nonAiIpcServiceClasses,
      ...(ipcRegistry.build() as unknown as IpcServiceConstructor[]),
    ] as const,
    dispose: async () => {
      await Promise.allSettled([desktopEdition.dispose(), serverEdition.dispose()]);
    },
  };
}
