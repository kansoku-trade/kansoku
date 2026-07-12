import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeOpencli, resetOpencliCacheForTests } from "../src/services/opencli.js";

const dirs: string[] = [];

afterEach(() => {
  resetOpencliCacheForTests();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeCli(): string {
  const dir = mkdtempSync(join(tmpdir(), "opencli-"));
  dirs.push(dir);
  const path = join(dir, "opencli");
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return path;
}

const DOCTOR_OK = `opencli v1.8.4 doctor (node v24.16.0)

[OK] Daemon: running on port 19825 (v1.8.4)
[OK] Extension: connected (v1.0.20) → v1.0.22 available

Profiles:
  • pz5p7ub5: connected v1.0.20
[OK] Connectivity: connected in 0.2s
`;

describe("probeOpencli", () => {
  it("reports not_installed when the binary cannot be located", async () => {
    const result = await probeOpencli({ env: { PATH: "", SHELL: "/bin/false" }, standardPaths: [] });
    expect(result.state).toBe("not_installed");
    expect(result.cliPath).toBeNull();
  });

  it("reports ready when doctor and twitter profile both succeed", async () => {
    const cli = fakeCli();
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: DOCTOR_OK, stderr: "" })
      .mockResolvedValueOnce({ stdout: "@someone", stderr: "" });
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result).toEqual({ state: "ready", cliPath: cli, lastError: null });
    expect(exec).toHaveBeenNthCalledWith(1, cli, ["doctor"], expect.any(Object));
    expect(exec).toHaveBeenNthCalledWith(2, cli, ["twitter", "profile"], expect.any(Object));
  });

  it("reports extension_missing when doctor output lacks an [OK] Extension line", async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockResolvedValueOnce({
      stdout: "opencli v1.8.4 doctor\n\n[OK] Daemon: running on port 19825 (v1.8.4)\n[FAIL] Extension: not connected\n",
      stderr: "",
    });
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result.state).toBe("extension_missing");
    expect(result.cliPath).toBe(cli);
    expect(result.lastError).toBeTruthy();
  });

  it("reports extension_missing when doctor exits non-zero, using the stderr excerpt as lastError", async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("Command failed"), { stdout: DOCTOR_OK, stderr: "boom", code: 1 }),
    );
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result.state).toBe("extension_missing");
    expect(result.lastError).toContain("boom");
  });

  it("reports no_session when doctor is healthy but twitter profile fails", async () => {
    const cli = fakeCli();
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: DOCTOR_OK, stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("Command failed"), { stdout: "", stderr: "No session for twitter.com" }));
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result.state).toBe("no_session");
    expect(result.cliPath).toBe(cli);
    expect(result.lastError).toContain("No session for twitter.com");
  });

  it("falls back to not_installed when doctor times out or returns unparseable output", async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Command timed out"), { killed: true, signal: "SIGTERM" }));
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result.state).toBe("not_installed");
    expect(result.cliPath).toBe(cli);
  });

  it("falls back to not_installed when doctor times out even with buffered partial stdout", async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("Command timed out"), {
        killed: true,
        signal: "SIGTERM",
        stdout: "opencli v1.8.4 doctor\n\n[OK] Daemon: running on port 19825 (v1.8.4)\n",
      }),
    );
    const result = await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    expect(result.state).toBe("not_installed");
    expect(result.cliPath).toBe(cli);
  });

  it("resetOpencliCacheForTests clears the cached binary path", async () => {
    const cli = fakeCli();
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: DOCTOR_OK, stderr: "" })
      .mockResolvedValueOnce({ stdout: "@someone", stderr: "" });
    await probeOpencli({ env: { OPENCLI_PATH: cli, PATH: "" }, exec });
    resetOpencliCacheForTests();
    const result = await probeOpencli({ env: { PATH: "", SHELL: "/bin/false" }, standardPaths: [] });
    expect(result.state).toBe("not_installed");
  });
});
