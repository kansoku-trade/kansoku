import { describe, expect, it, vi } from "vitest";
import { getExternalApiBridge, maskToken, type ExternalApiBridge } from "./externalApiClient";

describe("getExternalApiBridge", () => {
  it("returns null when window is undefined", () => {
    expect(getExternalApiBridge(undefined)).toBeNull();
  });

  it("returns null when desktop is not present", () => {
    expect(getExternalApiBridge({})).toBeNull();
  });

  it("returns null when desktop.externalApi is not present (dev / non-desktop web)", () => {
    expect(getExternalApiBridge({ desktop: { versions: {} } })).toBeNull();
  });

  it("returns the bridge when present", () => {
    const bridge: ExternalApiBridge = {
      getState: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      resetToken: vi.fn(),
    };
    expect(getExternalApiBridge({ desktop: { externalApi: bridge } })).toBe(bridge);
  });
});

describe("maskToken", () => {
  it("shows a prefix and suffix for a normal token", () => {
    expect(maskToken("abcdefghijklmnopqrstuvwxyz")).toBe("abcdef…wxyz");
  });

  it("fully masks very short tokens", () => {
    expect(maskToken("abc")).toBe("•••");
  });
});
