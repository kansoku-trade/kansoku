import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/index.js";
import { providerCredentials } from "../src/db/schema.js";
import { createLicenseStore, type LicenseRecord, type LicenseStore } from "../src/license/licenseStore.js";
import { createSecretBox, type SecretBox } from "../src/ai/settings/secretBox.js";

describe("licenseStore", () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;
  let store: LicenseStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "license-store-"));
    db = createDb(join(dir, "app.db"));
    secretBox = createSecretBox(join(dir, "master.key"));
    store = createLicenseStore(db, secretBox);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const record: LicenseRecord = {
    key: "lic_1234567890",
    instanceId: "lki_abc",
    deviceName: "my-mac",
    lastValidatedAt: "2026-07-01T00:00:00.000Z",
    lastOutcome: "success",
  };

  it("read is null when nothing is stored", () => {
    expect(store.read()).toBeNull();
  });

  it("write then read round-trips the record, encrypted at rest", () => {
    store.write(record);
    expect(store.read()).toEqual(record);

    const row = db.select().from(providerCredentials).all()[0];
    expect(row.secret.startsWith("v1:")).toBe(true);
    expect(row.secret).not.toContain(record.key);
  });

  it("write overwrites the prior record (single license slot)", () => {
    store.write(record);
    store.write({ ...record, lastOutcome: "invalid" });
    expect(store.read()).toEqual({ ...record, lastOutcome: "invalid" });
    expect(db.select().from(providerCredentials).all()).toHaveLength(1);
  });

  it("clear removes the record", () => {
    store.write(record);
    store.clear();
    expect(store.read()).toBeNull();
  });

  it("round-trips bundleKey/keyId, encrypted at rest", () => {
    const withKey: LicenseRecord = { ...record, bundleKey: "b".repeat(64), keyId: "key-1" };
    store.write(withKey);
    expect(store.read()).toEqual(withKey);

    const row = db.select().from(providerCredentials).all()[0];
    expect(row.secret).not.toContain(withKey.bundleKey);
  });
});
