import { afterEach, describe, expect, it } from "vitest";
import { unregisterProModuleForTests } from "../../packages/core/src/pro/registry.js";
import { registerBuiltinProServer } from "../src/pro/registerBuiltin.js";
import { tsukiRequest } from "./helpers.js";

describe("requirePro guard", () => {
  afterEach(() => {
    registerBuiltinProServer();
  });

  it("returns 404 for a mixed-module AI sub-route when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/settings/ai");
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBe(false);
  });

  it("returns 404 for the symbols deep-dive route when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/symbols/MU/deep-dive/status");
    expect(res.status).toBe(404);
  });

  it("returns 404 for the overview usage route when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/overview/usage");
    expect(res.status).toBe(404);
  });

  it("reports pro:false via /capabilities when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ pro: false, licensed: false });
  });
});
