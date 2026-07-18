import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import type { MasterKeyStatus, SecretBox } from "@kansoku/pro-api";
import { decryptWithKey, encryptWithKey, SecretBoxError } from "../services/secretCrypto.js";

export type { MasterKeyStatus, SecretBox } from "@kansoku/pro-api";
export { decryptWithKey, encryptWithKey, SecretBoxError } from "../services/secretCrypto.js";

const KEY_BYTES = 32;

function statusOf(keyPath: string): MasterKeyStatus {
  let stats;
  try {
    stats = statSync(keyPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw err;
  }
  if (!stats.isFile()) return "invalid";
  if (stats.size !== KEY_BYTES) return "invalid";
  if ((stats.mode & 0o777) !== 0o600) return "invalid";
  return "ready";
}

function createKeyFileExclusive(keyPath: string): Buffer {
  const key = randomBytes(KEY_BYTES);
  try {
    const fd = openSync(keyPath, "wx", 0o600);
    writeSync(fd, key);
    closeSync(fd);
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return readFileSync(keyPath);
    }
    throw err;
  }
}

export function createSecretBox(keyPath: string): SecretBox {
  function keyForEncrypt(): Buffer {
    const status = statusOf(keyPath);
    if (status === "invalid") throw new SecretBoxError("master key file is invalid");
    if (status === "missing") return createKeyFileExclusive(keyPath);
    return readFileSync(keyPath);
  }

  function keyForDecrypt(): Buffer {
    const status = statusOf(keyPath);
    if (status !== "ready") throw new SecretBoxError(`master key is ${status}`);
    return readFileSync(keyPath);
  }

  return {
    status(): MasterKeyStatus {
      return statusOf(keyPath);
    },

    encrypt(provider: string, plaintext: string): string {
      return encryptWithKey(keyForEncrypt(), provider, plaintext);
    },

    decrypt(provider: string, envelope: string): string {
      return decryptWithKey(keyForDecrypt(), provider, envelope);
    },

    resetKey(): void {
      rmSync(keyPath, { force: true });
      createKeyFileExclusive(keyPath);
    },
  };
}
