import { describe, expect, it, vi } from "vitest";
import { createCredentialsBridgeHandlers, registerCredentialsIpc } from "../src/credentialsBridge.js";
import { CREDENTIALS_CHANNELS } from "../src/credentialsChannels.js";
import type { DesktopCredentialProvider } from "../src/desktopCredentialProvider.js";

const CREDS = { appKey: "k", appSecret: "s", accessToken: "t" };

function fakeProvider(overrides: Partial<DesktopCredentialProvider> = {}): DesktopCredentialProvider {
  return {
    getLongbridgeCredentials: vi.fn().mockResolvedValue(null),
    onChange: vi.fn(() => () => {}),
    setCredentials: vi.fn().mockReturnValue({ ok: true }),
    clearCredentials: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(false),
    lastError: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe("createCredentialsBridgeHandlers", () => {
  it("get() never returns secrets, only a configured flag and lastError", () => {
    const provider = fakeProvider({ isConfigured: () => true, lastError: () => null });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials: vi.fn() });
    expect(handlers.get()).toEqual({ configured: true, lastError: null });
  });

  it("get() surfaces the provider's lastError so the UI can tell 未配置 apart from a store failure", () => {
    const provider = fakeProvider({ isConfigured: () => false, lastError: () => "corrupt credentials file" });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials: vi.fn() });
    expect(handlers.get()).toEqual({ configured: false, lastError: "corrupt credentials file" });
  });

  it("set() delegates to the provider and returns its result", () => {
    const provider = fakeProvider();
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials: vi.fn() });
    const result = handlers.set(CREDS);
    expect(provider.setCredentials).toHaveBeenCalledWith(CREDS);
    expect(result).toEqual({ ok: true });
  });

  it("clear() delegates to the provider", () => {
    const provider = fakeProvider();
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials: vi.fn() });
    handlers.clear();
    expect(provider.clearCredentials).toHaveBeenCalledOnce();
  });

  it("test() calls the injected test function and does not persist", async () => {
    const provider = fakeProvider();
    const testCredentials = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials });
    const result = await handlers.test(CREDS);
    expect(testCredentials).toHaveBeenCalledWith(CREDS);
    expect(result).toEqual({ ok: true });
    expect(provider.setCredentials).not.toHaveBeenCalled();
  });

  it("test() rejects a second concurrent call while one is in flight", async () => {
    const provider = fakeProvider();
    let resolveFirst: (v: { ok: true }) => void = () => {};
    const testCredentials = vi.fn().mockImplementation(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials });

    const first = handlers.test(CREDS);
    const second = await handlers.test(CREDS);
    expect(second).toEqual({ ok: false, error: "a credential test is already running" });

    resolveFirst({ ok: true });
    await first;
  });

  it("test() rate-limits a second call within the 2s gap after completion", async () => {
    const provider = fakeProvider();
    let clock = 0;
    const testCredentials = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials, now: () => clock });

    await handlers.test(CREDS);
    clock += 500;
    const second = await handlers.test(CREDS);
    expect(second).toEqual({ ok: false, error: "please wait 2s before retrying" });
    expect(testCredentials).toHaveBeenCalledTimes(1);
  });

  it("test() allows a new call once the 2s gap has passed", async () => {
    const provider = fakeProvider();
    let clock = 0;
    const testCredentials = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials, now: () => clock });

    await handlers.test(CREDS);
    clock += 2_000;
    const second = await handlers.test(CREDS);
    expect(second).toEqual({ ok: true });
    expect(testCredentials).toHaveBeenCalledTimes(2);
  });

  it("test() clears the in-flight guard even when the test function rejects", async () => {
    const provider = fakeProvider();
    let clock = 0;
    const testCredentials = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true });
    const handlers = createCredentialsBridgeHandlers({ provider, testCredentials, now: () => clock });

    await expect(handlers.test(CREDS)).rejects.toThrow("boom");
    clock += 2_000;
    const second = await handlers.test(CREDS);
    expect(second).toEqual({ ok: true });
  });
});

describe("registerCredentialsIpc", () => {
  it("wires all four channels to their handler methods", async () => {
    const handlers = {
      get: vi.fn().mockReturnValue({ configured: true, lastError: null }),
      set: vi.fn().mockReturnValue({ ok: true }),
      clear: vi.fn(),
      test: vi.fn().mockResolvedValue({ ok: true }),
    };
    const registered = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const ipcMain = { handle: vi.fn((channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => registered.set(channel, fn)) };

    registerCredentialsIpc(ipcMain, handlers);

    expect(registered.get(CREDENTIALS_CHANNELS.get)?.(null)).toEqual({ configured: true, lastError: null });
    expect(registered.get(CREDENTIALS_CHANNELS.set)?.(null, CREDS)).toEqual({ ok: true });
    expect(handlers.set).toHaveBeenCalledWith(CREDS);
    registered.get(CREDENTIALS_CHANNELS.clear)?.(null);
    expect(handlers.clear).toHaveBeenCalledOnce();
    await registered.get(CREDENTIALS_CHANNELS.test)?.(null, CREDS);
    expect(handlers.test).toHaveBeenCalledWith(CREDS);
  });
});
