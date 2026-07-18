import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFileLogger,
  formatLogLine,
  installConsoleBridge,
  readTail,
  redactSecrets,
  resolveMainLogPath,
} from "@desktop/logging/fileLogger.js";

const temps: string[] = [];

function tempDir(): string {
  const dir = join(tmpdir(), `kansoku-log-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("redactSecrets", () => {
  it("strips bearer tokens and sk- keys", () => {
    expect(redactSecrets("Authorization Bearer abc.def-ghi")).toContain("[redacted]");
    expect(redactSecrets("key sk-abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
    expect(redactSecrets("plain error message")).toBe("plain error message");
  });
});

describe("formatLogLine", () => {
  it("prefixes iso time and level", () => {
    const line = formatLogLine("error", ["boom"], new Date("2026-07-13T12:00:00.000Z"));
    expect(line).toBe("2026-07-13T12:00:00.000Z [error] boom\n");
  });
});

describe("createFileLogger", () => {
  it("appends formatted lines to the log file", () => {
    const dir = tempDir();
    const path = resolveMainLogPath(dir);
    const logger = createFileLogger({
      logFilePath: path,
      now: () => new Date("2026-07-13T12:00:00.000Z"),
    });
    logger.append("warn", ["hello", 1]);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("[warn] hello 1");
    expect(logger.tail()).toContain("hello 1");
  });

  it("rotates when the next write would exceed maxBytes", () => {
    const dir = tempDir();
    const path = resolveMainLogPath(dir);
    writeFileSync(path, "x".repeat(100), "utf8");
    const logger = createFileLogger({ logFilePath: path, maxBytes: 120 });
    logger.append("log", ["overflow-line"]);
    expect(existsSync(`${path}.1`)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("overflow-line");
  });

  it("tails only the end of a large file", () => {
    const dir = tempDir();
    const path = join(dir, "big.log");
    writeFileSync(path, `${"a".repeat(200)}\nTAIL_MARKER\n`, "utf8");
    const text = readTail(path, 20);
    expect(text).toContain("TAIL_MARKER");
    expect(text.length).toBeLessThan(40);
  });
});

describe("installConsoleBridge", () => {
  it("mirrors console.error into the file logger and redacts secrets", () => {
    const dir = tempDir();
    const path = resolveMainLogPath(dir);
    const logger = createFileLogger({
      logFilePath: path,
      now: () => new Date("2026-07-13T12:00:00.000Z"),
    });

    const dispose = installConsoleBridge(logger);
    const passthrough = vi.fn();
    const bridged = console.error;
    // installConsoleBridge already wrapped console.error; call the live wrapper
    // after replacing the original chain's first hop is hard — call append path
    // via a fresh bridge after stubbing the underlying original.
    dispose();

    const originalError = console.error;
    console.error = passthrough as typeof console.error;
    const dispose2 = installConsoleBridge(logger);
    console.error("ai failed: sk-abcdefghijklmnopqrstuv");
    dispose2();
    console.error = originalError;

    expect(passthrough).toHaveBeenCalled();
    const text = readFileSync(path, "utf8");
    expect(text).toContain("[error]");
    expect(text).toContain("ai failed");
    expect(text).toContain("[redacted]");
    expect(text).not.toContain("sk-abcdefghijklmnopqrstuv");
    void bridged;
  });
});
