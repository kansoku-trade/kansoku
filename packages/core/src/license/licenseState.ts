import { hostname as osHostname } from "node:os";
import type { Db } from "../db/index.js";
import type { SecretBox } from "../ai/settings/secretBox.js";
import { generateDeviceKeyPair, unwrapBundleKey } from "./bundleKeyWrap.js";
import { createDodoClient, type DodoClient } from "./dodoClient.js";
import { createLicenseStore, type LicenseRecord, type LicenseStore } from "./licenseStore.js";

export type LicenseState = "unlicensed" | "licensed" | "grace" | "expired" | "invalid";

export interface LicenseSnapshot {
  state: LicenseState;
  graceUntil?: string;
  deviceName?: string;
  maskedKey?: string;
}

export type ActivateResult = { activated: true } | { activated: false; error: string };

export interface LicenseManager {
  getLicenseSnapshot(): LicenseSnapshot;
  getBundleKey(): string | undefined;
  getBundleKeyId(): string | undefined;
  activate(key: string): Promise<ActivateResult>;
  deactivate(): Promise<void>;
  revalidate(): Promise<void>;
}

export interface LicenseManagerDeps {
  store: LicenseStore;
  client: DodoClient;
  now: () => number;
  hostname: () => string;
}

const GRACE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `••••${key.slice(-4)}`;
}

function snapshotFromRecord(record: LicenseRecord | null, now: number): LicenseSnapshot {
  if (!record) return { state: "unlicensed" };
  const maskedKey = maskKey(record.key);
  if (record.lastOutcome === "invalid") return { state: "invalid", deviceName: record.deviceName, maskedKey };
  if (record.lastOutcome === "success") return { state: "licensed", deviceName: record.deviceName, maskedKey };

  const graceUntilMs = Date.parse(record.lastValidatedAt) + GRACE_WINDOW_MS;
  if (now <= graceUntilMs) {
    return { state: "grace", graceUntil: new Date(graceUntilMs).toISOString(), deviceName: record.deviceName, maskedKey };
  }
  return { state: "expired", deviceName: record.deviceName, maskedKey };
}

export function createLicenseManager(deps: LicenseManagerDeps): LicenseManager {
  return {
    getLicenseSnapshot(): LicenseSnapshot {
      return snapshotFromRecord(deps.store.read(), deps.now());
    },

    getBundleKey(): string | undefined {
      const record = deps.store.read();
      if (!record?.bundleKey) return undefined;
      if (!record.bundleKeyWrap) return record.bundleKey;
      // Device-bound key: only unwraps with this device's private key, which
      // lives inside this same (safeStorage-encrypted) record.
      if (!record.devicePrivateKey) return undefined;
      try {
        return unwrapBundleKey(record.bundleKey, record.bundleKeyWrap, record.devicePrivateKey);
      } catch (error) {
        console.warn("licenseState: failed to unwrap device-bound bundle key:", error instanceof Error ? error.message : error);
        return undefined;
      }
    },

    getBundleKeyId(): string | undefined {
      return deps.store.read()?.keyId;
    },

    async activate(key: string): Promise<ActivateResult> {
      const deviceName = deps.hostname();
      const device = generateDeviceKeyPair();
      const result = await deps.client.activate({ licenseKey: key, name: deviceName, devicePublicKey: device.publicKey });
      if (!result.ok) return { activated: false, error: result.error };
      deps.store.write({
        key,
        instanceId: result.data.id,
        deviceName,
        lastValidatedAt: new Date(deps.now()).toISOString(),
        lastOutcome: "success",
        bundleKey: result.data.bundleKey,
        keyId: result.data.keyId,
        bundleKeyWrap: result.data.bundleKeyWrap,
        devicePublicKey: device.publicKey,
        devicePrivateKey: device.privateKey,
      });
      return { activated: true };
    },

    async deactivate(): Promise<void> {
      const record = deps.store.read();
      if (record?.instanceId) {
        try {
          await deps.client.deactivate({ licenseKey: record.key, instanceId: record.instanceId });
        } catch {
          // local removal below must not be blockable by a Dodo-side failure
        }
      }
      deps.store.clear();
    },

    async revalidate(): Promise<void> {
      const record = deps.store.read();
      if (!record) return;
      const result = await deps.client.validate({
        licenseKey: record.key,
        instanceId: record.instanceId ?? undefined,
        devicePublicKey: record.devicePublicKey,
      });
      if (!result.ok) {
        if (record.lastOutcome !== "invalid") deps.store.write({ ...record, lastOutcome: "network_fail" });
        return;
      }
      if (!result.data.valid) {
        deps.store.write({ ...record, lastOutcome: "invalid", bundleKey: undefined, keyId: undefined, bundleKeyWrap: undefined });
        return;
      }
      deps.store.write({
        ...record,
        lastValidatedAt: new Date(deps.now()).toISOString(),
        lastOutcome: "success",
        bundleKey: result.data.bundleKey ?? record.bundleKey,
        keyId: result.data.keyId ?? record.keyId,
        bundleKeyWrap: result.data.bundleKeyWrap ?? record.bundleKeyWrap,
      });
    },
  };
}

let active: LicenseManager | null = null;

export function initLicenseManager(
  db: Db,
  secretBox: SecretBox,
  opts?: { client?: DodoClient; now?: () => number; hostname?: () => string },
): LicenseManager {
  const manager = createLicenseManager({
    store: createLicenseStore(db, secretBox),
    client: opts?.client ?? createDodoClient(),
    now: opts?.now ?? (() => Date.now()),
    hostname: opts?.hostname ?? (() => osHostname()),
  });
  active = manager;
  return manager;
}

export function getActiveBundleKey(): string | undefined {
  return active?.getBundleKey();
}

export function getActiveBundleKeyId(): string | undefined {
  return active?.getBundleKeyId();
}

export function getLicenseManager(): LicenseManager {
  if (!active) throw new Error("licenseState: no active license manager; call initLicenseManager before use");
  return active;
}

export function setLicenseManagerForTests(manager: LicenseManager | null): void {
  active = manager;
}
