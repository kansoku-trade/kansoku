import { afterEach, describe, expect, it, vi } from "vitest";

import { main, USAGE } from "../src/cli.js";

async function runMain(argv: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit called");
  }) as never);

  let exitCode: number | undefined;
  try {
    await main(argv);
  } catch {
    exitCode = exitSpy.mock.calls[0]?.[0] as number | undefined;
  }

  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();

  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
}

describe("bench cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints usage and exits 0 with no args", async () => {
    const result = await runMain([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(USAGE);
  });

  it("prints usage and exits 0 with --help", async () => {
    const result = await runMain(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(USAGE);
  });

  it("points the run subcommand at the pro package instead of executing", async () => {
    const result = await runMain(["run", "--models", "anthropic/claude"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("run requires the pro slot");
    expect(result.stderr).toContain("app/pro");
  });

  it("validates required options for the baseline subcommand", async () => {
    const result = await runMain(["baseline", "--strategies", "bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("invalid baseline strategy: bogus");
  });

  it("validates required options for the report subcommand", async () => {
    const result = await runMain(["report"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--run-id is required");
  });

  it("fails when scores.json is missing for the report subcommand", async () => {
    const result = await runMain(["report", "--run-id", "does-not-exist"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("scores.json not found");
  });

  it("validates required options for the score subcommand", async () => {
    const result = await runMain(["score"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--run-id is required");
  });

  it("validates required options for the gold subcommand", async () => {
    const result = await runMain(["gold"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--dataset-version is required");
  });

  it("rejects unknown commands with exit 1", async () => {
    const result = await runMain(["bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown command: bogus");
  });
});

describe("bench generate argument validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires --version", async () => {
    const result = await runMain(["generate", "--symbols", "MU.US"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--version is required");
  });

  it("rejects an unknown symbol", async () => {
    const result = await runMain(["generate", "--version", "v1", "--symbols", "NOTREAL.US"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown symbol");
  });

  it("rejects an unsupported bank", async () => {
    const result = await runMain(["generate", "--version", "v1", "--bank", "intraday"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unsupported bank");
  });

  it("rejects a non-positive --windows-per-symbol", async () => {
    const result = await runMain(["generate", "--version", "v1", "--windows-per-symbol", "0"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--windows-per-symbol must be a positive integer");
  });

  it("rejects an unknown generate option", async () => {
    const result = await runMain(["generate", "--version", "v1", "--bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown generate option: --bogus");
  });
});
