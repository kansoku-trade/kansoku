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

  it("free-mode default paid hooks are inert", () => {
    expect(freeHooks.requestImmediateFollow("NVDA")).toBeUndefined();
    expect(freeHooks.startDeepDiveForNote("NVDA")).toEqual({ started: false, reason: "disabled" });
    expect(freeHooks.deepDiveStatus()).toEqual({ running: false });
  });
});
