import type { SecretBox } from '@kansoku/pro-api';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/settings/initAiSettings';
import { getDb } from '@kansoku/core/db/index';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { initLicenseManager } from '@kansoku/core/license/licenseState';
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/marketdata/watchedMarketsStore';
import { loadDotenv } from './dotenv.js';
import { initAuthUrlOpener, type AuthUrlOpener } from '@kansoku/core/credentials/authUrlOpener';
import { initCredentialProvider } from '@kansoku/core/credentials/registry';
import type { CredentialProvider } from '@kansoku/core/credentials/types';
import { setProPresent } from '@kansoku/core/pro/bundleState';
import { registerProChannels } from '@kansoku/core/pro/channels';
import { registerProDetectors } from '@kansoku/core/pro/detectors';
import { registerProHooks } from '@kansoku/core/pro/hooks';
import { registerProAiExtension } from '@kansoku/core/pro/aiExtension';
import type { ServerProComposition } from './edition/types.js';

export interface ServerRuntimeOptions {
  credentialProvider?: CredentialProvider;
  secretBox?: SecretBox;
  openAuthUrl?: AuthUrlOpener;
  // True when this host is a production artifact (packaged desktop app,
  // NODE_ENV=production server). Pro uses it to pick Dodo live vs test.
  productionHost?: boolean;
}

// Sets up the shared server-side runtime (db, credentials, license, AI
// settings) WITHOUT resolving the server edition's pro composition. This is
// the piece that must run before loadPro on a host with an encrypted bundle
// (loadPro reads the bundle key off the license state this initialises), and
// it's also the piece the standalone server host needs on its own — it has
// no encrypted bundle and no loadPro step at all.
export async function initServerHostRuntime(opts?: ServerRuntimeOptions): Promise<void> {
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
}

// Resolves the server edition's pro composition, WITHOUT registering it into
// the core pro seams or starting it. In a packaged build this import only
// resolves once loadPro has registered the pro chunks as virtual modules —
// callers with an encrypted bundle (desktop) MUST call loadPro before this;
// callers with no bundle (standalone server) can call it right away. Both
// hosts call this; only the host that actually owns a composition's
// lifecycle should go on to call activateProComposition with it — see
// kernel.ts vs initServerRuntime below.
export async function resolveServerProComposition(): Promise<ServerProComposition | null> {
  return await import('./edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[server] pro composition unavailable, running free', error);
      return null;
    });
}

// Convenience composition of the two phases above, in the order that's
// correct for a host with NO encrypted bundle step in between (standalone
// server). Hosts with a loadPro step (desktop) must call the two phases
// separately with loadPro sequenced between them — see kernel.ts.
export async function prepareServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerProComposition | null> {
  await initServerHostRuntime(opts);
  return resolveServerProComposition();
}

// Registers a resolved composition into the core pro seams and starts it.
// Call this exactly once per host boot, using whichever composition that
// host actually owns — the standalone server owns the server composition,
// desktop owns the desktop composition.
export async function activateProComposition(
  composition: Pick<
    ServerProComposition,
    'hooks' | 'aiExtension' | 'realtimeChannels' | 'detectors' | 'start'
  > | null,
): Promise<void> {
  setProPresent(composition != null);
  if (composition?.hooks) registerProHooks(composition.hooks);
  if (composition?.aiExtension) registerProAiExtension(composition.aiExtension);
  if (composition?.realtimeChannels) registerProChannels(composition.realtimeChannels);
  if (composition?.detectors) registerProDetectors(composition.detectors);
  await composition?.start?.();
}

export async function initServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerProComposition | null> {
  const proComposition = await prepareServerRuntime(opts);
  await activateProComposition(proComposition);
  return proComposition;
}
