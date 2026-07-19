import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { readEditionWebManifest } from "../../src/pro/webManifest.js";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const WRONG_KEY_HEX = "ff".repeat(32);

const PUBLIC_COMMIT = "a".repeat(40);
const PRO_COMMIT = "b".repeat(40);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BINARY_FIXTURE = Buffer.concat([PNG_MAGIC, randomBytes(256)]);

function bundleJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    editionAbiVersion: 1,
    entries: { web: "web/index.mjs" },
    buildId: "test-v1",
    publicCommit: PUBLIC_COMMIT,
    proCommit: PRO_COMMIT,
    ...overrides,
  });
}

const WEB_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "web";',
  "export function createEdition(host) {",
  '  return { kind: "web", name: host.name };',
  "}",
  "",
].join("\n");

const FIXTURE_FILES: Record<string, string | Buffer> = {
  "bundle.json": bundleJson(),
  "web/index.mjs": WEB_ENTRY,
  "web/assets/logo.png": BINARY_FIXTURE,
};

function packBundle(files: Record<string, string | Buffer>, keyId: string, keyHex: string): Buffer {
  const manifest = {
    keyId,
    files: Object.fromEntries(
      Object.entries(files).map(([rel, src]) => [
        rel,
        (Buffer.isBuffer(src) ? src : Buffer.from(src)).toString("base64"),
      ]),
    ),
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(manifest)));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([Buffer.from("KPRO1", "utf8"), iv, cipher.getAuthTag(), ct]);
}

function stageEnc(
  files: Record<string, string | Buffer> = FIXTURE_FILES,
  keyId = "test",
  keyHex = KEY_HEX,
): { encPath: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "kansoku-webmanifest-"));
  const encPath = join(root, "pro.enc");
  writeFileSync(encPath, packBundle(files, keyId, keyHex));
  return { encPath, root };
}

describe("readEditionWebManifest", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("absent: enc file missing", async () => {
    const result = await readEditionWebManifest({
      encPath: join(tmpdir(), "kansoku-webmanifest-definitely-missing", "pro.enc"),
      keyHex: KEY_HEX,
    });
    expect(result.state).toBe("absent");
    expect(result.files).toBeNull();
    expect(result.entryPath).toBeNull();
    expect(result.errorCode).toBeNull();
  });

  it("locked: enc present but no bundle key", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: null });
    expect(result.state).toBe("locked");
    expect(result.files).toBeNull();
    expect(result.errorCode).toBeNull();
  });

  it("failed: wrong key yields PRO_BUNDLE_DECRYPT_FAILED", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: WRONG_KEY_HEX });
    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("PRO_BUNDLE_DECRYPT_FAILED");
    expect(result.files).toBeNull();
  });

  it("incompatible: editionAbiVersion mismatch", async () => {
    const { encPath, root } = stageEnc({ ...FIXTURE_FILES, "bundle.json": bundleJson({ editionAbiVersion: 2 }) });
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: KEY_HEX });
    expect(result.state).toBe("incompatible");
    expect(result.errorCode).toBe("PRO_EDITION_ABI_MISMATCH");
    expect(result.files).toBeNull();
  });

  it("incompatible: expectedPublicCommit mismatch", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const result = await readEditionWebManifest({
      encPath,
      keyHex: KEY_HEX,
      expectedPublicCommit: "c".repeat(40),
    });
    expect(result.state).toBe("incompatible");
    expect(result.errorCode).toBe("PRO_EDITION_ABI_MISMATCH");
  });

  it("incompatible: bundle.entries.web absent yields PRO_EDITION_ENTRY_MISSING", async () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "bundle.json": bundleJson({ entries: { server: "server/index.mjs" } }),
    });
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: KEY_HEX });
    expect(result.state).toBe("incompatible");
    expect(result.errorCode).toBe("PRO_EDITION_ENTRY_MISSING");
    expect(result.files).toBeNull();
    expect(result.entryPath).toBeNull();
  });

  it("active: returns raw files map and entryPath on a valid bundle", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: KEY_HEX });
    expect(result.state).toBe("active");
    expect(result.errorCode).toBeNull();
    expect(result.entryPath).toBe("web/index.mjs");
    expect(result.files).not.toBeNull();
    expect(result.files!.get("web/index.mjs")?.toString("utf8")).toBe(WEB_ENTRY);
  });

  it("active: excludes server/desktop entries and bundle.json — pro-asset:// must never serve decrypted private source", async () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "server/index.mjs": "export const abiVersion = 1; // private server source",
      "desktop/index.mjs": "export const abiVersion = 1; // private desktop source",
    });
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: KEY_HEX });
    expect(result.state).toBe("active");
    expect(result.files!.has("server/index.mjs")).toBe(false);
    expect(result.files!.has("desktop/index.mjs")).toBe(false);
    expect(result.files!.has("bundle.json")).toBe(false);
    expect(result.files!.has("web/index.mjs")).toBe(true);
    expect(result.files!.has("web/assets/logo.png")).toBe(true);
  });

  it("active: binary-safety — non-UTF8-safe bytes round-trip byte-for-byte via Buffer equality", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const result = await readEditionWebManifest({ encPath, keyHex: KEY_HEX });
    expect(result.state).toBe("active");
    const bytes = result.files!.get("web/assets/logo.png");
    expect(bytes).toBeDefined();
    expect(Buffer.compare(bytes!, BINARY_FIXTURE)).toBe(0);
    expect(bytes!.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
});
