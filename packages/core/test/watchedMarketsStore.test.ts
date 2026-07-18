import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/index.js";
import {
  createWatchedMarketsStore,
  getActiveWatchedMarketsStore,
  setActiveWatchedMarketsStore,
  validateWatchedMarkets,
} from "../src/services/watchedMarketsStore.js";

function tempDbPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "watched-markets-store-"));
  return { dir, path: join(dir, "app.db") };
}

describe("validateWatchedMarkets", () => {
  it("rejects a non-array", () => {
    expect(() => validateWatchedMarkets("US")).toThrow();
    expect(() => validateWatchedMarkets(null)).toThrow();
  });

  it("rejects an empty array", () => {
    expect(() => validateWatchedMarkets([])).toThrow();
  });

  it("rejects an unknown market", () => {
    expect(() => validateWatchedMarkets(["JP"])).toThrow();
  });

  it("dedupes while preserving first-occurrence order", () => {
    expect(validateWatchedMarkets(["US", "US", "HK"])).toEqual(["US", "HK"]);
  });
});

describe("createWatchedMarketsStore", () => {
  it("defaults to [US] when no row exists", () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createWatchedMarketsStore(createDb(path));
      expect(store.get()).toEqual(["US"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a set value and persists across store instances", () => {
    const { dir, path } = tempDbPath();
    try {
      const db1 = createDb(path);
      const store1 = createWatchedMarketsStore(db1);
      store1.set(["HK", "CN"]);
      expect(store1.get()).toEqual(["HK", "CN"]);

      const store2 = createWatchedMarketsStore(createDb(path));
      expect(store2.get()).toEqual(["HK", "CN"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a defensive copy from get()", () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createWatchedMarketsStore(createDb(path));
      const markets = store.get();
      markets.push("HK");
      expect(store.get()).toEqual(["US"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an empty set() and unknown markets", () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createWatchedMarketsStore(createDb(path));
      expect(() => store.set([])).toThrow();
      expect(() => store.set(["JP" as never])).toThrow();
      expect(store.get()).toEqual(["US"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bumps revision on write", () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createWatchedMarketsStore(createDb(path));
      expect(store.revision()).toBe(0);
      store.set(["HK"]);
      expect(store.revision()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("getActiveWatchedMarketsStore / setActiveWatchedMarketsStore", () => {
  afterEach(() => setActiveWatchedMarketsStore(null));

  it("throws with a clear message when unset", () => {
    setActiveWatchedMarketsStore(null);
    expect(() => getActiveWatchedMarketsStore()).toThrow(/watched-markets store/i);
  });

  it("returns the store set via setActiveWatchedMarketsStore", () => {
    const { dir, path } = tempDbPath();
    try {
      const store = createWatchedMarketsStore(createDb(path));
      setActiveWatchedMarketsStore(store);
      expect(getActiveWatchedMarketsStore()).toBe(store);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
