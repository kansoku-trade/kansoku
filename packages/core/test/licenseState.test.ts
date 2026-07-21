import { describe, expect, it, vi } from "vitest";
import { generateDeviceKeyPair, wrapBundleKey } from "../src/license/bundleKeyWrap.js";
import type { DodoClient, DodoResult } from "../src/license/dodoClient.js";
import { createLicenseManager, type LicenseManagerDeps } from "../src/license/licenseState.js";
import type { LicenseRecord, LicenseStore } from "../src/license/licenseStore.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeStore(initial: LicenseRecord | null = null): LicenseStore {
  let record = initial;
  return {
    read: () => record,
    write: (next) => {
      record = next;
    },
    clear: () => {
      record = null;
    },
  };
}

function fakeClient(overrides: Partial<DodoClient> = {}): DodoClient {
  return {
    activate: vi.fn(async () => ({ ok: true, data: { id: "lki_default" } }) as DodoResult<{ id: string }>),
    validate: vi.fn(async () => ({ ok: true, data: { valid: true } }) as DodoResult<{ valid: boolean }>),
    deactivate: vi.fn(async () => ({ ok: true, data: undefined }) as DodoResult<void>),
    ...overrides,
  };
}

function harness(overrides: Partial<LicenseManagerDeps> = {}) {
  const store = overrides.store ?? fakeStore();
  const client = overrides.client ?? fakeClient();
  const now = overrides.now ?? (() => Date.parse("2026-07-15T00:00:00.000Z"));
  const hostname = overrides.hostname ?? (() => "test-host");
  const manager = createLicenseManager({ store, client, now, hostname });
  return { manager, store, client, now };
}

describe("licenseState snapshot", () => {
  it("reports unlicensed when no record is stored", () => {
    const { manager } = harness();
    expect(manager.getLicenseSnapshot()).toEqual({ state: "unlicensed" });
  });

  it("reports licensed with masked key and device name after a successful outcome", () => {
    const { manager } = harness({
      store: fakeStore({
        key: "lic_1234567890",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt: "2026-07-14T00:00:00.000Z",
        lastOutcome: "success",
      }),
    });
    expect(manager.getLicenseSnapshot()).toEqual({
      state: "licensed",
      deviceName: "my-mac",
      maskedKey: "••••7890",
    });
  });

  it("reports invalid immediately on a valid:false outcome regardless of elapsed time", () => {
    const { manager } = harness({
      store: fakeStore({
        key: "lic_1234567890",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt: "2000-01-01T00:00:00.000Z",
        lastOutcome: "invalid",
      }),
    });
    expect(manager.getLicenseSnapshot()).toEqual({
      state: "invalid",
      deviceName: "my-mac",
      maskedKey: "••••7890",
    });
  });

  it("fully masks keys of 8 chars or fewer instead of leaking them via slice(-4)", () => {
    const { manager } = harness({
      store: fakeStore({
        key: "sh0rtky",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt: "2026-07-14T00:00:00.000Z",
        lastOutcome: "success",
      }),
    });
    expect(manager.getLicenseSnapshot()).toEqual({
      state: "licensed",
      deviceName: "my-mac",
      maskedKey: "••••••••",
    });
  });

  it("reports grace on a network_fail outcome within the 14-day window, with graceUntil", () => {
    const lastValidatedAt = "2026-07-01T00:00:00.000Z";
    const { manager } = harness({
      store: fakeStore({
        key: "lic_1234567890",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt,
        lastOutcome: "network_fail",
      }),
      now: () => Date.parse(lastValidatedAt) + 13 * DAY_MS,
    });
    expect(manager.getLicenseSnapshot()).toEqual({
      state: "grace",
      graceUntil: new Date(Date.parse(lastValidatedAt) + 14 * DAY_MS).toISOString(),
      deviceName: "my-mac",
      maskedKey: "••••7890",
    });
  });

  it("14-day boundary: exactly 14 days is still grace, one ms past is expired", () => {
    const lastValidatedAt = "2026-07-01T00:00:00.000Z";
    const graceDeadline = Date.parse(lastValidatedAt) + 14 * DAY_MS;
    const record: LicenseRecord = {
      key: "lic_1234567890",
      instanceId: "lki_abc",
      deviceName: "my-mac",
      lastValidatedAt,
      lastOutcome: "network_fail",
    };

    const atBoundary = harness({ store: fakeStore(record), now: () => graceDeadline });
    expect(atBoundary.manager.getLicenseSnapshot().state).toBe("grace");

    const pastBoundary = harness({ store: fakeStore(record), now: () => graceDeadline + 1 });
    expect(pastBoundary.manager.getLicenseSnapshot().state).toBe("expired");
  });
});

