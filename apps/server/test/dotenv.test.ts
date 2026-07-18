import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenv } from "../src/dotenv.js";

const KEYS = ["DOTENV_TEST_A", "DOTENV_TEST_B", "DOTENV_TEST_C", "DOTENV_TEST_EXISTING"];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

function writeEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dotenv-test-"));
  const path = join(dir, ".env");
  writeFileSync(path, content);
  return path;
}

describe("loadDotenv", () => {
  it("parses assignments, strips quotes, skips comments and blanks", () => {
    const path = writeEnvFile(
      ['# comment', "", "DOTENV_TEST_A=plain", 'DOTENV_TEST_B="double quoted"', "DOTENV_TEST_C='single'", "not-an-assignment"].join("\n"),
    );
    loadDotenv(path);
    expect(process.env.DOTENV_TEST_A).toBe("plain");
    expect(process.env.DOTENV_TEST_B).toBe("double quoted");
    expect(process.env.DOTENV_TEST_C).toBe("single");
  });

  it("does not override variables already set in the environment", () => {
    process.env.DOTENV_TEST_EXISTING = "from-shell";
    const path = writeEnvFile("DOTENV_TEST_EXISTING=from-file");
    loadDotenv(path);
    expect(process.env.DOTENV_TEST_EXISTING).toBe("from-shell");
  });

  it("silently ignores a missing file", () => {
    expect(() => loadDotenv("/nonexistent/.env")).not.toThrow();
  });
});
