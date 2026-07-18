import { describe, expect, it } from "vitest";
import { resolveSparkleAddonPath, loadSparkleBridge } from "../../src/updater/sparkle.js";

const moduleUrl = "file:///Users/x/apps/desktop/dist-main/sparkle.mjs";

describe("resolveSparkleAddonPath", () => {
  it("resolves inside app.asar.unpacked when packaged", () => {
    const path = resolveSparkleAddonPath({
      isPackaged: true,
      resourcesPath: "/Applications/Kansoku.app/Contents/Resources",
      moduleUrl,
    });
    expect(path).toBe(
      "/Applications/Kansoku.app/Contents/Resources/app.asar.unpacked/native/sparkle-bridge/build/Release/sparkle_bridge.node",
    );
  });

  it("resolves next to the native build dir in dev", () => {
    const path = resolveSparkleAddonPath({
      isPackaged: false,
      resourcesPath: "/unused",
      moduleUrl,
    });
    expect(path).toBe("/Users/x/apps/desktop/native/sparkle-bridge/build/Release/sparkle_bridge.node");
  });
});

describe("loadSparkleBridge", () => {
  it("returns null when the addon module cannot be found", () => {
    const logs: string[] = [];
    const bridge = loadSparkleBridge({
      isPackaged: false,
      resourcesPath: "/unused",
      moduleUrl,
      log: (m) => logs.push(m),
    });
    expect(bridge).toBeNull();
    expect(logs.some((m) => m.includes("addon load failed"))).toBe(true);
  });
});