describe("licenseState activate", () => {
  it("calls Dodo activate with deviceName=hostname() and writes the store on success", async () => {
    const client = fakeClient({
      activate: vi.fn(async () => ({ ok: true, data: { id: "lki_new" } }) as DodoResult<{ id: string }>),
    });
    const { manager, store, now } = harness({ client, hostname: () => "my-mac" });

    const result = await manager.activate("lic_1234567890");

    expect(result).toEqual({ activated: true });
    expect(client.activate).toHaveBeenCalledWith({
      licenseKey: "lic_1234567890",
      name: "my-mac",
      devicePublicKey: expect.any(String),
    });
    const stored = store.read();
    expect(stored).toMatchObject({
      key: "lic_1234567890",
      instanceId: "lki_new",
      deviceName: "my-mac",
      lastValidatedAt: new Date(now()).toISOString(),
      lastOutcome: "success",
    });
    expect(stored?.bundleKey).toBeUndefined();
    expect(stored?.devicePublicKey).toEqual(expect.any(String));
    expect(stored?.devicePrivateKey).toEqual(expect.any(String));
    expect(manager.getLicenseSnapshot().state).toBe("licensed");
  });

  it("saves bundleKey/keyId from the Worker response on activate success", async () => {
    const client = fakeClient({
      activate: vi.fn(
        async () => ({ ok: true, data: { id: "lki_new", bundleKey: "b".repeat(64), keyId: "key-1" } }) as DodoResult<{
          id: string;
          bundleKey: string;
          keyId: string;
        }>,
      ),
    });
    const { manager, store } = harness({ client, hostname: () => "my-mac" });

    await manager.activate("lic_1234567890");

    expect(store.read()).toMatchObject({ bundleKey: "b".repeat(64), keyId: "key-1" });
  });

  it("does not write the store when Dodo activate fails", async () => {
    const client = fakeClient({ activate: vi.fn(async () => ({ ok: false, error: "network down" }) as DodoResult<{ id: string }>) });
    const { manager, store } = harness({ client });

    const result = await manager.activate("lic_1234567890");

    expect(result).toEqual({ activated: false, error: "network down" });
    expect(store.read()).toBeNull();
  });
});

describe("licenseState deactivate", () => {
  const record: LicenseRecord = {
    key: "lic_1234567890",
    instanceId: "lki_abc",
    deviceName: "my-mac",
    lastValidatedAt: "2026-07-14T00:00:00.000Z",
    lastOutcome: "success",
  };

  it("clears bundleKey/keyId along with the rest of the record on deactivate", async () => {
    const recordWithKey: LicenseRecord = { ...record, bundleKey: "b".repeat(64), keyId: "key-1" };
    const client = fakeClient({ deactivate: vi.fn(async () => ({ ok: true, data: undefined }) as DodoResult<void>) });
    const { manager, store } = harness({ store: fakeStore(recordWithKey), client });

    await manager.deactivate();

    expect(store.read()).toBeNull();
  });

  it("calls Dodo deactivate and clears the store on success", async () => {
    const client = fakeClient({ deactivate: vi.fn(async () => ({ ok: true, data: undefined }) as DodoResult<void>) });
    const { manager, store } = harness({ store: fakeStore(record), client });

    await manager.deactivate();

    expect(client.deactivate).toHaveBeenCalledWith({ licenseKey: "lic_1234567890", instanceId: "lki_abc" });
    expect(store.read()).toBeNull();
    expect(manager.getLicenseSnapshot()).toEqual({ state: "unlicensed" });
  });

  it("clears the store even when the Dodo deactivate call fails", async () => {
    const client = fakeClient({ deactivate: vi.fn(async () => ({ ok: false, error: "network down" }) as DodoResult<void>) });
    const { manager, store } = harness({ store: fakeStore(record), client });

    await manager.deactivate();

    expect(store.read()).toBeNull();
  });

  it("is a no-op toward Dodo when there is nothing stored", async () => {
    const client = fakeClient();
    const { manager, store } = harness({ client });

    await manager.deactivate();

    expect(client.deactivate).not.toHaveBeenCalled();
    expect(store.read()).toBeNull();
  });
});

