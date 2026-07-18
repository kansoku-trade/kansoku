import { afterEach, describe, expect, it, vi } from "vitest";
import type { LicenseService } from "@kansoku/pro-api";
import { ClientError } from "../src/errors.js";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "../src/pro/registry.js";
import { featureState, featureStates, isFeatureActive, requireFeature } from "../src/pro/features.js";

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

describe("feature resolver", () => {
  it("is absent for a pro key when no pro module is present", async () => {
    await expect(featureState("symbol-follow")).resolves.toBe("absent");
    await expect(isFeatureActive("symbol-follow")).resolves.toBe(false);
    const err = await requireFeature("symbol-follow").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ status: 404 });
  });

  it("is locked for a pro key when pro is present without a license service", async () => {
    registerProModule({ hooks: freeHooks });
    await expect(featureState("deep-dive")).resolves.toBe("locked");
    const err = await requireFeature("deep-dive").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ status: 403, code: "LICENSE_REQUIRED" });
  });

  it("is locked for a pro key when unlicensed", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(false) });
    await expect(featureState("research-ai")).resolves.toBe("locked");
    await expect(isFeatureActive("research-ai")).resolves.toBe(false);
    const err = await requireFeature("research-ai").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ status: 403, code: "LICENSE_REQUIRED" });
  });

  it("is active for a pro key when licensed", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(true) });
    await expect(featureState("symbol-follow")).resolves.toBe("active");
    await expect(isFeatureActive("symbol-follow")).resolves.toBe(true);
    await expect(requireFeature("symbol-follow")).resolves.toBeUndefined();
  });

  it("featureStates resolves the license once and matches featureState per key", async () => {
    const license = licenseService(false);
    const spy = vi.spyOn(license, "isLicensed");
    registerProModule({ hooks: freeHooks, license });
    const states = await featureStates();
    expect(spy).toHaveBeenCalledTimes(1);
    for (const [key, state] of Object.entries(states)) {
      await expect(featureState(key as keyof typeof states)).resolves.toBe(state);
    }
  });
});

describe("free-tier feature", () => {
  afterEach(() => {
    vi.doUnmock("@kansoku/pro-api/features");
    vi.resetModules();
  });

  it("is always active regardless of pro module presence", async () => {
    vi.resetModules();
    vi.doMock("@kansoku/pro-api/features", () => ({
      FEATURES: { "fake-free": { tier: "free" } },
    }));
    const mod = await import("../src/pro/features.js");
    await expect(mod.featureState("fake-free" as never)).resolves.toBe("active");
    await expect(mod.isFeatureActive("fake-free" as never)).resolves.toBe(true);
    await expect(mod.requireFeature("fake-free" as never)).resolves.toBeUndefined();
  });
});
