import { describe, expect, it } from "vitest";
import { buildDataRootStatus } from "@desktop/dataRoot/status.js";

describe("buildDataRootStatus", () => {
  const userData = "/Users/x/Library/Application Support/Kansoku";
  const custom = "/Users/me/git/trade";

  it("labels unpackaged boots as dev-repo", () => {
    expect(
      buildDataRootStatus({
        isPackaged: false,
        userDataPath: userData,
        configuredPath: null,
        effectivePath: "/repo",
        customPathUsable: false,
      }),
    ).toEqual({
      effectivePath: "/repo",
      configuredPath: null,
      mode: "dev-repo",
      degraded: false,
    });
  });

  it("labels env override as env even when a custom path is configured", () => {
    expect(
      buildDataRootStatus({
        isPackaged: true,
        envOverride: "/explicit/override",
        userDataPath: userData,
        configuredPath: custom,
        effectivePath: "/explicit/override",
        customPathUsable: true,
      }),
    ).toEqual({
      effectivePath: "/explicit/override",
      configuredPath: custom,
      mode: "env",
      degraded: false,
    });
  });

  it("labels a usable packaged custom path as custom", () => {
    expect(
      buildDataRootStatus({
        isPackaged: true,
        userDataPath: userData,
        configuredPath: custom,
        effectivePath: custom,
        customPathUsable: true,
      }),
    ).toEqual({
      effectivePath: custom,
      configuredPath: custom,
      mode: "custom",
      degraded: false,
    });
  });

  it("labels packaged default with no preference as default", () => {
    expect(
      buildDataRootStatus({
        isPackaged: true,
        userDataPath: userData,
        configuredPath: null,
        effectivePath: userData,
        customPathUsable: false,
      }),
    ).toEqual({
      effectivePath: userData,
      configuredPath: null,
      mode: "default",
      degraded: false,
    });
  });

  it("marks degraded when packaged custom path is configured but unusable", () => {
    expect(
      buildDataRootStatus({
        isPackaged: true,
        userDataPath: userData,
        configuredPath: "/gone/path",
        effectivePath: userData,
        customPathUsable: false,
      }),
    ).toEqual({
      effectivePath: userData,
      configuredPath: "/gone/path",
      mode: "default",
      degraded: true,
      degradedReason: "configured data root is missing or not writable",
    });
  });

  it("does not mark degraded under env override when custom is unusable", () => {
    expect(
      buildDataRootStatus({
        isPackaged: true,
        envOverride: "/explicit/override",
        userDataPath: userData,
        configuredPath: "/gone/path",
        effectivePath: "/explicit/override",
        customPathUsable: false,
      }),
    ).toEqual({
      effectivePath: "/explicit/override",
      configuredPath: "/gone/path",
      mode: "env",
      degraded: false,
    });
  });

  it("does not mark degraded in unpackaged mode even if a path is passed", () => {
    expect(
      buildDataRootStatus({
        isPackaged: false,
        userDataPath: userData,
        configuredPath: custom,
        effectivePath: "/repo",
        customPathUsable: false,
      }),
    ).toEqual({
      effectivePath: "/repo",
      configuredPath: custom,
      mode: "dev-repo",
      degraded: false,
    });
  });
});
