import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPro } from "../src/pro/loader.js";
import { EncDecryptError, decryptProBlob } from "../src/pro/encLoader.js";
import { hasEncBundle, isProPresent, unregisterProModuleForTests } from "../src/pro/registry.js";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const TSX_LOADER = createRequire(import.meta.url).resolve("tsx", { paths: [join(REPO_ROOT, "apps", "desktop")] });

const FIXTURE = {
  "util.mjs": "export const base = 2;\n",
  "sub/data.mjs": "export const factor = 21;\n",
  "index.mjs": [
    'import { base } from "./util.mjs";',
    'import { factor } from "./sub/data.mjs";',
    "export const answer = base * factor;",
    "export default {",
    "  answer,",
    "  hooks: {",
    "    requestImmediateFollow() {},",
    "    startDeepDiveForNote() { return { started: true }; },",
    "    deepDiveStatus() { return { running: false }; },",
    "  },",
    "};",
    "",
  ].join("\n"),
};

function packEnc(files: Record<string, string>, keyId: string, keyHex: string): Buffer {
  const manifest = {
    keyId,
    files: Object.fromEntries(Object.entries(files).map(([rel, src]) => [rel, Buffer.from(src).toString("base64")])),
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(manifest)));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([Buffer.from("KPRO1", "utf8"), iv, cipher.getAuthTag(), ct]);
}

function stageEnc(files: Record<string, string> = FIXTURE, keyHex = KEY_HEX): { appDir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "kansoku-enc-"));
  const appDir = join(root, "appRoot");
  mkdirSync(join(appDir, "pro"), { recursive: true });
  writeFileSync(join(appDir, "pro", "pro.enc"), packEnc(files, "test", keyHex));
  return { appDir, root };
}

// The registerHooks-based virtual loader only fires under Node's native ESM
// loader; vitest's vite-node runner intercepts import() before Node sees it, so
// the actual-load assertions run in a spawned Node process (tsx transforms the
// TS entry points; the virtual modules load through the real hooks).
const RUNNER = [
  "const { loadEncryptedModule } = await import(process.env.ENC_LOADER_URL);",
  "const { loadPro } = await import(process.env.LOADER_URL);",
  "const { getPro, isProPresent } = await import(process.env.REGISTRY_URL);",
  "const opts = { encPath: process.env.ENC_PATH, keyHex: process.env.KEY_HEX, virtualDir: process.env.VIRTUAL_DIR };",
  "const direct = await loadEncryptedModule(opts);",
  "process.env.KANSOKU_BUNDLE_KEY = process.env.KEY_HEX;",
  "const loaded = await loadPro(process.env.APP_DIR);",
  "process.stdout.write(JSON.stringify({",
  "  keyId: direct.keyId,",
  "  answer: direct.namespace.answer,",
  "  deep: direct.namespace.default.hooks.startDeepDiveForNote(),",
  "  loaded,",
  "  present: isProPresent(),",
  "  deepViaRegistry: getPro()?.hooks.deepDiveStatus(),",
  "}));",
].join("\n");

function runNativeLoad(appDir: string): {
  keyId: string;
  answer: number;
  deep: unknown;
  loaded: boolean;
  present: boolean;
  deepViaRegistry: unknown;
} {
  const url = (p: string) => `file://${join(HERE, "..", "src", "pro", p)}`;
  const out = execFileSync(process.execPath, ["--import", TSX_LOADER, "--input-type=module", "-e", RUNNER], {
    env: {
      ...process.env,
      ENC_LOADER_URL: url("encLoader.ts"),
      LOADER_URL: url("loader.ts"),
      REGISTRY_URL: url("registry.ts"),
      ENC_PATH: join(appDir, "pro", "pro.enc"),
      KEY_HEX,
      VIRTUAL_DIR: join(appDir, "pro", "__enc__"),
      APP_DIR: appDir,
    },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("encLoader", () => {
  const roots: string[] = [];

  afterEach(() => {
    unregisterProModuleForTests();
    delete process.env.KANSOKU_BUNDLE_KEY;
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("decrypts a multi-file fixture and loads it through native hooks (relative + subdir imports)", () => {
    const { appDir, root } = stageEnc();
    roots.push(root);
    const result = runNativeLoad(appDir);
    expect(result.keyId).toBe("test");
    expect(result.answer).toBe(42);
    expect(result.deep).toEqual({ started: true });
    expect(result.loaded).toBe(true);
    expect(result.present).toBe(true);
    expect(result.deepViaRegistry).toEqual({ running: false });
  });

  it("decryptProBlob throws EncDecryptError on a wrong key", () => {
    const blob = packEnc(FIXTURE, "test", KEY_HEX);
    expect(() => decryptProBlob(blob, "ff".repeat(32))).toThrow(EncDecryptError);
  });

  it("decryptProBlob throws EncDecryptError on a bad magic header", () => {
    const blob = packEnc(FIXTURE, "test", KEY_HEX);
    blob.write("XXXXX", 0, "utf8");
    expect(() => decryptProBlob(blob, KEY_HEX)).toThrow(EncDecryptError);
  });

  describe("loadPro priority chain", () => {
    it("falls back to free mode on a wrong bundle key without loading pro", async () => {
      const { appDir, root } = stageEnc();
      roots.push(root);
      process.env.KANSOKU_BUNDLE_KEY = "ff".repeat(32);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const loaded = await loadPro(appDir);
        expect(loaded).toBe(false);
        expect(isProPresent()).toBe(false);
        expect(hasEncBundle()).toBe(true);
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("falls back to free mode when pro.enc is present but no key is available", async () => {
      const { appDir, root } = stageEnc();
      roots.push(root);
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      try {
        const loaded = await loadPro(appDir);
        expect(loaded).toBe(false);
        expect(isProPresent()).toBe(false);
        expect(hasEncBundle()).toBe(true);
        expect(infoSpy.mock.calls.some((c) => String(c[0]).includes("no bundle key"))).toBe(true);
      } finally {
        infoSpy.mockRestore();
      }
    });
  });
});