describe("licenseState revalidate", () => {
  const record: LicenseRecord = {
    key: "lic_1234567890",
    instanceId: "lki_abc",
    deviceName: "my-mac",
    lastValidatedAt: "2026-07-01T00:00:00.000Z",
    lastOutcome: "success",
  };

  it("is a no-op when there is no stored license", async () => {
    const client = fakeClient();
    const { manager } = harness({ client });
    await manager.revalidate();
    expect(client.validate).not.toHaveBeenCalled();
  });

  it("on success, advances lastValidatedAt and sets lastOutcome=success", async () => {
    const now = () => Date.parse("2026-07-15T00:00:00.000Z");
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: true, data: { valid: true } }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...record }), client, now });

    await manager.revalidate();

    expect(client.validate).toHaveBeenCalledWith({ licenseKey: "lic_1234567890", instanceId: "lki_abc" });
    expect(store.read()).toEqual({ ...record, lastValidatedAt: new Date(now()).toISOString(), lastOutcome: "success" });
    expect(manager.getLicenseSnapshot().state).toBe("licensed");
  });

  it("on network failure, sets lastOutcome=network_fail without advancing lastValidatedAt, entering grace", async () => {
    const now = () => Date.parse(record.lastValidatedAt) + DAY_MS;
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: false, error: "timeout" }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...record }), client, now });

    await manager.revalidate();

    expect(store.read()).toEqual({ ...record, lastOutcome: "network_fail" });
    expect(manager.getLicenseSnapshot().state).toBe("grace");
  });

  it("on valid:false, sets lastOutcome=invalid immediately and keeps key+instanceId", async () => {
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: true, data: { valid: false } }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...record }), client });

    await manager.revalidate();

    expect(store.read()).toEqual({ ...record, lastOutcome: "invalid" });
    expect(manager.getLicenseSnapshot().state).toBe("invalid");
  });

  it("network failure beyond 14 days from the last success reports expired", async () => {
    const now = () => Date.parse(record.lastValidatedAt) + 15 * DAY_MS;
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: false, error: "timeout" }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...record }), client, now });

    await manager.revalidate();

    expect(store.read()?.lastOutcome).toBe("network_fail");
    expect(manager.getLicenseSnapshot().state).toBe("expired");
  });

  it("does not let a network failure resurrect an already-invalid license into grace", async () => {
    const invalidRecord: LicenseRecord = { ...record, lastOutcome: "invalid" };
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: false, error: "timeout" }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...invalidRecord }), client });

    await manager.revalidate();

    expect(store.read()).toEqual(invalidRecord);
    expect(manager.getLicenseSnapshot().state).toBe("invalid");
  });

  it("still recovers from invalid to licensed on a genuine valid:true revalidate", async () => {
    const invalidRecord: LicenseRecord = { ...record, lastOutcome: "invalid" };
    const now = () => Date.parse("2026-07-20T00:00:00.000Z");
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: true, data: { valid: true } }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...invalidRecord }), client, now });

    await manager.revalidate();

    expect(store.read()).toEqual({ ...invalidRecord, lastValidatedAt: new Date(now()).toISOString(), lastOutcome: "success" });
    expect(manager.getLicenseSnapshot().state).toBe("licensed");
  });

  it("refreshes bundleKey/keyId when the revalidate response carries them (recovery after machine swap/DB wipe)", async () => {
    const recordWithoutKey: LicenseRecord = { ...record };
    const now = () => Date.parse("2026-07-15T00:00:00.000Z");
    const client = fakeClient({
      validate: vi.fn(
        async () => ({ ok: true, data: { valid: true, bundleKey: "b".repeat(64), keyId: "key-2" } }) as DodoResult<{
          valid: boolean;
          bundleKey: string;
          keyId: string;
        }>,
      ),
    });
    const { manager, store } = harness({ store: fakeStore({ ...recordWithoutKey }), client, now });

    await manager.revalidate();

    expect(store.read()).toMatchObject({ bundleKey: "b".repeat(64), keyId: "key-2" });
  });

  it("keeps the existing bundleKey when a revalidate success response omits it", async () => {
    const recordWithKey: LicenseRecord = { ...record, bundleKey: "b".repeat(64), keyId: "key-1" };
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: true, data: { valid: true } }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...recordWithKey }), client });

    await manager.revalidate();

    expect(store.read()).toMatchObject({ bundleKey: "b".repeat(64), keyId: "key-1" });
  });

  it("clears bundleKey/keyId on a valid:false revalidate", async () => {
    const recordWithKey: LicenseRecord = { ...record, bundleKey: "b".repeat(64), keyId: "key-1" };
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: true, data: { valid: false } }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...recordWithKey }), client });

    await manager.revalidate();

    const stored = store.read();
    expect(stored?.bundleKey).toBeUndefined();
    expect(stored?.keyId).toBeUndefined();
    expect(stored?.lastOutcome).toBe("invalid");
  });

  it("does not touch bundleKey/keyId on a network failure (offline grace stays usable)", async () => {
    const recordWithKey: LicenseRecord = { ...record, bundleKey: "b".repeat(64), keyId: "key-1" };
    const now = () => Date.parse(record.lastValidatedAt) + DAY_MS;
    const client = fakeClient({ validate: vi.fn(async () => ({ ok: false, error: "timeout" }) as DodoResult<{ valid: boolean }>) });
    const { manager, store } = harness({ store: fakeStore({ ...recordWithKey }), client, now });

    await manager.revalidate();

    expect(store.read()).toMatchObject({ bundleKey: "b".repeat(64), keyId: "key-1" });
  });
});


