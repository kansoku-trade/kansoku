import type { SecretBox } from '@kansoku/pro-api';
import { getAiRuntime, initAiSettings } from '@kansoku/core/ai/initAiSettings';
import { getDb } from '@kansoku/core/db/index';
import { setProductionHost } from '@kansoku/core/license/dodoEnv';
import { startLicenseRevalidation } from '@kansoku/core/license/licenseSchedule';
import { initLicenseManager } from '@kansoku/core/license/licenseState';
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/services/watchedMarketsStore';
import { loadDotenv } from './dotenv.js';
import {
  initAuthUrlOpener,
  type AuthUrlOpener,
} from '@kansoku/core/services/credentials/authUrlOpener';
import { initCredentialProvider } from '@kansoku/core/services/credentials/registry';
import type { CredentialProvider } from '@kansoku/core/services/credentials/types';
import { setProPresent } from '@kansoku/core/pro/bundleState';
import { registerProChannels } from '@kansoku/core/pro/channels';
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
// settings) and resolves the server edition's pro composition, WITHOUT
// registering it into the core pro seams or starting it. Both hosts call
// this; only the host that actually owns a composition's lifecycle should
// go on to call activateProComposition with it — see kernel.ts vs
// initServerRuntime below.
export async function prepareServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerProComposition | null> {
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

  return await import('./edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[server] pro composition unavailable, running free', error);
      return null;
    });
}

// Registers a resolved composition into the core pro seams and starts it.
// Call this exactly once per host boot, using whichever composition that
// host actually owns — the standalone server owns the server composition,
// desktop owns the desktop composition.
export async function activateProComposition(
  composition: Pick<
    ServerProComposition,
    'hooks' | 'aiExtension' | 'realtimeChannels' | 'start'
  > | null,
): Promise<void> {
  setProPresent(composition != null);
  if (composition?.hooks) registerProHooks(composition.hooks);
  if (composition?.aiExtension) registerProAiExtension(composition.aiExtension);
  if (composition?.realtimeChannels) registerProChannels(composition.realtimeChannels);
  await composition?.start?.();
}

export async function initServerRuntime(
  opts?: ServerRuntimeOptions,
): Promise<ServerProComposition | null> {
  const proComposition = await prepareServerRuntime(opts);
  await activateProComposition(proComposition);
  return proComposition;
}
