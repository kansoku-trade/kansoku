import type { IpcServiceConstructor } from "electron-ipc-decorator";
import { describe, expect, it } from "vitest";
import { gateLicensedIpc } from "../../src/ipc/licenseGateIpc.js";

// A fresh class per test: gateLicensedIpc mutates Ctor.prototype in place, so
// reusing one class across tests with different isLicensed closures would
// stack gates from earlier tests underneath the latest one.
function makePingIpc() {
  return class FakeIpc {
    static readonly groupName = "fake";
    async ping() {
      return { ok: true, data: "pong" };
    }
  };
}

describe("gateLicensedIpc", () => {
  it("returns a LICENSE_REQUIRED envelope instead of calling through when unlicensed", async () => {
    const Gated = gateLicensedIpc(makePingIpc() as unknown as IpcServiceConstructor, () => false);
    const instance = new Gated() as unknown as { ping(): Promise<unknown> };
    const result = await instance.ping();
    expect(result).toEqual({
      ok: false,
      error: "AI features require an active license",
      code: "LICENSE_REQUIRED",
      status: 403,
    });
  });

  it("calls through to the original method when licensed", async () => {
    const Gated = gateLicensedIpc(makePingIpc() as unknown as IpcServiceConstructor, () => true);
    const instance = new Gated() as unknown as { ping(): Promise<unknown> };
    const result = await instance.ping();
    expect(result).toEqual({ ok: true, data: "pong" });
  });

  it("only gates the listed methods, leaving others untouched", async () => {
    class MultiMethod {
      static readonly groupName = "fake";
      async gated() {
        return "gated";
      }
      async ungated() {
        return "ungated";
      }
    }
    const Gated = gateLicensedIpc(MultiMethod as unknown as IpcServiceConstructor, () => false, ["gated"]);
    const instance = new Gated() as unknown as MultiMethod;
    expect(await instance.ungated()).toBe("ungated");
    expect(await instance.gated()).toEqual({
      ok: false,
      error: "AI features require an active license",
      code: "LICENSE_REQUIRED",
      status: 403,
    });
  });
});
