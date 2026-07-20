import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

const service = vi.hoisted(() => ({
  status: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
}));
vi.mock("../../../../packages/core/src/license/license.service.js", () => ({ licenseService: service }));

const relaunchPrompt = vi.hoisted(() => vi.fn());
vi.mock("../../src/boot/proRelaunch.js", () => ({
  maybePromptProRelaunchAfterKeyLanded: relaunchPrompt,
}));

const { LicenseIpc } = await import("../../src/kernel/ipc/licenseIpc.js");

beforeEach(() => {
  service.status.mockReset();
  service.activate.mockReset();
  service.deactivate.mockReset();
  relaunchPrompt.mockReset();
});

describe("desktop license ipc", () => {
  it("registers under the license group", () => {
    expect(LicenseIpc.groupName).toBe("license");
  });

  it("serves status through the core license service", async () => {
    service.status.mockResolvedValue({ state: "unlicensed" });
    const instance = new LicenseIpc();
    const result = await instance.status();
    expect(result).toEqual({ ok: true, data: { state: "unlicensed" } });
  });

  it("serves activate through the core license service", async () => {
    service.activate.mockResolvedValue({ activated: true });
    const instance = new LicenseIpc();
    const result = await instance.activate({ key: "lic_1" });
    expect(service.activate).toHaveBeenCalledWith("lic_1");
    expect(result).toEqual({ ok: true, data: { activated: true } });
  });

  it("prompts for a pro relaunch after a successful activation", async () => {
    service.activate.mockResolvedValue({ activated: true });
    const instance = new LicenseIpc();
    await instance.activate({ key: "lic_1" });
    expect(relaunchPrompt).toHaveBeenCalledTimes(1);
  });

  it("does not prompt for a relaunch when activation fails", async () => {
    service.activate.mockResolvedValue({ activated: false, error: "invalid" });
    const instance = new LicenseIpc();
    await instance.activate({ key: "lic_bad" });
    expect(relaunchPrompt).not.toHaveBeenCalled();
  });

  it("serves deactivate through the core license service", async () => {
    service.deactivate.mockResolvedValue({ deactivated: true });
    const instance = new LicenseIpc();
    const result = await instance.deactivate();
    expect(result).toEqual({ ok: true, data: { deactivated: true } });
  });
});
