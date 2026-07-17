import type { SecretBox } from "@kansoku/pro-api";
import { getDb } from "../../packages/core/src/db/index.js";
import { loadPro } from "../../packages/core/src/pro/loader.js";
import { getPro } from "../../packages/core/src/pro/registry.js";
import {
  createWatchedMarketsStore,
  getActiveWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from "../../packages/core/src/services/watchedMarketsStore.js";
import { loadDotenv } from "./dotenv.js";
import { initAuthUrlOpener, type AuthUrlOpener } from "../../packages/core/src/services/credentials/authUrlOpener.js";
import { initCredentialProvider } from "../../packages/core/src/services/credentials/registry.js";
import type { CredentialProvider } from "../../packages/core/src/services/credentials/types.js";

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
  // Electron bundles this whole call chain into one file at a different
  // directory depth (see pro/loader.ts) — the desktop host passes its own
  // app root here so the pro slot still resolves; the Tsuki server host runs
  // TS directly and leaves this unset.
  proAppDir?: string;
  // Entry file within the pro slot, relative to app/pro. Desktop dev loads the
  // TS source directly (via a tsx loader hook), packaged desktop loads the
  // built output; the Tsuki host leaves this unset and uses the default.
  proEntry?: string;
  // True when this host is a production artifact (packaged desktop app,
  // NODE_ENV=production server). Pro uses it to pick Dodo live vs test.
  productionHost?: boolean;
}

export async function initServerRuntime(opts?: ServerRuntimeOptions): Promise<void> {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= "long";

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  setActiveWatchedMarketsStore(createWatchedMarketsStore(getDb()));

  await loadPro(opts?.proAppDir, opts?.proEntry);
  await getPro()?.initRuntime?.(getDb(), opts?.secretBox, {
    watchedMarkets: getActiveWatchedMarketsStore(),
    production: opts?.productionHost ?? process.env.NODE_ENV === "production",
  });
}
