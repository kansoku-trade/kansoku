import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { LongbridgeCredentials } from "../../server/src/services/credentials/types.js";

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export interface CredentialStoreDeps {
  safeStorage: SafeStorageLike;
  filePath: string;
}

export type SetCredentialsResult = { ok: true } | { ok: false; error: string };

export interface CredentialStore {
  get(): LongbridgeCredentials | null;
  set(creds: LongbridgeCredentials): SetCredentialsResult;
  clear(): void;
  lastError(): string | null;
}

interface StoredFile {
  version: 1;
  ciphertext: string;
}

function isStoredFile(value: unknown): value is StoredFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as StoredFile).version === 1 &&
    typeof (value as StoredFile).ciphertext === "string"
  );
}

function isLongbridgeCredentials(value: unknown): value is LongbridgeCredentials {
  const v = value as LongbridgeCredentials | null;
  return (
    typeof v?.appKey === "string" &&
    typeof v?.appSecret === "string" &&
    typeof v?.accessToken === "string"
  );
}

export function createCredentialStore(deps: CredentialStoreDeps): CredentialStore {
  let lastError: string | null = null;

  function readStoredFile(): StoredFile | null {
    let raw: string;
    try {
      raw = readFileSync(deps.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        lastError = null;
        return null;
      }
      lastError = "failed to read credentials file";
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = "corrupt credentials file";
      return null;
    }
    if (!isStoredFile(parsed)) {
      lastError = "corrupt credentials file";
      return null;
    }
    return parsed;
  }

  return {
    get(): LongbridgeCredentials | null {
      const file = readStoredFile();
      if (!file) return null;
      let plaintext: string;
      try {
        plaintext = deps.safeStorage.decryptString(Buffer.from(file.ciphertext, "base64"));
      } catch {
        lastError = "failed to decrypt credentials";
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(plaintext);
      } catch {
        lastError = "corrupt credentials payload";
        return null;
      }
      if (!isLongbridgeCredentials(parsed)) {
        lastError = "corrupt credentials payload";
        return null;
      }
      lastError = null;
      return parsed;
    },

    set(creds: LongbridgeCredentials): SetCredentialsResult {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        lastError = "OS secure storage unavailable";
        return { ok: false, error: lastError };
      }
      try {
        const ciphertext = deps.safeStorage.encryptString(JSON.stringify(creds)).toString("base64");
        const payload: StoredFile = { version: 1, ciphertext };
        writeFileSync(deps.filePath, JSON.stringify(payload), { mode: 0o600 });
        chmodSync(deps.filePath, 0o600);
        lastError = null;
        return { ok: true };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "failed to persist credentials";
        return { ok: false, error: lastError };
      }
    },

    clear(): void {
      rmSync(deps.filePath, { force: true });
      lastError = null;
    },

    lastError(): string | null {
      return lastError;
    },
  };
}
