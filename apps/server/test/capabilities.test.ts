import type { ProModule } from "@kansoku/pro-api";
import { afterEach, describe, expect, it } from "vitest";
import { loadPro } from "../../../packages/core/src/pro/loader.js";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "../../../packages/core/src/pro/registry.js";
import { tsukiRequest } from "./helpers.js";

function fakeProModule(overrides: Partial<ProModule> = {}): ProModule {
  return { hooks: freeHooks, ...overrides };
}

describe("GET /capabilities", () => {
  afterEach(async () => {
    await loadPro();
  });

  it("reports pro:false licensed:false when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ pro: false, licensed: false });
  });

  it("reports pro:true licensed:false with an unlicensed snapshot", async () => {
    registerProModule(
      fakeProModule({
        license: {
          status: async () => ({ state: "unlicensed" }),
          activate: async () => ({ activated: true }),
          deactivate: async () => ({ deactivated: true }),
          isLicensed: async () => false,
        },
      }),
    );
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ pro: true, licensed: false, license: { state: "unlicensed" } });
  });

  it("reports pro:true licensed:true with a licensed snapshot", async () => {
    registerProModule(
      fakeProModule({
        license: {
          status: async () => ({ state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" }),
          activate: async () => ({ activated: true }),
          deactivate: async () => ({ deactivated: true }),
          isLicensed: async () => true,
        },
      }),
    );
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: true,
      license: { state: "licensed", deviceName: "my-mac", maskedKey: "••••7890" },
    });
  });
});
