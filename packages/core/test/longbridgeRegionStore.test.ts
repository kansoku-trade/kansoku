import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/index.js';
import { appMeta } from '../src/db/schema.js';
import {
  createLongbridgeRegionStore,
  getActiveLongbridgeRegionStore,
  setActiveLongbridgeRegionStore,
  validateLongbridgeRegionPreference,
} from '../src/marketdata/longbridgeRegionStore.js';

function tempDbPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'longbridge-region-store-'));
  return { dir, path: join(dir, 'app.db') };
}

describe('validateLongbridgeRegionPreference', () => {
  it('accepts auto, com and cn', () => {
    expect(validateLongbridgeRegionPreference('auto')).toBe('auto');
    expect(validateLongbridgeRegionPreference('com')).toBe('com');
    expect(validateLongbridgeRegionPreference('cn')).toBe('cn');
  });

  it('rejects an unknown value', () => {
    expect(() => validateLongbridgeRegionPreference('us')).toThrow();
    expect(() => validateLongbridgeRegionPreference(null)).toThrow();
    expect(() => validateLongbridgeRegionPreference(undefined)).toThrow();
  });
});

describe('createLongbridgeRegionStore', () => {
  it('defaults to auto when no row exists', () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createLongbridgeRegionStore(createDb(path));
      expect(store.get()).toBe('auto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('round-trips a set value and persists across store instances', () => {
    const { dir, path } = tempDbPath();
    try {
      const db1 = createDb(path);
      const store1 = createLongbridgeRegionStore(db1);
      store1.set('cn');
      expect(store1.get()).toBe('cn');

      const store2 = createLongbridgeRegionStore(createDb(path));
      expect(store2.get()).toBe('cn');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid set() value', () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createLongbridgeRegionStore(createDb(path));
      expect(() => store.set('us' as never)).toThrow();
      expect(store.get()).toBe('auto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to auto when the stored value is invalid', () => {
    const { dir, path } = tempDbPath();
    try {
      const db = createDb(path);
      db.insert(appMeta).values({ key: 'longbridge_region_v1', value: 'us' }).run();

      const store = createLongbridgeRegionStore(db);
      expect(store.get()).toBe('auto');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('getActiveLongbridgeRegionStore / setActiveLongbridgeRegionStore', () => {
  afterEach(() => setActiveLongbridgeRegionStore(null));

  it('throws with a clear message when unset', () => {
    setActiveLongbridgeRegionStore(null);
    expect(() => getActiveLongbridgeRegionStore()).toThrow(/longbridge-region store/i);
  });

  it('returns the store set via setActiveLongbridgeRegionStore', () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createLongbridgeRegionStore(createDb(path));
      setActiveLongbridgeRegionStore(store);
      expect(getActiveLongbridgeRegionStore()).toBe(store);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
