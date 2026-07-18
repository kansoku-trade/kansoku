import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildImportManifest, copyImportManifest, validateImportSource } from "../../src/dataImport/manifest.js";

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

    it("rejects a source whose chart data dir only has the sqlite db (db is never imported)", () => {
      writeFileSync(join(source, "journal", "charts", "data", "app.db"), "");
      expect(validateImportSource(source, dest)).toEqual({ ok: false, reason: "empty" });
    });

    it("rejects a source whose chart data dir only has the retired index.json", () => {
      writeFileSync(join(source, "journal", "charts", "data", "index.json"), "{}");
      expect(validateImportSource(source, dest)).toEqual({ ok: false, reason: "empty" });
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
    it("lists chart json files as copy candidates", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{}");
      writeFileSync(join(source, "journal", "charts", "data", "MRVL-2026-01-02.json"), "{}");

      const manifest = buildImportManifest(source, dest);
      expect(manifest.entries.map((entry) => entry.relPath).sort()).toEqual(
        [
          join("journal", "charts", "data", "MRVL-2026-01-02.json"),
          join("journal", "charts", "data", "NVDA-2026-01-01.json"),
        ].sort(),
      );
      expect(manifest.collisionCount).toBe(0);
    });

    it("ignores non-chart files in the source dir, including the sqlite db and retired index", () => {
      writeFileSync(join(source, "journal", "charts", "data", "notes.txt"), "hi");
      writeFileSync(join(source, "journal", "charts", "data", "app.db"), "");
      writeFileSync(join(source, "journal", "charts", "data", "index.json"), "{}");
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

      expect(result).toEqual({ copied: 1, skipped: 0, failed: 0, failures: [] });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{source}");
    });

    it("skips colliding files when overwrite is false", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      writeFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{dest}");
      const manifest = buildImportManifest(source, dest);

      const result = copyImportManifest(manifest, { overwrite: false });

      expect(result).toEqual({ copied: 0, skipped: 1, failed: 0, failures: [] });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{dest}");
    });

    it("overwrites colliding files when overwrite is true", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      writeFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{dest}");
      const manifest = buildImportManifest(source, dest);

      const result = copyImportManifest(manifest, { overwrite: true });

      expect(result).toEqual({ copied: 1, skipped: 0, failed: 0, failures: [] });
      expect(readFileSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"), "utf8")).toBe("{source}");
    });

    it("creates the destination chart data dir if it does not already exist", () => {
      const freshDest = join(root, "fresh-dest");
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{source}");
      const manifest = buildImportManifest(source, freshDest);

      copyImportManifest(manifest, { overwrite: false });

      expect(existsSync(join(freshDest, "journal", "charts", "data", "NVDA-2026-01-01.json"))).toBe(true);
    });

    it("reports a per-file failure without aborting the rest of the batch", () => {
      writeFileSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"), "{nvda}");
      writeFileSync(join(source, "journal", "charts", "data", "MRVL-2026-01-02.json"), "{mrvl}");
      const manifest = buildImportManifest(source, dest);

      // Simulate a mid-copy failure (e.g. the source file vanished, a disk-full,
      // or a permission error) by removing the source file after the manifest
      // was built but before the copy loop reaches it.
      unlinkSync(join(source, "journal", "charts", "data", "NVDA-2026-01-01.json"));

      const result = copyImportManifest(manifest, { overwrite: false });

      expect(result.copied).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].relPath).toBe(join("journal", "charts", "data", "NVDA-2026-01-01.json"));
      expect(result.failures[0].error).toBeTruthy();
      expect(readFileSync(join(dest, "journal", "charts", "data", "MRVL-2026-01-02.json"), "utf8")).toBe("{mrvl}");
      expect(existsSync(join(dest, "journal", "charts", "data", "NVDA-2026-01-01.json"))).toBe(false);
    });
  });
});
