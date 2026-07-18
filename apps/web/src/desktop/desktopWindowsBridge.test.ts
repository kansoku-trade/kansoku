import { describe, expect, it, vi } from "vitest";
import { getPopoutBridge, getWindowsBridge } from "./desktopWindowsBridge";

describe("getWindowsBridge", () => {
  it("returns null when desktop.windows is absent", () => {
    expect(getWindowsBridge({})).toBeNull();
  });

  it("returns null when getContext or reportActiveTab is missing", () => {
    expect(getWindowsBridge({ desktop: { windows: { getContext: vi.fn() } } })).toBeNull();
    expect(getWindowsBridge({ desktop: { windows: { reportActiveTab: vi.fn() } } })).toBeNull();
  });

  it("returns the bridge when both methods are present", () => {
    const windows = { getContext: vi.fn(), reportActiveTab: vi.fn() };
    expect(getWindowsBridge({ desktop: { windows } })).toBe(windows);
  });
});

describe("getPopoutBridge", () => {
  it("returns null when desktop.windows is absent", () => {
    expect(getPopoutBridge({})).toBeNull();
  });

  it("returns null when openPopout is missing", () => {
    expect(getPopoutBridge({ desktop: { windows: { getContext: vi.fn() } } })).toBeNull();
  });

  it("returns the bridge when openPopout is present", () => {
    const windows = { openPopout: vi.fn(async () => {}) };
    expect(getPopoutBridge({ desktop: { windows } })).toBe(windows);
  });
});
