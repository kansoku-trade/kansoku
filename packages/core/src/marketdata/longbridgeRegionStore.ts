import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { appMeta } from '../db/schema.js';
import { ClientError } from '../platform/errors.js';
import type { LongbridgeRegionPreference } from './longbridgeEndpoints.js';

const REGION_PREFERENCE_KEY = 'longbridge_region_v1';
const VALID_PREFERENCES: LongbridgeRegionPreference[] = ['auto', 'com', 'cn'];

export const DEFAULT_LONGBRIDGE_REGION_PREFERENCE: LongbridgeRegionPreference = 'auto';

export function validateLongbridgeRegionPreference(input: unknown): LongbridgeRegionPreference {
  if (
    typeof input !== 'string' ||
    !VALID_PREFERENCES.includes(input as LongbridgeRegionPreference)
  ) {
    throw new ClientError(
      `invalid longbridge region preference: ${String(input)}`,
      `expected one of ${VALID_PREFERENCES.join(', ')}`,
    );
  }
  return input as LongbridgeRegionPreference;
}

function parsePreference(raw: string | undefined): LongbridgeRegionPreference {
  if (!raw) return DEFAULT_LONGBRIDGE_REGION_PREFERENCE;
  try {
    return validateLongbridgeRegionPreference(raw);
  } catch {
    return DEFAULT_LONGBRIDGE_REGION_PREFERENCE;
  }
}

export interface LongbridgeRegionStore {
  get(): LongbridgeRegionPreference;
  set(preference: LongbridgeRegionPreference): void;
}

export function createLongbridgeRegionStore(db: Db): LongbridgeRegionStore {
  const row = db.select().from(appMeta).where(eq(appMeta.key, REGION_PREFERENCE_KEY)).get();
  let cache = parsePreference(row?.value);

  return {
    get(): LongbridgeRegionPreference {
      return cache;
    },

    set(preference: LongbridgeRegionPreference): void {
      const validated = validateLongbridgeRegionPreference(preference);

      db.insert(appMeta)
        .values({ key: REGION_PREFERENCE_KEY, value: validated })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: validated } })
        .run();

      cache = validated;
    },
  };
}

let active: LongbridgeRegionStore | null = null;

export function setActiveLongbridgeRegionStore(store: LongbridgeRegionStore | null): void {
  active = store;
}

export function getActiveLongbridgeRegionStore(): LongbridgeRegionStore {
  if (!active) {
    throw new Error(
      'longbridgeRegionStore: no active longbridge-region store; call setActiveLongbridgeRegionStore before use',
    );
  }
  return active;
}

export function getLongbridgeRegionPreferenceOrDefault(): LongbridgeRegionPreference {
  return active ? active.get() : DEFAULT_LONGBRIDGE_REGION_PREFERENCE;
}
