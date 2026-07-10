import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildImportManifest, copyImportManifest, validateImportSource } from "../src/dataImport.js";

describe("dataImport", () => {
  let root: string;
  let source: string;
  let dest: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "trade-data-import-"));
    source = join(root, "source");
    dest = join(root, "dest");
    mkdirSync(join(source, "journal", "charts", "data"), { recursive: true });
    mkdirSync(join(dest, "journal", "charts", "data"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("validateImportSource", () => {
    it("accepts a source with chart json files", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{}");
      expect(validateImportSource(source, dest)).toEqual({ ok: true });
    });

    it("accepts a source with only the sqlite db present", () => {
      writeFileSync(join(source, "journal", "charts", "data", "app.db"), "");
      expect(validateImportSource(source, dest)).toEqual({ ok: true });
    });

    it("rejects a source missing journal/charts/data entirely", () => {
      const bareRoot = join(root, "bare");
      mkdirSync(bareRoot, { recursive: true });
      expect(validateImportSource(bareRoot, dest)).toEqual({ ok: false, reason: "missing-journal" });
    });

    it("rejects a source whose chart data dir is empty", () => {
      expect(validateImportSource(source, dest)).toEqual({ ok: false, reason: "empty" });
    });

    it("refuses to import a root onto itself", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{}");
      expect(validateImportSource(source, source)).toEqual({ ok: false, reason: "self" });
    });
  });

  describe("buildImportManifest", () => {
    it("lists chart json files and the sqlite db as copy candidates", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{}");
      writeFileSync(join(source, "journal", "charts", "data", "MRVL-2026-01-02.json"), "{}");
      writeFileSync(join(source, "journal", "charts", "data", "app.db"), "");

      const manifest = buildImportManifest(source, dest);
      expect(manifest.entries.map((entry) => entry.relPath).sort()).toEqual(
        [
          join("journal", "charts", "data", "MRVL-2026-01-02.json"),
          join("journal", "charts", "data", "NVDA-2026-01-01.json"),
          join("journal", "charts", "data", "app.db"),
        ].sort(),
      );
      expect(manifest.collisionCount).toBe(0);
    });

    it("ignores non chart-data files in the source dir", () => {
      writeFileSync(join(source, "journal", "charts", "data", "notes.txt"), "hi");
      const manifest = buildImportManifest(source, dest);
      expect(manifest.entries).toEqual([]);
    });

    it("flags files that already exist at the destination as collisions", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      writeFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{dest}");
      writeFileSync(join(source, "journal", "charts", "data", "MRVL-2026-01-02.json"), "{source}");

      const manifest = buildImportManifest(source, dest);
      expect(manifest.collisionCount).toBe(1);
      const collided = manifest.entries.find((entry) => entry.relPath.endsWith("NVDA-2026-01-01.json"));
      expect(collided?.exists).toBe(true);
      const clean = manifest.entries.find((entry) => entry.relPath.endsWith("MRVL-2026-01-02.json"));
      expect(clean?.exists).toBe(false);
    });
  });

  describe("copyImportManifest", () => {
    it("copies every entry when there are no collisions", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      const manifest = buildImportManifest(source, dest);

      const result = copyImportManifest(manifest, { overwrite: false });

      expect(result).toEqual({ copied: 1, skipped: 0 });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{source}");
    });

    it("skips colliding files when overwrite is false", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      writeFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{dest}");
      const manifest = buildImportManifest(source, dest);

      const result = copyImportManifest(manifest, { overwrite: false });

      expect(result).toEqual({ copied: 0, skipped: 1 });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{dest}");
    });

    it("overwrites colliding files when overwrite is true", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      writeFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{dest}");
      const manifest = buildImportManifest(source, dest);

      const result = copyImportManifest(manifest, { overwrite: true });

      expect(result).toEqual({ copied: 1, skipped: 0 });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{source}");
    });

    it("creates the destination chart data dir if it does not already exist", () => {
      const freshDest = join(root, "fresh-dest");
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      const manifest = buildImportManifest(source, freshDest);

      copyImportManifest(manifest, { overwrite: false });

      expect(existsSync(join(freshDest, "journal", "charts", "data", "NVDA-2026-01-01.json"))).toBe(true);
    });
  });
});