describe("licenseState device-bound bundleKey", () => {
  const BUNDLE_KEY_HEX = "b".repeat(64);

  it("activate stores the wrapped key + device keypair and getBundleKey unwraps it", async () => {
    // Simulate the Worker: wrap the bundle key to whatever device public key
    // the client uploaded.
    const client = fakeClient({
      activate: vi.fn(async (input: { devicePublicKey?: string }) => {
        const { wrapped, wrap } = wrapBundleKey(BUNDLE_KEY_HEX, input.devicePublicKey!);
        return { ok: true, data: { id: "lki_new", bundleKey: wrapped, keyId: "key-1", bundleKeyWrap: wrap } };
      }) as DodoClient["activate"],
    });
    const { manager, store } = harness({ client });

    await manager.activate("lic_1234567890");

    const stored = store.read();
    expect(stored?.bundleKeyWrap?.alg).toBe("p256-hkdf-sha256-aes256gcm");
    expect(stored?.bundleKey).not.toBe(BUNDLE_KEY_HEX);
    expect(manager.getBundleKey()).toBe(BUNDLE_KEY_HEX);
    expect(manager.getBundleKeyId()).toBe("key-1");
  });

  it("getBundleKey is undefined when the record carries a wrapped key but no device private key", () => {
    const device = generateDeviceKeyPair();
    const { wrapped, wrap } = wrapBundleKey(BUNDLE_KEY_HEX, device.publicKey);
    const { manager } = harness({
      store: fakeStore({
        key: "lic_1234567890",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt: "2026-07-14T00:00:00.000Z",
        lastOutcome: "success",
        bundleKey: wrapped,
        bundleKeyWrap: wrap,
        keyId: "key-1",
        // no devicePrivateKey — simulates a record copied off this device
      }),
    });

    expect(manager.getBundleKey()).toBeUndefined();
  });

  it("getBundleKey returns the plaintext key for legacy (unwrapped) records", () => {
    const { manager } = harness({
      store: fakeStore({
        key: "lic_1234567890",
        instanceId: "lki_abc",
        deviceName: "my-mac",
        lastValidatedAt: "2026-07-14T00:00:00.000Z",
        lastOutcome: "success",
        bundleKey: BUNDLE_KEY_HEX,
        keyId: "key-1",
      }),
    });

    expect(manager.getBundleKey()).toBe(BUNDLE_KEY_HEX);
  });

  it("revalidate uploads the stored device public key and refreshes the wrapped key", async () => {
    const device = generateDeviceKeyPair();
    const record: LicenseRecord = {
      key: "lic_1234567890",
      instanceId: "lki_abc",
      deviceName: "my-mac",
      lastValidatedAt: "2026-07-01T00:00:00.000Z",
      lastOutcome: "success",
      devicePublicKey: device.publicKey,
      devicePrivateKey: device.privateKey,
    };
    const client = fakeClient({
      validate: vi.fn(async (input: { devicePublicKey?: string }) => {
        const { wrapped, wrap } = wrapBundleKey(BUNDLE_KEY_HEX, input.devicePublicKey!);
        return { ok: true, data: { valid: true, bundleKey: wrapped, keyId: "key-2", bundleKeyWrap: wrap } };
      }) as DodoClient["validate"],
    });
    const { manager, store } = harness({ store: fakeStore(record), client });

    await manager.revalidate();

    expect(client.validate).toHaveBeenCalledWith({
      licenseKey: "lic_1234567890",
      instanceId: "lki_abc",
      devicePublicKey: device.publicKey,
    });
    expect(store.read()?.bundleKeyWrap?.alg).toBe("p256-hkdf-sha256-aes256gcm");
    expect(manager.getBundleKey()).toBe(BUNDLE_KEY_HEX);
    expect(manager.getBundleKeyId()).toBe("key-2");
  });
});
