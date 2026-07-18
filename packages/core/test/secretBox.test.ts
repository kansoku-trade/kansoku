import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretBoxError, createSecretBox } from "../src/ai/secretBox.js";

describe("secretBox", () => {
  let dir: string;
  let keyPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "secret-box-"));
    keyPath = join(dir, "master.key");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips plaintext through encrypt/decrypt and produces a v1 envelope with 4 parts", () => {
    const box = createSecretBox(keyPath);
    const envelope = box.encrypt("anthropic", "sk-live-abc123");
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope.split(":")).toHaveLength(4);
    expect(box.decrypt("anthropic", envelope)).toBe("sk-live-abc123");
  });

  it("throws SecretBoxError when the ciphertext part is tampered with", () => {
    const box = createSecretBox(keyPath);
    const envelope = box.encrypt("anthropic", "sk-live-abc123");
    const [prefix, iv, tag, ct] = envelope.split(":");
    const ctBuf = Buffer.from(ct, "base64");
    ctBuf[0] = ctBuf[0] ^ 0xff;
    const tampered = [prefix, iv, tag, ctBuf.toString("base64")].join(":");
    expect(() => box.decrypt("anthropic", tampered)).toThrow(SecretBoxError);
  });

  it("binds ciphertext to its provider via AAD: swapping providers on decrypt fails", () => {
    const box = createSecretBox(keyPath);
    const envelopeA = box.encrypt("anthropic", "ka");
    box.encrypt("deepseek", "kb");
    expect(() => box.decrypt("deepseek", envelopeA)).toThrow(SecretBoxError);
    expect(box.decrypt("anthropic", envelopeA)).toBe("ka");
  });

  it("first encrypt call creates the key file with mode 0600 and 32 bytes", () => {
    expect(existsSync(keyPath)).toBe(false);
    const box = createSecretBox(keyPath);
    box.encrypt("anthropic", "sk-live-abc123");
    expect(existsSync(keyPath)).toBe(true);
    const stats = statSync(keyPath);
    expect(stats.size).toBe(32);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("reports status based on the key file's presence, size, and permissions", () => {
    const box = createSecretBox(keyPath);
    expect(box.status()).toBe("missing");

    writeFileSync(keyPath, Buffer.alloc(32, 1), { mode: 0o600 });
    expect(box.status()).toBe("ready");

    rmSync(keyPath);
    writeFileSync(keyPath, Buffer.alloc(31, 1), { mode: 0o600 });
    expect(box.status()).toBe("invalid");

    rmSync(keyPath);
    writeFileSync(keyPath, Buffer.alloc(32, 1), { mode: 0o600 });
    chmodSync(keyPath, 0o644);
    expect(box.status()).toBe("invalid");
  });

  it("encrypt with an invalid key file throws, and resetKey recovers while invalidating old envelopes", () => {
    const box = createSecretBox(keyPath);
    const envelope = box.encrypt("anthropic", "sk-live-abc123");

    chmodSync(keyPath, 0o644);
    expect(box.status()).toBe("invalid");
    expect(() => box.encrypt("anthropic", "sk-live-new")).toThrow(SecretBoxError);

    box.resetKey();
    expect(box.status()).toBe("ready");
    const stats = statSync(keyPath);
    expect(stats.mode & 0o777).toBe(0o600);

    const newEnvelope = box.encrypt("anthropic", "sk-live-new");
    expect(box.decrypt("anthropic", newEnvelope)).toBe("sk-live-new");
    expect(() => box.decrypt("anthropic", envelope)).toThrow(SecretBoxError);
  });

  it("rejects malformed envelopes: wrong prefix, wrong part count, garbage base64", () => {
    const box = createSecretBox(keyPath);
    const envelope = box.encrypt("anthropic", "sk-live-abc123");
    const [, iv, tag, ct] = envelope.split(":");

    expect(() => box.decrypt("anthropic", `v2:${iv}:${tag}:${ct}`)).toThrow(SecretBoxError);
    expect(() => box.decrypt("anthropic", `v1:${iv}:${tag}`)).toThrow(SecretBoxError);
    expect(() => box.decrypt("anthropic", `v1:${iv}:${tag}:${ct}:extra`)).toThrow(SecretBoxError);
    expect(() => box.decrypt("anthropic", "not-an-envelope-at-all")).toThrow(SecretBoxError);
    expect(() => box.decrypt("anthropic", "v1:!!!:!!!:!!!")).toThrow(SecretBoxError);
  });
});
