import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  createUpdaterHandle,
  isNewerVersion,
  parseLatestRelease,
  shouldCheck,
  startUpdater,
  type UpdaterDeps,
} from "../../src/updater/updater.js";
import { createUpdaterStatusStore } from "../../src/updater/status.js";
import type { SparkleBridge } from "../../src/updater/sparkle.js";

function mockBridge(overrides: Partial<SparkleBridge> = {}): SparkleBridge {
  return {
    init: vi.fn().mockReturnValue(true),
    checkForUpdates: vi.fn(),
    installUpdateNow: vi.fn(),
    setAutomaticChecks: vi.fn(),
    ...overrides,
  };
}

describe("isNewerVersion", () => {
  it.each([
    ["1.0.0", "1.0.1", true],
    ["1.0.0", "1.0.0", false],
    ["1.2.0", "1.1.9", false],
    ["v1.0.0", "1.0.1", true],
    ["1.0.0", "v1.0.1", true],
    ["desktop-v1.0.0", "desktop-v1.0.1", true],
    ["desktop-v1.0.1", "1.0.0", false],
    ["1.0.0", "not-a-version", false],
    ["garbage", "1.0.0", true],
    ["1.0", "1.0.1", true],
    ["1.0.0", "1.0.0.1", true],
  ])("isNewerVersion(%s, %s) -> %s", (current, latest, expected) => {
    expect(isNewerVersion(current, latest)).toBe(expected);
  });
});

describe("shouldCheck", () => {
  const now = "2026-07-11T12:00:00.000Z";

  it("checks when there is no prior record", () => {
    expect(shouldCheck(null, now)).toBe(true);
  });

  it("checks when the record is malformed", () => {
    expect(shouldCheck("not-a-date", now)).toBe(true);
  });

  it("does not check inside 1h", () => {
    const last = "2026-07-11T11:00:01.000Z";
    expect(shouldCheck(last, now)).toBe(false);
  });

  it("checks once past 1h", () => {
    const last = "2026-07-11T10:58:59.000Z";
    expect(shouldCheck(last, now)).toBe(true);
  });
});

describe("parseLatestRelease", () => {
  it("parses a normal release payload", () => {
    expect(
      parseLatestRelease({
        tag_name: "desktop-v1.2.3",
        html_url: "https://github.com/Innei/kansoku/releases/tag/desktop-v1.2.3",
        draft: false,
      }),
    ).toEqual({
      version: "desktop-v1.2.3",
      htmlUrl: "https://github.com/Innei/kansoku/releases/tag/desktop-v1.2.3",
    });
  });

  it("rejects a draft release", () => {
    expect(
      parseLatestRelease({ tag_name: "v1.0.0", html_url: "https://x", draft: true }),
    ).toBeNull();
  });

  it("rejects a payload missing html_url", () => {
    expect(parseLatestRelease({ tag_name: "v1.0.0" })).toBeNull();
  });

  it("rejects a payload missing tag_name", () => {
    expect(parseLatestRelease({ html_url: "https://x" })).toBeNull();
  });

  it("rejects null", () => {
    expect(parseLatestRelease(null)).toBeNull();
  });

  it("rejects a non-object (e.g. 404 body)", () => {
    expect(parseLatestRelease({ message: "Not Found" })).toBeNull();
  });

  it("rejects malformed shapes", () => {
    expect(parseLatestRelease("not json")).toBeNull();
    expect(parseLatestRelease(42)).toBeNull();
  });
});

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

function makeDeps(overrides: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    currentVersion: "1.0.0",
    now: () => "2026-07-11T12:00:00.000Z",
    fetchJson: vi.fn().mockResolvedValue({
      tag_name: "desktop-v1.1.0",
      html_url: "https://github.com/Innei/kansoku/releases/tag/desktop-v1.1.0",
      draft: false,
    }),
    readLastCheck: vi.fn().mockResolvedValue(null),
    writeLastCheck: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    ...overrides,
  };
}

describe("checkForUpdate", () => {
  it("notifies when a newer release exists and persists the check timestamp", async () => {
    const deps = makeDeps();
    await checkForUpdate(deps);
    expect(deps.notify).toHaveBeenCalledWith({
      version: "desktop-v1.1.0",
      htmlUrl: "https://github.com/Innei/kansoku/releases/tag/desktop-v1.1.0",
    });
    expect(deps.writeLastCheck).toHaveBeenCalledWith("2026-07-11T12:00:00.000Z");
  });

  it("skips the network call entirely when the throttle blocks it", async () => {
    const deps = makeDeps({ readLastCheck: vi.fn().mockResolvedValue("2026-07-11T11:30:00.000Z") });
    await checkForUpdate(deps);
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does not notify when the latest release is not newer", async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        tag_name: "desktop-v1.0.0",
        html_url: "https://x",
        draft: false,
      }),
    });
    await checkForUpdate(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.writeLastCheck).toHaveBeenCalled();
  });

  it("stays silent when the fetch rejects (offline / rate-limit)", async () => {
    const deps = makeDeps({ fetchJson: vi.fn().mockRejectedValue(new Error("network down")) });
    await expect(checkForUpdate(deps)).resolves.toEqual({
      kind: "fetch-failed",
      message: "network down",
    });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("stays silent when the response parses to null (404 / draft-only repo)", async () => {
    const deps = makeDeps({ fetchJson: vi.fn().mockResolvedValue({ message: "Not Found" }) });
    await checkForUpdate(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.writeLastCheck).toHaveBeenCalled();
  });

  it("bypasses throttle when force is true", async () => {
    const deps = makeDeps({
      force: true,
      readLastCheck: vi.fn().mockResolvedValue("2026-07-11T11:30:00.000Z"),
    });
    const result = await checkForUpdate(deps);
    expect(deps.fetchJson).toHaveBeenCalled();
    expect(result.kind).toBe("available");
  });

  it("returns up-to-date when force check finds no newer release", async () => {
    const deps = makeDeps({
      force: true,
      fetchJson: vi.fn().mockResolvedValue({
        tag_name: "desktop-v1.0.0",
        html_url: "https://x",
        draft: false,
      }),
    });
    const result = await checkForUpdate(deps);
    expect(result).toEqual({ kind: "up-to-date", current: "1.0.0", latest: "desktop-v1.0.0" });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does not notify when silent and a newer release exists", async () => {
    const deps = makeDeps({ silent: true });
    const result = await checkForUpdate(deps);
    expect(result.kind).toBe("available");
    expect(deps.notify).not.toHaveBeenCalled();
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
