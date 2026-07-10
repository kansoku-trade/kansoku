import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import { getRestrictedModeSnapshotForTests, resetRestrictedModeForTests } from "./restrictedMode";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("api() marks restricted mode on credential-coded 503s", () => {
  afterEach(() => {
    resetRestrictedModeForTests();
    vi.unstubAllGlobals();
  });

  it("marks restricted on a 503 NO_CREDENTIALS envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "not configured", code: "NO_CREDENTIALS" }, 503)),
    );
    await expect(api("/api/positions")).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(true);
  });

  it("marks restricted on a 503 CREDENTIALS_REJECTED envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "token expired", code: "CREDENTIALS_REJECTED" }, 503)),
    );
    await expect(api("/api/positions")).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(true);
  });

  it("does not mark restricted for an unrelated error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "not found" }, 404)),
    );
    await expect(api("/api/charts/x")).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(false);
  });
});
