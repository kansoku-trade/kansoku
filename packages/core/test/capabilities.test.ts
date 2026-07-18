import { afterEach, describe, expect, it } from "vitest";
import type { LicenseService } from "@kansoku/pro-api";
import { FEATURES, type FeatureTier } from "@kansoku/pro-api/features";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "../src/pro/registry.js";
import { capabilitiesService } from "../src/modules/capabilities/capabilities.service.js";

const featureKeys = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;

function licenseService(licensed: boolean): LicenseService {
  return {
    status: async () => ({ state: licensed ? "licensed" : "unlicensed" }),
    activate: async () => ({ activated: true }),
    deactivate: async () => ({ deactivated: true }),
    isLicensed: async () => licensed,
  };
}

afterEach(() => {
  unregisterProModuleForTests();
});

describe("capabilitiesService.get", () => {
  it("marks every pro-tier key absent when no pro module is present", async () => {
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(false);
    expect(result.licensed).toBe(false);
    for (const key of featureKeys) {
      expect(result.features).toHaveProperty(key);
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === "free" ? "active" : "absent");
    }
  });

  it("marks pro-tier keys locked when pro is registered but unlicensed", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(false) });
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(false);
    for (const key of featureKeys) {
      const tier = FEATURES[key].tier as FeatureTier;
      expect(result.features[key]).toBe(tier === "free" ? "active" : "locked");
    }
  });

  it("marks pro-tier keys active when pro is registered and licensed", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(true) });
    const result = await capabilitiesService.get();
    expect(result.pro).toBe(true);
    expect(result.licensed).toBe(true);
    for (const key of featureKeys) {
      expect(result.features[key]).toBe("active");
    }
  });
});
