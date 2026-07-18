import { dialog, shell } from "electron";
import {
  loadSparkleBridgeForApp,
  type SparkleBridge,
  type SparkleInitOptions,
} from "electron-sparkle-updater";
import { SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER } from "electron-sparkle-updater/builder";
import {
  checkForUpdate,
  createElectronFallbackDeps,
  type CheckForUpdateResult,
} from "electron-sparkle-updater/fallback";
import { createUpdaterStatusStore, type UpdaterStatusStore, type UpdaterUiStatus } from "./status.js";

const OWNER_REPO = "Innei/kansoku";
const TAG_PREFIX = "desktop-v";
const CHECK_DELAY_MS = 10_000;

// Mirrors electron-builder.yml's extendInfo SUFeedURL/SUPublicEDKey — belt-and-braces
// path for builds where Info.plist lacks those keys (see sparkle_bridge.mm). CI injects
// the real EdDSA public key over this placeholder at package time.
const SPARKLE_APPCAST_URL = "https://github.com/Innei/kansoku/releases/latest/download/appcast.xml";

export interface InitUpdaterOptions {
  delayMs?: number;
  isDev?: boolean;
  showMessage?: (options: { type: "info" | "warning" | "error"; title: string; message: string }) => void;
}

export interface StartUpdaterDeps {
  sparkleBridge: SparkleBridge | null;
  sparkleOptions: SparkleInitOptions;
  runWeakChecker: () => void;
  log?: (message: string) => void;
}

export function startUpdater(deps: StartUpdaterDeps): "sparkle" | "weak" {
  if (deps.sparkleBridge) {
    try {
      if (deps.sparkleBridge.init(deps.sparkleOptions)) {
        deps.log?.("sparkle bridge initialized");
        return "sparkle";
      }
      deps.log?.("sparkle bridge init returned false, falling back to weak checker");
    } catch (err) {
      deps.log?.(`sparkle bridge init threw (${(err as Error).message}), falling back to weak checker`);
    }
  } else {
    deps.log?.("sparkle bridge unavailable, falling back to weak checker");
  }
  deps.runWeakChecker();
  return "weak";
}

export type UpdaterHandle = {
  checkNow: () => void;
  silentCheckOnActivate: () => void;
  getStatus: () => UpdaterUiStatus;
  onStatus: (cb: (status: UpdaterUiStatus) => void) => () => void;
  installNow: () => void;
};

type UpdaterMode = "dev" | "sparkle" | "weak";

function defaultShowMessage(options: {
  type: "info" | "warning" | "error";
  title: string;
  message: string;
}): void {
  void dialog.showMessageBox({
    type: options.type,
    title: options.title,
    message: options.message,
  });
}

