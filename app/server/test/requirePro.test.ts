import { afterEach, describe, expect, it } from "vitest";
import { loadPro } from "../../packages/core/src/pro/loader.js";
import { unregisterProModuleForTests } from "../../packages/core/src/pro/registry.js";
import { tsukiRequest } from "./helpers.js";

describe("requirePro guard", () => {
  afterEach(async () => {
    await loadPro();
  });

  it("returns 404 for the symbols deep-dive route when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/symbols/MU/deep-dive/status");
    expect(res.status).toBe(404);
  });

  it("returns 404 for the license status route when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/license/status");
    expect(res.status).toBe(404);
  });

  it("reports pro:false via /capabilities when pro is absent", async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ pro: false, licensed: false });
  });
});
