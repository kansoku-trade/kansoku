import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPro } from "../src/pro/loader.js";
import { freeHooks, getPro, isProPresent, unregisterProModuleForTests } from "../src/pro/registry.js";

describe("pro loader", () => {
  afterEach(() => {
    unregisterProModuleForTests();
  });

  it("falls back to free mode when @kansoku/pro is missing", async () => {
    const loaded = await loadPro();
    expect(loaded).toBe(false);
    expect(isProPresent()).toBe(false);
    expect(getPro()).toBeNull();
  });

  it("logs a warning (not the not-found info line) when a present pro module itself fails to import", async () => {
    const root = mkdtempSync(join(tmpdir(), "kansoku-pro-"));
    const appDir = join(root, "appRoot");
    const proSrcDir = join(root, "pro", "src");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(proSrcDir, { recursive: true });
    writeFileSync(join(proSrcDir, "index.js"), 'import "./missing-inner.js";\n');

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const loaded = await loadPro(appDir);
      expect(loaded).toBe(false);
      expect(isProPresent()).toBe(false);
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain("missing-inner.js");
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("free-mode default hooks are inert", async () => {
    const items = [{ ts: "2026-07-10T12:30:00.000Z", title: "CPI", estimate: null, previous: null }];
    await expect(freeHooks.filterMacroForSymbol("NVDA", items)).resolves.toEqual(items);
    expect(freeHooks.listFollowedSymbols()).toEqual([]);
    expect(freeHooks.setSymbolFollowing("NVDA", true)).toEqual({
      symbol: "NVDA",
      following: false,
      startedAt: null,
    });
    await expect(freeHooks.listComments("NVDA", "2026-07-10")).resolves.toEqual([]);
    await expect(freeHooks.listAllCommentDates()).resolves.toEqual([]);
    expect(freeHooks.activeSettingsRevision()).toBe(0);
  });
});
