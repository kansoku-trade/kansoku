// Loaded before the pro slot so global Reflect is patched when the pro slot's
// Tsuki controller/module decorators run inside loadPro(); otherwise their
// route metadata is written before reflect-metadata installs and Tsuki maps no
// routes. bootstrap.js also imports it, but that runs after loadPro().
import "reflect-metadata";
import { join } from "node:path";
import { app, ipcMain, safeStorage, shell } from "electron";
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from "../credentials/bridge.js";
import { createDesktopSecretBox } from "../credentials/secretBox.js";
import { IS_DEV } from "./env.js";

export async function bootKernel() {
  if (__DESKTOP_DEV__) {
    // The pro slot ships as TS and loads at runtime. tsx transforms it with the
    // pro package's tsconfig (experimentalDecorators); tsx otherwise picks the
    // desktop tsconfig, which lacks the flag. Packaged builds load built JS and
    // skip this entirely (the branch is stripped by the __DESKTOP_DEV__ define).
    process.env.TSX_TSCONFIG_PATH = join(app.getAppPath(), "..", "pro", "tsconfig.json");
    const { register } = await import("tsx/esm/api");
    register();
  }

  const [{ initServerRuntime }, { attachRealtimeBridge }, { CHART_DATA_DIR }, { getPro }] = await Promise.all([
    import("../../../server/src/runtimeInit.js"),
    import("../realtime/bridge.js"),
    import("../../../../packages/core/src/env.js"),
    import("../../../../packages/core/src/pro/registry.js"),
  ]);

  // Dev keeps the pre-P3 plaintext keyfile so ELECTRON_DEV workflows are
  // unaffected; packaged builds move the AI master key into safeStorage.
  const secretBox = IS_DEV
    ? undefined
    : createDesktopSecretBox({
        safeStorage,
        wrappedKeyPath: join(app.getPath("userData"), "ai-master-key.json"),
        legacyKeyPath: join(CHART_DATA_DIR, "ai-secret.key"),
      });

  await initServerRuntime({
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
    proEntry: app.isPackaged ? undefined : "src/index.ts",
  });
  // bootstrap.js is imported lazily, after initServerRuntime() has awaited
  // loadPro() above, so AppModule's registry-derived AI module composition
  // sees the pro module (when present).
  const { createKernel } = await import("../../../server/src/bootstrap.js");
  const kernel = await createKernel();
  if (getPro()?.startScheduler) {
    getPro()!.startScheduler!();
    console.log("[desktop] ai scheduler started");
  }
  const apiApp = kernel.app.getInstance();
  attachRealtimeBridge();
  registerCredentialsIpc(ipcMain, createCredentialsBridgeHandlers());

  const health = await apiApp.fetch(new Request("http://localhost/api/health"));
  console.log(`[desktop] kernel self-test /api/health -> ${health.status}`, await health.text());

  return kernel;
}
