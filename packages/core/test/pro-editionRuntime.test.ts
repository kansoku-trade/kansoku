import { describe, expect, it } from "vitest";
import type { EditionActivation } from "../src/pro/editionLoader.js";
import { EditionRuntime } from "../src/pro/editionRuntime.js";

describe("EditionRuntime", () => {
  it("exposes status and edition for an active activation", () => {
    const activation: EditionActivation<{ kind: string }> = {
      state: "active",
      bundlePresent: true,
      keyId: "test-key",
      edition: { kind: "server" },
    };
    const runtime = new EditionRuntime(activation);
    expect(runtime.status).toEqual({ state: "active", bundlePresent: true, keyId: "test-key" });
    expect(runtime.edition).toEqual({ kind: "server" });
  });

  it("exposes status without an edition for a locked activation", () => {
    const activation: EditionActivation<{ kind: string }> = {
      state: "locked",
      bundlePresent: true,
    };
    const runtime = new EditionRuntime(activation);
    expect(runtime.status).toEqual({ state: "locked", bundlePresent: true, keyId: undefined });
    expect(runtime.edition).toBeUndefined();
  });
});
