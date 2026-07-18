import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class SecretBoxError extends Error {}

export function encryptWithKey(key: Buffer, provider: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`v1\0${provider}`));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptWithKey(key: Buffer, provider: string, envelope: string): string {
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
}
