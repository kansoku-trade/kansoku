import type { ProModule } from "@kansoku/pro-api";
import { afterEach, describe, expect, it } from "vitest";
import { loadPro } from "@kansoku/core/pro/loader";
import { freeHooks, registerProModule, unregisterProModuleForTests } from "@kansoku/core/pro/registry";
import { tsukiRequest } from "./helpers.js";

function fakeProModule(overrides: Partial<ProModule> = {}): ProModule {
  return { hooks: freeHooks, ...overrides };
}

function allFeatures(state: "absent" | "locked" | "active") {
  return { "symbol-follow": state, "deep-dive": state, "research-ai": state };
}

describe("GET /capabilities", () => {
  afterEach(async () => {
    await loadPro();
  });

  it("reports pro:false licensed:false when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ pro: false, licensed: false, features: allFeatures("absent") });
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
    expect((await res.json()).data).toEqual({
      pro: true,
      licensed: false,
      license: { state: "unlicensed" },
      features: allFeatures("locked"),
    });
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
      features: allFeatures("active"),
    });
  });
});
