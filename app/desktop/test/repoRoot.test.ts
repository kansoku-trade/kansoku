import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "../src/repoRoot.js";

describe("resolveRepoRoot", () => {
  it("lands on the repo root regardless of whether this module runs from src or a relocated build output", () => {
    const root = resolveRepoRoot();
    expect(existsSync(join(root, "app", "desktop", "package.json"))).toBe(true);
    expect(existsSync(join(root, "app", "pnpm-workspace.yaml"))).toBe(true);
  });
});