export function createUpdaterHandle(options: {
  mode: UpdaterMode;
  sparkleBridge?: SparkleBridge | null;
  showMessage?: InitUpdaterOptions["showMessage"];
  runWeakCheck?: (force: boolean, silent?: boolean) => Promise<CheckForUpdateResult>;
  openRelease?: (url: string) => void;
  statusStore?: UpdaterStatusStore;
  log?: (message: string) => void;
}): UpdaterHandle {
  const showMessage = options.showMessage ?? defaultShowMessage;
  const log = options.log ?? (() => {});
  const statusStore = options.statusStore ?? createUpdaterStatusStore();
  const openRelease =
    options.openRelease ??
    ((url: string) => {
      shell.openExternal(url).catch((err) => {
        log(`openRelease failed: ${(err as Error).message}`);
      });
    });

  let silentCheckInFlight = false;

  const applyResult = (result: CheckForUpdateResult) => {
    statusStore.applyResult(result);
  };

  return {
    getStatus: () => statusStore.get(),
    onStatus: (cb) => statusStore.on(cb),
    silentCheckOnActivate: () => {
      if (options.mode === "dev") return;
      const run = options.runWeakCheck;
      if (!run || silentCheckInFlight) return;
      silentCheckInFlight = true;
      void (async () => {
        try {
          const result = await run(false, true);
          applyResult(result);
        } catch (err) {
          log(`silentCheck failed: ${(err as Error).message}`);
        } finally {
          silentCheckInFlight = false;
        }
      })();
    },
    checkNow: () => {
      if (options.mode === "dev") {
        showMessage({
          type: "info",
          title: "检查更新",
          message: "开发模式不检查更新。",
        });
        return;
      }

      if (options.mode === "sparkle" && options.sparkleBridge) {
        try {
          options.sparkleBridge.checkForUpdates();
        } catch (err) {
          log(`checkNow sparkle failed: ${(err as Error).message}`);
          showMessage({
            type: "error",
            title: "检查更新",
            message: `检查更新失败：${(err as Error).message}`,
          });
        }
        return;
      }

      const run = options.runWeakCheck;
      if (!run) {
        showMessage({
          type: "warning",
          title: "检查更新",
          message: "更新检查暂不可用。",
        });
        return;
      }

      void (async () => {
        try {
          const result = await run(true, false);
          applyResult(result);
          if (result.kind === "available") return;
          if (result.kind === "up-to-date") {
            showMessage({
              type: "info",
              title: "检查更新",
              message: "已是最新版本。",
            });
            return;
          }
          if (result.kind === "fetch-failed") {
            showMessage({
              type: "error",
              title: "检查更新",
              message: `检查更新失败：${result.message}`,
            });
            return;
          }
          if (result.kind === "no-release") {
            showMessage({
              type: "warning",
              title: "检查更新",
              message: "没有找到可用的发布版本。",
            });
            return;
          }
        } catch (err) {
          log(`checkNow weak failed: ${(err as Error).message}`);
          showMessage({
            type: "error",
            title: "检查更新",
            message: `检查更新失败：${(err as Error).message}`,
          });
        }
      })();
    },
    installNow: () => {
      if (options.mode === "dev") {
        showMessage({
          type: "info",
          title: "检查更新",
          message: "开发模式不检查更新。",
        });
        return;
      }

      if (options.mode === "sparkle" && options.sparkleBridge) {
        try {
          options.sparkleBridge.installUpdateNow();
        } catch (err) {
          log(`installNow sparkle failed: ${(err as Error).message}`);
          showMessage({
            type: "error",
            title: "检查更新",
            message: `安装更新失败：${(err as Error).message}`,
          });
        }
        return;
      }

      const current = statusStore.get();
      if (current.kind === "available") {
        openRelease(current.htmlUrl);
        return;
      }

      const run = options.runWeakCheck;
      if (!run) {
        showMessage({
          type: "warning",
          title: "检查更新",
          message: "更新检查暂不可用。",
        });
        return;
      }

      void (async () => {
        try {
          const result = await run(true, true);
          applyResult(result);
          if (result.kind === "available") {
            openRelease(result.release.htmlUrl);
            return;
          }
          if (result.kind === "up-to-date") {
            showMessage({
              type: "info",
              title: "检查更新",
              message: "已是最新版本。",
            });
            return;
          }
          showMessage({
            type: "warning",
            title: "检查更新",
            message: "暂时无法打开更新页面。",
          });
        } catch (err) {
          log(`installNow weak failed: ${(err as Error).message}`);
          showMessage({
            type: "error",
            title: "检查更新",
            message: `检查更新失败：${(err as Error).message}`,
          });
        }
      })();
    },
  };
}

export async function initUpdater(options: InitUpdaterOptions = {}): Promise<UpdaterHandle> {
  const isDev = options.isDev ?? process.env.ELECTRON_DEV === "1";
  const log = (message: string) => console.debug(`[updater] ${message}`);
  const showMessage = options.showMessage ?? defaultShowMessage;
  const statusStore = createUpdaterStatusStore();

  if (isDev) {
    return createUpdaterHandle({ mode: "dev", showMessage, statusStore, log });
  }

  const sparkleBridge = await loadSparkleBridgeForApp(log);
  const mode = startUpdater({
    sparkleBridge,
    sparkleOptions: {
      appcastUrl: SPARKLE_APPCAST_URL,
      publicEdKey: SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER,
    },
    runWeakChecker: () => {
      setTimeout(() => {
        void runElectronCheck(false, false).then((result) => statusStore.applyResult(result));
      }, options.delayMs ?? CHECK_DELAY_MS);
    },
    log,
  });

  // Badge detection always uses GitHub, including sparkle mode.
  if (mode === "sparkle") {
    setTimeout(() => {
      void runElectronCheck(false, true).then((result) => statusStore.applyResult(result));
    }, options.delayMs ?? CHECK_DELAY_MS);
  }

  return createUpdaterHandle({
    mode,
    sparkleBridge: mode === "sparkle" ? sparkleBridge : null,
    showMessage,
    statusStore,
    runWeakCheck: async (force, silent) => {
      const result = await runElectronCheck(force, silent === true);
      statusStore.applyResult(result);
      return result;
    },
    log,
  });
}

async function runElectronCheck(force = false, silent = false): Promise<CheckForUpdateResult> {
  const log = (message: string) => console.debug(`[updater] ${message}`);
  const deps = await createElectronFallbackDeps({
    ownerRepo: OWNER_REPO,
    tagPrefix: TAG_PREFIX,
    notificationTitle: "trade update available",
    log,
  });

  try {
    return await checkForUpdate({ ...deps, force, silent });
  } catch (err) {
    log(`skipped: unexpected error (${(err as Error).message})`);
    return { kind: "fetch-failed", message: (err as Error).message };
  }
}
