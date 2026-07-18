import { describe, expect, it, vi } from "vitest";
import { createUpdaterHandle, startUpdater } from "@desktop/updater/updater.js";
import { createUpdaterStatusStore } from "@desktop/updater/status.js";
import type { SparkleBridge } from "electron-sparkle-updater";

function mockBridge(overrides: Partial<SparkleBridge> = {}): SparkleBridge {
  return {
    init: vi.fn().mockReturnValue(true),
    checkForUpdates: vi.fn(),
    installUpdateNow: vi.fn(),
    setAutomaticChecks: vi.fn(),
    ...overrides,
  };
}

describe("startUpdater", () => {
  const sparkleOptions = { appcastUrl: "https://x/appcast.xml", publicEdKey: "placeholder" };

  it("uses the sparkle bridge when init succeeds", () => {
    const runWeakChecker = vi.fn();
    const bridge = mockBridge();
    const result = startUpdater({ sparkleBridge: bridge, sparkleOptions, runWeakChecker });
    expect(result).toBe("sparkle");
    expect(bridge.init).toHaveBeenCalledWith(sparkleOptions);
    expect(runWeakChecker).not.toHaveBeenCalled();
  });

  it("falls back to the weak checker when the bridge is missing (addon not found)", () => {
    const runWeakChecker = vi.fn();
    const result = startUpdater({ sparkleBridge: null, sparkleOptions, runWeakChecker });
    expect(result).toBe("weak");
    expect(runWeakChecker).toHaveBeenCalledOnce();
  });

  it("falls back to the weak checker when init returns false (framework missing)", () => {
    const runWeakChecker = vi.fn();
    const bridge = mockBridge({ init: vi.fn().mockReturnValue(false) });
    const result = startUpdater({ sparkleBridge: bridge, sparkleOptions, runWeakChecker });
    expect(result).toBe("weak");
    expect(runWeakChecker).toHaveBeenCalledOnce();
  });

  it("falls back to the weak checker when init throws", () => {
    const runWeakChecker = vi.fn();
    const bridge = mockBridge({
      init: vi.fn().mockImplementation(() => {
        throw new Error("dlopen failed");
      }),
    });
    const result = startUpdater({ sparkleBridge: bridge, sparkleOptions, runWeakChecker });
    expect(result).toBe("weak");
    expect(runWeakChecker).toHaveBeenCalledOnce();
  });
});

describe("createUpdaterHandle", () => {
  it("shows a dev dialog and does not touch sparkle or weak check", () => {
    const showMessage = vi.fn();
    const bridge = mockBridge();
    const runWeakCheck = vi.fn();
    const handle = createUpdaterHandle({
      mode: "dev",
      sparkleBridge: bridge,
      showMessage,
      runWeakCheck,
    });
    handle.checkNow();
    expect(showMessage).toHaveBeenCalledWith({
      type: "info",
      title: "检查更新",
      message: "开发模式不检查更新。",
    });
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
    expect(runWeakCheck).not.toHaveBeenCalled();
  });

  it("calls sparkle checkForUpdates in sparkle mode", () => {
    const bridge = mockBridge();
    const handle = createUpdaterHandle({
      mode: "sparkle",
      sparkleBridge: bridge,
      showMessage: vi.fn(),
    });
    handle.checkNow();
    expect(bridge.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("calls sparkle installUpdateNow from installNow", () => {
    const bridge = mockBridge();
    const handle = createUpdaterHandle({
      mode: "sparkle",
      sparkleBridge: bridge,
      showMessage: vi.fn(),
    });
    handle.installNow();
    expect(bridge.installUpdateNow).toHaveBeenCalledOnce();
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
  });

  it("force-runs the weak checker and reports up-to-date", async () => {
    const showMessage = vi.fn();
    const runWeakCheck = vi.fn().mockResolvedValue({
      kind: "up-to-date",
      current: "1.0.0",
      latest: "1.0.0",
    });
    const handle = createUpdaterHandle({
      mode: "weak",
      showMessage,
      runWeakCheck,
    });
    handle.checkNow();
    await vi.waitFor(() => {
      expect(showMessage).toHaveBeenCalledWith({
        type: "info",
        title: "检查更新",
        message: "已是最新版本。",
      });
    });
    expect(runWeakCheck).toHaveBeenCalledWith(true, false);
  });

  it("silentCheckOnActivate runs a silent throttled check and updates status", async () => {
    const statusStore = createUpdaterStatusStore();
    const runWeakCheck = vi.fn().mockResolvedValue({
      kind: "available",
      release: { version: "2.0.0", htmlUrl: "https://example.com/2" },
    });
    const handle = createUpdaterHandle({
      mode: "weak",
      statusStore,
      runWeakCheck,
      showMessage: vi.fn(),
    });
    handle.silentCheckOnActivate();
    await vi.waitFor(() => {
      expect(statusStore.get()).toEqual({
        kind: "available",
        version: "2.0.0",
        htmlUrl: "https://example.com/2",
      });
    });
    expect(runWeakCheck).toHaveBeenCalledWith(false, true);
  });

  it("installNow opens the release page in weak mode when available", () => {
    const statusStore = createUpdaterStatusStore({
      kind: "available",
      version: "2.0.0",
      htmlUrl: "https://example.com/2",
    });
    const openRelease = vi.fn();
    const handle = createUpdaterHandle({
      mode: "weak",
      statusStore,
      openRelease,
      showMessage: vi.fn(),
    });
    handle.installNow();
    expect(openRelease).toHaveBeenCalledWith("https://example.com/2");
  });

  it("does nothing on silentCheck in dev mode", () => {
    const runWeakCheck = vi.fn();
    const handle = createUpdaterHandle({
      mode: "dev",
      runWeakCheck,
      showMessage: vi.fn(),
    });
    handle.silentCheckOnActivate();
    expect(runWeakCheck).not.toHaveBeenCalled();
  });
});
