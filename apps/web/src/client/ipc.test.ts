import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { getRestrictedModeSnapshotForTests, resetRestrictedModeForTests } from "../restrictedMode";
import { createIpcClient } from "./ipc";

describe("createIpcClient", () => {
  afterEach(() => {
    resetRestrictedModeForTests();
    vi.unstubAllGlobals();
  });

  it("returns null when window.desktop.rpc is absent", () => {
    vi.stubGlobal("window", {});
    expect(createIpcClient()).toBeNull();
  });

  it("invokes '<group>.<method>' channels and unwraps a successful envelope", async () => {
    const invoke = vi.fn(async (channel: string) => {
      expect(channel).toBe("positions.list");
      return { ok: true, data: { positions: [] } };
    });
    vi.stubGlobal("window", { desktop: { rpc: { invoke } } });

    const ipcClient = createIpcClient();
    expect(ipcClient).not.toBeNull();
    const result = await ipcClient!.positions.list();

    expect(result).toEqual({ positions: [] });
    expect(invoke).toHaveBeenCalledWith("positions.list", undefined);
  });

  it("passes input through to invoke", async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: { id: "abc" } }));
    vi.stubGlobal("window", { desktop: { rpc: { invoke } } });

    const ipcClient = createIpcClient()!;
    await ipcClient.charts.get({ id: "abc" });

    expect(invoke).toHaveBeenCalledWith("charts.get", { id: "abc" });
  });

  it("uses the independent LobeHub IPC group", async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: { status: "disconnected" } }));
    vi.stubGlobal("window", { desktop: { rpc: { invoke } } });

    const ipcClient = createIpcClient()!;
    await ipcClient.lobehub.getAccount();

    expect(invoke).toHaveBeenCalledWith("lobehub.getAccount", undefined);
  });

  it("throws ApiError for an ok:false envelope and marks restricted mode", async () => {
    const invoke = vi.fn(async () => ({ ok: false, error: "not configured", code: "NO_CREDENTIALS", status: 503 }));
    vi.stubGlobal("window", { desktop: { rpc: { invoke } } });

    const ipcClient = createIpcClient()!;
    await expect(ipcClient.positions.list()).rejects.toThrow(ApiError);
    expect(getRestrictedModeSnapshotForTests().restricted).toBe(true);
  });

  it("returns withMeta payloads as-is (already {data, meta} shaped)", async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: { data: { id: "x" }, meta: { created: true } } }));
    vi.stubGlobal("window", { desktop: { rpc: { invoke } } });

    const ipcClient = createIpcClient()!;
    const result = await ipcClient.charts.create({ type: "sepa" });

    expect(result).toEqual({ data: { id: "x" }, meta: { created: true } });
  });
});
