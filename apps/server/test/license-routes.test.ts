import { afterEach, describe, expect, it } from "vitest";
import { setLicenseManagerForTests, type LicenseManager } from "@kansoku/core/license/licenseState";
import { tsukiRequest } from "./helpers.js";

function fakeManager(overrides: Partial<LicenseManager> = {}): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: "unlicensed" }),
    getBundleKey: () => undefined,
    getBundleKeyId: () => undefined,
    activate: async () => ({ activated: true }),
    deactivate: async () => {},
    revalidate: async () => {},
    ...overrides,
  };
}

describe("license routes", () => {
  afterEach(() => {
    setLicenseManagerForTests(null);
  });

  it("GET /license/status returns the current snapshot", async () => {
    setLicenseManagerForTests(
      fakeManager({
        getLicenseSnapshot: () => ({ state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" }),
      }),
    );
    const res = await tsukiRequest("/api/license/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" });
  });

  it("POST /license/activate forwards the key and returns the result", async () => {
    const activate = async (key: string) => (key === "lic_valid" ? { activated: true as const } : { activated: false as const, error: "bad key" });
    setLicenseManagerForTests(fakeManager({ activate }));

    const ok = await tsukiRequest("/api/license/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "lic_valid" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ activated: true });

    const bad = await tsukiRequest("/api/license/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "lic_bad" }),
    });
    expect(bad.status).toBe(200);
    expect((await bad.json()).data).toEqual({ activated: false, error: "bad key" });
  });

  it("POST /license/activate rejects a missing key with 400", async () => {
    setLicenseManagerForTests(fakeManager());
    const res = await tsukiRequest("/api/license/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /license/deactivate clears the license", async () => {
    let deactivated = false;
    setLicenseManagerForTests(
      fakeManager({
        deactivate: async () => {
          deactivated = true;
        },
      }),
    );
    const res = await tsukiRequest("/api/license/deactivate", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ deactivated: true });
    expect(deactivated).toBe(true);
  });

  it("works with pro absent (free build): unlicensed status, not 404", async () => {
    const { loadPro } = await import("@kansoku/core/pro/loader");
    const { setProPresent } = await import("@kansoku/core/pro/bundleState");
    setProPresent(false);
    setLicenseManagerForTests(fakeManager());
    try {
      const res = await tsukiRequest("/api/license/status");
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ state: "unlicensed" });
    } finally {
      await loadPro();
    }
  });
});
