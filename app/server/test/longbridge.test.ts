import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcess = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcess.execFile,
}));

async function loadProvider() {
  const { longbridgeProvider } = await import("../src/services/marketdata/longbridge.js");
  return longbridgeProvider;
}

describe("longbridgeProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T00:00:00Z"));
    childProcess.execFile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serializes calls and suppresses queued launches after a CLI failure", async () => {
    childProcess.execFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(new Error("auth required"));
    });
    const provider = await loadProvider();

    const [first, second] = await Promise.allSettled([
      provider.getPositions!(),
      provider.getWatchlistSymbols!(),
    ]);

    expect(childProcess.execFile).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    if (first.status === "rejected") expect(first.reason.message).toContain("failed");
    if (second.status === "rejected") expect(second.reason.message).toContain("skipped after recent failure");
  });

  it("keeps the circuit closed until the cooldown expires", async () => {
    childProcess.execFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      cb(new Error("auth required"));
    });
    const provider = await loadProvider();

    await expect(provider.getPositions!()).rejects.toThrow("failed");
    await expect(provider.getQuotes(["MRVL.US"])).rejects.toThrow("skipped after recent failure");
    expect(childProcess.execFile).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-07-05T00:02:01Z"));
    childProcess.execFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      cb(null, "[{\"symbol\":\"MRVL.US\"}]", "");
    });

    await expect(provider.getQuotes(["MRVL.US"])).resolves.toEqual([{ symbol: "MRVL.US" }]);
    expect(childProcess.execFile).toHaveBeenCalledTimes(2);
  });

  it("flattens watchlist groups into a deduped symbol list", async () => {
    childProcess.execFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      cb(
        null,
        JSON.stringify([
          { securities: [{ symbol: "MU.US" }, { symbol: "NVDA.US" }] },
          { securities: [{ symbol: "MU.US" }] },
          {},
        ]),
        "",
      );
    });
    const provider = await loadProvider();

    await expect(provider.getWatchlistSymbols!()).resolves.toEqual(["MU.US", "NVDA.US"]);
  });
});
