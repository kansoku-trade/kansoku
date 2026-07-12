import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataRoot, resolveRepoRoot, scaffoldDataRoot } from "../../src/boot/paths.js";

describe("resolveRepoRoot", () => {
  it("lands on the repo root regardless of whether this module runs from src or a relocated build output", () => {
    const root = resolveRepoRoot();
    expect(existsSync(join(root, "app", "desktop", "package.json"))).toBe(true);
    expect(existsSync(join(root, "app", "pnpm-workspace.yaml"))).toBe(true);
  });
});

describe("resolveDataRoot", () => {
  it("prefers an explicit TRADE_PROJECT_ROOT override regardless of packaged state", () => {
    const root = resolveDataRoot({
      isPackaged: true,
      envOverride: "/explicit/override",
      userDataPath: "/unused/userData",
    });
    expect(root).toBe("/explicit/override");
  });

  it("falls back to userData when packaged with no override", () => {
    const root = resolveDataRoot({
      isPackaged: true,
      envOverride: undefined,
      userDataPath: "/Users/x/Library/Application Support/TradeCharts",
    });
    expect(root).toBe("/Users/x/Library/Application Support/TradeCharts");
  });

  it("falls back to the repo root in dev, ignoring userData", () => {
    const root = resolveDataRoot({
      isPackaged: false,
      envOverride: undefined,
      userDataPath: "/unused/userData",
    });
    expect(root).toBe(resolveRepoRoot());
  });
});

describe("scaffoldDataRoot", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("creates the minimal dir shape the kernel expects on first run", () => {
    dir = mkdtempSync(join(tmpdir(), "trade-data-root-"));
    scaffoldDataRoot(dir);
    expect(existsSync(join(dir, "journal"))).toBe(true);
    expect(existsSync(join(dir, "journal", "charts", "data"))).toBe(true);
    expect(existsSync(join(dir, "journal", "charts", "annotations"))).toBe(true);
    expect(existsSync(join(dir, "stocks"))).toBe(true);
  });
});
