import type { SecretBox } from '@kansoku/pro-api';
import { EDITION_ABI_VERSION } from '@kansoku/pro-api/edition';
import { createLogger } from '@tsuki-hono/common';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/initAiSettings';
import { getActiveSettingsStore } from '@kansoku/core/ai/settingsStore';
import { getDb } from '@kansoku/core/db/index';
import type { BaseServerEdition } from '@kansoku/core/edition/base';
import type { ServerEditionHost } from '@kansoku/core/edition/host';
import { KANSOKU_HOME } from '@kansoku/core/env';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { isLicensed } from '@kansoku/core/license/licenseGate';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { getActiveBundleKey, initLicenseManager } from '@kansoku/core/license/licenseState';
import { loadEdition } from '@kansoku/core/pro/editionLoader';
import { loadPro } from '@kansoku/core/pro/loader';
import { getPro } from '@kansoku/core/pro/registry';
import {
  createWatchedMarketsStore,
  getActiveWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/services/watchedMarketsStore';
import { LegacyCompatServerEdition } from './modules/legacyServerEdition.js';
import { loadDotenv } from './dotenv.js';
import { readGeneratedPublicCommit } from './generatedPublicCommit.js';
import { serverEncLayout } from './proEncLayout.js';
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
  // Overrides the build-time-generated public-commit.json read (see
  // generatedPublicCommit.ts) for hosts (e.g. desktop) that embed their own
  // value instead of relying on the server's generated file.
  expectedPublicCommit?: string;
}

export interface ServerRuntimeResult {
  host: ServerEditionHost;
  edition: BaseServerEdition;
  // Which pro protocol this process claimed while resolving the server
  // edition (see protocolClaim.ts) — 'edition' means the packaged bundle
  // activated and callers may still load further edition-protocol runtimes
  // (e.g. desktop) in this process; 'legacy' means loadPro() already claimed
  // the legacy protocol and loadEdition() must not be attempted again here.
  protocol: 'edition' | 'legacy';
}

export async function initServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerRuntimeResult> {
  loadDotenv();

  // 1h prompt-cache TTL: commentator sessions re-run at 5-min heartbeats, the
  // default 5-min ephemeral TTL expires right at the boundary and misses.
  process.env.PI_CACHE_RETENTION ??= 'long';

  initCredentialProvider(opts?.credentialProvider);
  initAuthUrlOpener(opts?.openAuthUrl);
  const watchedMarkets = createWatchedMarketsStore(getDb());
  setActiveWatchedMarketsStore(watchedMarkets);
  initAiSettings(getDb(), { secretBox: opts?.secretBox });

  const productionHost = opts?.productionHost ?? process.env.NODE_ENV === 'production';
  setProductionHost(productionHost);
  // The host passes no secretBox in dev (plaintext keyfile mode) —
  // initAiSettings resolves the fallback box, so the license store must take
  // the resolved one, not the raw (possibly undefined) opts value.
  initLicenseManager(getDb(), getAiRuntime().secretBox);
  startLicenseRevalidation();

  const host: ServerEditionHost = {
    db: getDb(),
    license: { isLicensed },
    aiSettings: getActiveSettingsStore(),
    watchedMarkets: getActiveWatchedMarketsStore(),
    paths: { kansokuHome: KANSOKU_HOME },
    secretBox: opts?.secretBox,
    production: productionHost,
    logger: createLogger('server'),
  };

  const { encPath, virtualDir } = serverEncLayout(opts?.proAppDir);
  const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY ?? null;
  const activation = await loadEdition<ServerEditionHost, BaseServerEdition>({
    encPath,
    virtualDir,
    runtime: 'server',
    keyHex,
    host,
    expectedPublicCommit:
      opts?.expectedPublicCommit ?? (productionHost ? readGeneratedPublicCommit() : undefined),
  });
  console.info(
    `[edition] runtime=server buildId=${activation.buildId ?? 'n/a'} keyId=${activation.keyId ?? 'n/a'} abi=${EDITION_ABI_VERSION} state=${activation.state} code=${activation.error?.code ?? 'n/a'}`,
  );

  let edition: BaseServerEdition;
  let protocol: 'edition' | 'legacy';
  if (activation.state === 'active' && activation.edition) {
    edition = activation.edition;
    protocol = 'edition';
  } else if (activation.state === 'absent' || activation.state === 'locked') {
    await loadPro(opts?.proAppDir, opts?.proEntry);
    await getPro()?.initRuntime?.(getDb(), opts?.secretBox, {
      watchedMarkets: getActiveWatchedMarketsStore(),
      aiSettingsStore: getActiveSettingsStore(),
      production: productionHost,
      licenseGate: { isLicensed },
      kansokuHome: KANSOKU_HOME,
    });
    edition = new LegacyCompatServerEdition(host);
    protocol = 'legacy';
  } else {
    // A bundle was present but rejected (incompatible commit combo or a
    // decrypt/ABI/init failure). Never fall back to loadPro()'s commit-unaware
    // legacy index.mjs here — that would reactivate the exact bundle
    // loadEdition just refused. Run free instead: skip loadPro() entirely so
    // getPro() stays null and LegacyCompatServerEdition carries no pro modules.
    console.error(
      `[edition] runtime=server rejected bundle (state=${activation.state}); running in free mode instead of falling back to legacy pro loader`,
    );
    edition = new LegacyCompatServerEdition(host);
    protocol = 'legacy';
  }

  return { host, edition, protocol };
}
