import { getLongbridgeRegionPreferenceOrDefault } from './longbridgeRegionStore.js';

export type LongbridgeRegion = 'com' | 'cn';
export type LongbridgeRegionPreference = 'auto' | LongbridgeRegion;

const REGION_ENDPOINTS: Record<LongbridgeRegion, { http: string; ws: string }> = {
  com: { http: 'https://openapi.longbridge.com', ws: 'wss://openapi-quote.longbridge.com/v2' },
  cn: { http: 'https://openapi.longbridge.cn', ws: 'wss://openapi-quote.longbridge.cn/v2' },
};

export interface ResolvedLongbridgeEndpoints {
  http: string;
  ws: string;
  region: LongbridgeRegion | null;
}

export interface LongbridgeEndpointsDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  getRegionPreference?: () => LongbridgeRegionPreference;
}

const PROBE_TIMEOUT_MS = 3_000;

let overrides: LongbridgeEndpointsDeps = {};
let cachedAutoRegion: LongbridgeRegion | null = null;
let currentRegion: LongbridgeRegion | null = null;
let preferredNextRegion: LongbridgeRegion | null = null;

function currentFetch(): typeof fetch {
  return overrides.fetchImpl ?? fetch;
}

function currentEnv(): NodeJS.ProcessEnv {
  return overrides.env ?? process.env;
}

function currentGetRegionPreference(): LongbridgeRegionPreference {
  return (overrides.getRegionPreference ?? getLongbridgeRegionPreferenceOrDefault)();
}

export function configureLongbridgeEndpoints(next: LongbridgeEndpointsDeps): void {
  overrides = { ...overrides, ...next };
}

export function resetLongbridgeEndpointsForTests(): void {
  overrides = {};
  cachedAutoRegion = null;
  currentRegion = null;
  preferredNextRegion = null;
}

async function probeRegion(region: LongbridgeRegion): Promise<boolean> {
  try {
    // fetch() only rejects on network error/timeout; any HTTP status (incl. 4xx/5xx) resolves.
    await currentFetch()(REGION_ENDPOINTS[region].http, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

async function raceProbe(): Promise<LongbridgeRegion | null> {
  const regions: LongbridgeRegion[] = ['com', 'cn'];
  const attempts = regions.map(async (region) => {
    if (!(await probeRegion(region))) throw new Error(`longbridge endpoint unreachable: ${region}`);
    return region;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

function otherRegion(region: LongbridgeRegion): LongbridgeRegion {
  return region === 'com' ? 'cn' : 'com';
}

async function resolveAutoRegion(): Promise<LongbridgeRegion> {
  if (cachedAutoRegion) return cachedAutoRegion;

  if (preferredNextRegion) {
    const preferred = preferredNextRegion;
    preferredNextRegion = null;
    if (await probeRegion(preferred)) {
      cachedAutoRegion = preferred;
      return preferred;
    }
    const fallback = otherRegion(preferred);
    if (await probeRegion(fallback)) {
      cachedAutoRegion = fallback;
      return fallback;
    }
    return 'com';
  }

  const winner = await raceProbe();
  if (winner) {
    cachedAutoRegion = winner;
    return winner;
  }
  return 'com';
}

export async function resolveLongbridgeEndpoints(): Promise<ResolvedLongbridgeEndpoints> {
  const env = currentEnv();
  const httpOverride = env.LONGBRIDGE_HTTP_URL;
  const wsOverride = env.LONGBRIDGE_QUOTE_WS_URL;

  if (httpOverride && wsOverride) {
    currentRegion = null;
    return { http: httpOverride, ws: wsOverride, region: null };
  }

  const preference = currentGetRegionPreference();
  const region = preference === 'auto' ? await resolveAutoRegion() : preference;
  currentRegion = region;

  const endpoints = REGION_ENDPOINTS[region];
  return {
    http: httpOverride ?? endpoints.http,
    ws: wsOverride ?? endpoints.ws,
    region,
  };
}

export function reportLongbridgeEndpointFailure(): void {
  const env = currentEnv();
  if (env.LONGBRIDGE_HTTP_URL && env.LONGBRIDGE_QUOTE_WS_URL) return;
  if (currentGetRegionPreference() !== 'auto') return;

  cachedAutoRegion = null;
  if (currentRegion) preferredNextRegion = otherRegion(currentRegion);
}
