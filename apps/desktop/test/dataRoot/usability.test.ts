import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDataRootUsable } from "@desktop/dataRoot/usability.js";

describe("isDataRootUsable", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "data-root-usable-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns false when the path is missing", () => {
    expect(isDataRootUsable(join(root, "missing"))).toBe(false);
  });

  it("returns false when the path is a file", () => {
    const file = join(root, "file.txt");
    writeFileSync(file, "x");
    expect(isDataRootUsable(file)).toBe(false);
  });

  it("returns true for an existing writable directory", () => {
    const dir = join(root, "ok");
    mkdirSync(dir);
    expect(isDataRootUsable(dir)).toBe(true);
  });

  it("returns false when the directory is not writable", () => {
    const dir = join(root, "readonly");
    mkdirSync(dir);
    chmodSync(dir, 0o555);
    try {
      expect(isDataRootUsable(dir)).toBe(false);
    } finally {
      chmodSync(dir, 0o755);
    }
  });
});
