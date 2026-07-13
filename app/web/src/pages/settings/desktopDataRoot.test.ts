import { describe, expect, it } from "vitest";
import { getDesktopDataRootBridge } from "./desktopDataRoot";

describe("getDesktopDataRootBridge", () => {
  it("returns the data-root bridge when present", () => {
    const bridge = {
      get: async () => ({
        effectivePath: "/tmp/trade",
        configuredPath: null,
        mode: "default" as const,
        degraded: false,
      }),
      pick: async () => {},
      reset: async () => {},
    };
    expect(getDesktopDataRootBridge({ desktop: { dataRoot: bridge } })).toBe(bridge);
  });

  it("returns null outside desktop", () => {
    expect(getDesktopDataRootBridge({})).toBeNull();
  });
});
