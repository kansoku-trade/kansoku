import type { SecretBox } from '@kansoku/pro-api';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/initAiSettings';
import { getActiveSettingsStore } from '@kansoku/core/ai/settingsStore';
import { getDb } from '@kansoku/core/db/index';
import { KANSOKU_HOME } from '@kansoku/core/env';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { isLicensed } from '@kansoku/core/license/licenseGate';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { initLicenseManager } from '@kansoku/core/license/licenseState';
import { loadPro } from '@kansoku/core/pro/loader';
import { getPro } from '@kansoku/core/pro/registry';
import {
  createWatchedMarketsStore,
  getActiveWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/services/watchedMarketsStore';
import { loadDotenv } from './dotenv.js';
import {
  initAuthUrlOpener,
  type AuthUrlOpener,
} from '@kansoku/core/services/credentials/authUrlOpener';
import { initCredentialProvider } from '@kansoku/core/services/credentials/registry';
import type { CredentialProvider } from '@kansoku/core/services/credentials/types';

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
  // Electron bundles this whole call chain into one file at a different
  // directory depth (see pro/loader.ts) — the desktop host passes its own
  // app root here so the pro slot still resolves; the Tsuki server host runs
  // TS directly and leaves this unset.
  proAppDir?: string;
  // Entry file within the pro slot, relative to apps/pro. Desktop dev loads the
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
  process.env.PI_CACHE_RETENTION ??= 'long';

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  setActiveWatchedMarketsStore(createWatchedMarketsStore(getDb()));
  initAiSettings(getDb(), { secretBox: opts?.secretBox });

  const productionHost = opts?.productionHost ?? process.env.NODE_ENV === 'production';
  setProductionHost(productionHost);
  // The host passes no secretBox in dev (plaintext keyfile mode) —
  // initAiSettings resolves the fallback box, so the license store must take
  // the resolved one, not the raw (possibly undefined) opts value.
  initLicenseManager(getDb(), getAiRuntime().secretBox);
  startLicenseRevalidation();

  await loadPro(opts?.proAppDir, opts?.proEntry);
  await getPro()?.initRuntime?.(getDb(), opts?.secretBox, {
    watchedMarkets: getActiveWatchedMarketsStore(),
    aiSettingsStore: getActiveSettingsStore(),
    production: productionHost,
    licenseGate: { isLicensed },
    kansokuHome: KANSOKU_HOME,
  });
}
