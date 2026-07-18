import { describe, expect, it, vi } from "vitest";
import { applyCheckResult, createUpdaterStatusStore } from "@desktop/updater/status.js";

describe("applyCheckResult", () => {
  const available = {
    kind: "available" as const,
    version: "1.1.0",
    htmlUrl: "https://example.com/r",
  };
  const upToDate = {
    kind: "up-to-date" as const,
    current: "1.0.0",
    latest: "1.0.0",
  };

  it("sets available from a successful check", () => {
    expect(
      applyCheckResult({ kind: "unknown" }, {
        kind: "available",
        release: { version: "1.1.0", htmlUrl: "https://example.com/r" },
      }),
    ).toEqual(available);
  });

  it("sets up-to-date from a successful check", () => {
    expect(applyCheckResult(available, upToDate)).toEqual(upToDate);
  });

  it("keeps previous status when throttled", () => {
    expect(applyCheckResult(available, { kind: "throttled" })).toEqual(available);
  });

  it("keeps previous available when fetch fails", () => {
    expect(
      applyCheckResult(available, { kind: "fetch-failed", message: "network" }),
    ).toEqual(available);
  });

  it("keeps previous available when no release", () => {
    expect(applyCheckResult(available, { kind: "no-release" })).toEqual(available);
  });
});

describe("createUpdaterStatusStore", () => {
  it("emits only when status changes", () => {
    const store = createUpdaterStatusStore();
    const cb = vi.fn();
    store.on(cb);

    store.applyResult({
      kind: "available",
      release: { version: "2.0.0", htmlUrl: "https://x" },
    });
    store.applyResult({
      kind: "available",
      release: { version: "2.0.0", htmlUrl: "https://x" },
    });
    store.applyResult({ kind: "throttled" });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({
      kind: "available",
      version: "2.0.0",
      htmlUrl: "https://x",
    });
  });
});
