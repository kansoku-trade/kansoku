import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";

export type MasterKeyStatus = "ready" | "missing" | "invalid";

export class SecretBoxError extends Error {}

export interface SecretBox {
  status(): MasterKeyStatus;
  encrypt(provider: string, plaintext: string): string;
  decrypt(provider: string, envelope: string): string;
  resetKey(): void;
}

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
      const key = keyForEncrypt();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`v1\0${provider}`));
      const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
    },

    decrypt(provider: string, envelope: string): string {
      const key = keyForDecrypt();
      const parts = envelope.split(":");
      if (parts.length !== 4 || parts[0] !== "v1") {
        throw new SecretBoxError("malformed secretBox envelope");
      }
      const [, ivB64, tagB64, ctB64] = parts;
      try {
        const iv = Buffer.from(ivB64, "base64");
        const tag = Buffer.from(tagB64, "base64");
        const ct = Buffer.from(ctB64, "base64");
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        decipher.setAAD(Buffer.from(`v1\0${provider}`));
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
      } catch (err) {
        if (err instanceof SecretBoxError) throw err;
        throw new SecretBoxError("failed to decrypt secretBox envelope");
      }
    },

    resetKey(): void {
      rmSync(keyPath, { force: true });
      createKeyFileExclusive(keyPath);
    },
  };
}
