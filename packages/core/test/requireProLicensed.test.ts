import { afterEach, describe, expect, it } from "vitest";
import type { LicenseService } from "@kansoku/pro-api";
import { ClientError } from "../src/errors.js";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "../src/pro/registry.js";
import { isProLicensed, requireProLicensed } from "../src/pro/requirePro.js";

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

describe("pro license gate", () => {
  it("reports unlicensed when no pro module is present", async () => {
    await expect(isProLicensed()).resolves.toBe(false);
    await expect(requireProLicensed()).rejects.toMatchObject({ status: 404 });
  });

  it("reports unlicensed when pro is present without a license service", async () => {
    registerProModule({ hooks: freeHooks });
    await expect(isProLicensed()).resolves.toBe(false);
    await expect(requireProLicensed()).rejects.toMatchObject({ status: 403, code: "LICENSE_REQUIRED" });
  });

  it("rejects with 403 LICENSE_REQUIRED when the license is inactive", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(false) });
    await expect(isProLicensed()).resolves.toBe(false);
    const err = await requireProLicensed().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ status: 403, code: "LICENSE_REQUIRED" });
  });

  it("passes when the license is active", async () => {
    registerProModule({ hooks: freeHooks, license: licenseService(true) });
    await expect(isProLicensed()).resolves.toBe(true);
    await expect(requireProLicensed()).resolves.toBeUndefined();
  });
});
