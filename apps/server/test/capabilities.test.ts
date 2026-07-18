import type { ProModule } from "@kansoku/pro-api";
import { afterEach, describe, expect, it } from "vitest";
import { setLicenseManagerForTests, type LicenseManager } from "../../../packages/core/src/license/licenseState.js";
import { loadPro } from "../../../packages/core/src/pro/loader.js";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "../../../packages/core/src/pro/registry.js";
import { tsukiRequest } from "./helpers.js";

function fakeProModule(overrides: Partial<ProModule> = {}): ProModule {
  return { hooks: freeHooks, ...overrides };
}

function fakeLicenseManager(overrides: Partial<LicenseManager> = {}): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: "unlicensed" }),
    getBundleKey: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => ({}) as never,
    revalidate: async () => {},
    ...overrides,
  };
}

describe("GET /capabilities", () => {
  afterEach(async () => {
    setLicenseManagerForTests(null);
    await loadPro();
  });

  it("reports pro:false licensed:false when pro is absent", async () => {
    unregisterProModuleForTests();
    setLicenseManagerForTests(fakeLicenseManager());
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: "unlicensed" },
      hasEncBundle: false,
    });
  });

  it("reports pro:true licensed:false with an unlicensed snapshot", async () => {
    registerProModule(fakeProModule());
    setLicenseManagerForTests(fakeLicenseManager({ getLicenseSnapshot: () => ({ state: "unlicensed" }) }));
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: false,
      license: { state: "unlicensed" },
      hasEncBundle: false,
    });
  });

  it("reports pro:true licensed:true with a licensed snapshot", async () => {
    registerProModule(fakeProModule());
    setLicenseManagerForTests(
      fakeLicenseManager({
        getLicenseSnapshot: () => ({ state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" }),
      }),
    );
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: true,
      license: { state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" },
      hasEncBundle: false,
    });
  });
});
