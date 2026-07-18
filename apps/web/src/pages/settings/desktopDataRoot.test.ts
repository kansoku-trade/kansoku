import { describe, expect, it } from "vitest";
import {
  getDesktopDataRootBridge,
  isDataRootResetDisabled,
  type DataRootBridgeStatus,
} from "./desktopDataRoot";

function status(partial: Partial<DataRootBridgeStatus> = {}): DataRootBridgeStatus {
  return {
    effectivePath: "/tmp/trade",
    configuredPath: null,
    mode: "default",
    degraded: false,
    ...partial,
  };
}

describe("getDesktopDataRootBridge", () => {
  it("returns the data-root bridge when present", () => {
    const bridge = {
      get: async () => status(),
      pick: async () => {},
      reset: async () => {},
    };
    expect(getDesktopDataRootBridge({ desktop: { dataRoot: bridge } })).toBe(bridge);
  });

  it("returns null outside desktop", () => {
    expect(getDesktopDataRootBridge({})).toBeNull();
  });
});

describe("isDataRootResetDisabled", () => {
  it("disables when busy or status missing", () => {
    expect(isDataRootResetDisabled(null, false)).toBe(true);
    expect(isDataRootResetDisabled(status(), true)).toBe(true);
  });

  it("disables under env lock", () => {
    expect(isDataRootResetDisabled(status({ mode: "env" }), false)).toBe(true);
  });

  it("disables on plain default with nothing to clear", () => {
    expect(isDataRootResetDisabled(status(), false)).toBe(true);
  });

  it("enables when degraded even if mode is default", () => {
    expect(
      isDataRootResetDisabled(
        status({ mode: "default", degraded: true, configuredPath: "/bad" }),
        false,
      ),
    ).toBe(false);
  });

  it("enables when restart is pending", () => {
    expect(isDataRootResetDisabled(status({ restartPending: true }), false)).toBe(false);
  });

  it("enables in custom mode", () => {
    expect(
      isDataRootResetDisabled(
        status({ mode: "custom", configuredPath: "/custom" }),
        false,
      ),
    ).toBe(false);
  });

  it("enables when configuredPath is set under default mode", () => {
    expect(
      isDataRootResetDisabled(status({ configuredPath: "/pending-or-degraded" }), false),
    ).toBe(false);
  });
});
