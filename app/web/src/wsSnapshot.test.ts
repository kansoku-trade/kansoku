// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { keyFor as KeyFor, loadSnapshot as LoadSnapshot, saveSnapshot as SaveSnapshot } from "./wsSnapshot";

async function freshModule(): Promise<{
  loadSnapshot: typeof LoadSnapshot;
  saveSnapshot: typeof SaveSnapshot;
  keyFor: typeof KeyFor;
}> {
  vi.resetModules();
  return import("./wsSnapshot");
}

describe("wsSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves and loads a whitelisted board snapshot", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "board" }, { foo: 1 });
    expect(loadSnapshot({ kind: "board" })).toEqual({ at: expect.any(Number), data: { foo: 1 } });
  });

  it("saves and loads a whitelisted global quotes snapshot", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "quotes" }, { quotes: [] });
    expect(loadSnapshot({ kind: "quotes" })).toEqual({ at: expect.any(Number), data: { quotes: [] } });
  });

  it("does not persist quotes with an extra narrowing", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "quotes", extra: ["AAPL.US"] }, { quotes: [] });
    expect(loadSnapshot({ kind: "quotes", extra: ["AAPL.US"] })).toBeNull();
  });

  it("does not persist other channel kinds", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "position", symbol: "AAPL.US" }, { position: null, relvol: null });
    expect(loadSnapshot({ kind: "position", symbol: "AAPL.US" })).toBeNull();
  });

  it("throttles writes to at most one per ~5s per key", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "board" }, { n: 1 });
    saveSnapshot({ kind: "board" }, { n: 2 });
    expect(loadSnapshot({ kind: "board" })?.data).toEqual({ n: 1 });

    vi.advanceTimersByTime(5_000);
    saveSnapshot({ kind: "board" }, { n: 3 });
    expect(loadSnapshot({ kind: "board" })?.data).toEqual({ n: 3 });
  });

  it("throttles independently per key", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "board" }, { n: 1 });
    saveSnapshot({ kind: "quotes" }, { n: 2 });
    expect(loadSnapshot({ kind: "board" })?.data).toEqual({ n: 1 });
    expect(loadSnapshot({ kind: "quotes" })?.data).toEqual({ n: 2 });
  });

  it("returns null when stored JSON is corrupted", async () => {
    const { loadSnapshot } = await freshModule();
    localStorage.setItem("ws-snapshot:" + JSON.stringify({ kind: "board" }), "{not json");
    expect(loadSnapshot({ kind: "board" })).toBeNull();
  });

  it("does not throw when localStorage.setItem throws", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => saveSnapshot({ kind: "board" }, { n: 1 })).not.toThrow();
    setItemSpy.mockRestore();
    expect(loadSnapshot({ kind: "board" })).toBeNull();
  });

  it("produces the same key regardless of spec field order", async () => {
    const { keyFor } = await freshModule();
    const a = { kind: "position", symbol: "AAPL.US" } as const;
    const b = { symbol: "AAPL.US", kind: "position" } as const;
    expect(keyFor(a)).toBe(keyFor(b));
  });

  it("does not throw when localStorage.getItem throws", async () => {
    const { loadSnapshot, saveSnapshot } = await freshModule();
    saveSnapshot({ kind: "board" }, { n: 1 });

    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => loadSnapshot({ kind: "board" })).not.toThrow();
    expect(loadSnapshot({ kind: "board" })).toBeNull();
    getItemSpy.mockRestore();
  });
});
