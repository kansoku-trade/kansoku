import { describe, expect, it } from "vitest";
import { getDesktopCredentialsBridge } from "./desktopCredentials";

describe("getDesktopCredentialsBridge", () => {
  it("returns the read-only desktop CLI bridge when present", () => {
    const bridge = { get: async () => ({ configured: true, state: "ready" as const, cliPath: "/bin/longbridge", lastError: null }) };
    expect(getDesktopCredentialsBridge({ desktop: { credentials: bridge } })).toBe(bridge);
  });

  it("returns null outside desktop", () => {
    expect(getDesktopCredentialsBridge({})).toBeNull();
  });
});
