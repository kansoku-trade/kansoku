import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore, type SafeStorageLike } from "@desktop/credentials/store.js";

const CREDS = { kind: "apikey" as const, appKey: "key-abc", appSecret: "secret-abc", accessToken: "token-abc" };

function fakeSafeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, "utf8"),
    decryptString: (b: Buffer) => {
      const s = b.toString("utf8");
      if (!s.startsWith("enc:")) throw new Error("bad ciphertext");
      return s.slice(4);
    },
    ...overrides,
  };
}

describe("credentialStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "credential-store-"));
    filePath = join(dir, "credentials.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no file exists yet", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBeNull();
  });

  it("clears a stale lastError once the file is gone", () => {
    writeFileSync(filePath, "not json{{{", { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials file");
    rmSync(filePath);
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBeNull();
  });

  it("round-trips credentials through set/get", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    const result = store.set(CREDS);
    expect(result).toEqual({ ok: true });
    expect(store.get()).toEqual(CREDS);
  });

  it("persists the file chmod 0600 with a version field and base64 ciphertext", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    store.set(CREDS);
    const stats = statSync(filePath);
    expect(stats.mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(parsed.version).toBe(1);
    expect(() => Buffer.from(parsed.ciphertext, "base64")).not.toThrow();
  });

  it("clear() removes the file and get() returns null afterward", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    store.set(CREDS);
    store.clear();
    expect(store.get()).toBeNull();
  });

  it("clear() on a nonexistent file does not throw", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(() => store.clear()).not.toThrow();
  });

  it("refuses to persist when safeStorage encryption is unavailable, without writing plaintext", () => {
    const store = createCredentialStore({
      safeStorage: fakeSafeStorage({ isEncryptionAvailable: () => false }),
      filePath,
    });
    const result = store.set(CREDS);
    expect(result).toEqual({ ok: false, error: "OS secure storage unavailable" });
    expect(() => readFileSync(filePath)).toThrow();
  });

  it("treats a corrupt JSON file as null with a lastError note, not a crash", () => {
    writeFileSync(filePath, "not json{{{", { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials file");
  });

  it("treats a file missing the version/ciphertext fields as corrupt", () => {
    writeFileSync(filePath, JSON.stringify({ foo: "bar" }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials file");
  });

  it("treats undecryptable ciphertext as null with a lastError note, not a crash", () => {
    writeFileSync(filePath, JSON.stringify({ version: 1, ciphertext: "notrealciphertext" }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("failed to decrypt credentials");
  });

  it("treats a decrypted payload missing required fields as corrupt", () => {
    const safeStorage = fakeSafeStorage();
    const ciphertext = safeStorage.encryptString(JSON.stringify({ appKey: "only-key" })).toString("base64");
    writeFileSync(filePath, JSON.stringify({ version: 1, ciphertext }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage, filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials payload");
  });

  it("clears lastError once a subsequent get() succeeds", () => {
    writeFileSync(filePath, "not json", { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).not.toBeNull();
    store.set(CREDS);
    expect(store.get()).toEqual(CREDS);
    expect(store.lastError()).toBeNull();
  });
});

describe("credentialStore auth payloads", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "credential-store-"));
    filePath = join(dir, "credentials.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips oauth auth through set/get", () => {
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.set({ kind: "oauth", clientId: "client-123" })).toEqual({ ok: true });
    expect(store.get()).toEqual({ kind: "oauth", clientId: "client-123" });
  });

  it("reads a legacy untagged apikey payload as apikey auth", () => {
    const legacy = { appKey: "key-abc", appSecret: "secret-abc", accessToken: "token-abc" };
    const ciphertext = Buffer.from(`enc:${JSON.stringify(legacy)}`, "utf8").toString("base64");
    writeFileSync(filePath, JSON.stringify({ version: 1, ciphertext }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toEqual({ kind: "apikey", ...legacy });
    expect(store.lastError()).toBeNull();
  });

  it("rejects an oauth payload with a missing clientId", () => {
    const ciphertext = Buffer.from(`enc:${JSON.stringify({ kind: "oauth" })}`, "utf8").toString("base64");
    writeFileSync(filePath, JSON.stringify({ version: 1, ciphertext }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials payload");
  });

  it("rejects an unknown kind tag", () => {
    const ciphertext = Buffer.from(`enc:${JSON.stringify({ kind: "magic", token: "x" })}`, "utf8").toString("base64");
    writeFileSync(filePath, JSON.stringify({ version: 1, ciphertext }), { mode: 0o600 });
    const store = createCredentialStore({ safeStorage: fakeSafeStorage(), filePath });
    expect(store.get()).toBeNull();
    expect(store.lastError()).toBe("corrupt credentials payload");
  });
});
