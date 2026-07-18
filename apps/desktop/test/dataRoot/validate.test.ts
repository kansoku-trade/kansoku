import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHART_DATA_REL, validateDataRootCandidate } from "../../src/dataRoot/validate.js";

describe("validateDataRootCandidate", () => {
  let root: string;
  let current: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "data-root-validate-"));
    current = join(root, "current");
    mkdirSync(join(current, CHART_DATA_REL), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects when the candidate is the current root", () => {
    expect(validateDataRootCandidate(current, current)).toEqual({ ok: false, reason: "self" });
  });

  it("rejects when the path does not exist", () => {
    expect(validateDataRootCandidate(join(root, "missing"), current)).toEqual({
      ok: false,
      reason: "not-dir",
    });
  });

  it("rejects when the path is a file", () => {
    const file = join(root, "file.txt");
    writeFileSync(file, "x");
    expect(validateDataRootCandidate(file, current)).toEqual({ ok: false, reason: "not-dir" });
  });

  it("accepts a writable directory that already has journal/charts/data", () => {
    const candidate = join(root, "repo");
    mkdirSync(join(candidate, CHART_DATA_REL), { recursive: true });
    expect(validateDataRootCandidate(candidate, current)).toEqual({ ok: true });
  });

  it("accepts a writable empty directory", () => {
    const candidate = join(root, "empty");
    mkdirSync(candidate);
    expect(validateDataRootCandidate(candidate, current)).toEqual({ ok: true });
  });

  it("requires confirm when non-empty without journal/charts/data", () => {
    const candidate = join(root, "messy");
    mkdirSync(candidate);
    writeFileSync(join(candidate, "readme.md"), "hi");
    expect(validateDataRootCandidate(candidate, current)).toEqual({
      ok: false,
      reason: "needs-confirm-scaffold",
    });
  });

  it("rejects a non-empty directory that is not writable", () => {
    const candidate = join(root, "readonly");
    mkdirSync(candidate);
    writeFileSync(join(candidate, "keep.txt"), "x");
    chmodSync(candidate, 0o555);
    try {
      expect(validateDataRootCandidate(candidate, current)).toEqual({
        ok: false,
        reason: "not-writable",
      });
    } finally {
      chmodSync(candidate, 0o755);
    }
  });

  it("rejects an empty directory that is not writable", () => {
    const candidate = join(root, "empty-readonly");
    mkdirSync(candidate);
    chmodSync(candidate, 0o555);
    try {
      expect(validateDataRootCandidate(candidate, current)).toEqual({
        ok: false,
        reason: "not-writable",
      });
    } finally {
      chmodSync(candidate, 0o755);
    }
  });

  it("rejects existing journal/charts/data when the root is not writable", () => {
    const candidate = join(root, "repo-readonly");
    mkdirSync(join(candidate, CHART_DATA_REL), { recursive: true });
    chmodSync(candidate, 0o555);
    try {
      expect(validateDataRootCandidate(candidate, current)).toEqual({
        ok: false,
        reason: "not-writable",
      });
    } finally {
      chmodSync(candidate, 0o755);
    }
  });
});
