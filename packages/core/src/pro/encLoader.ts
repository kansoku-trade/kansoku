import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const MAGIC = "KPRO1";

export interface ProManifest {
  keyId: string;
  files: Record<string, string>;
}

export class EncDecryptError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EncDecryptError";
  }
}

function parseKeyHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new EncDecryptError("bundle key must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function decryptProBlob(blob: Buffer, keyHex: string): ProManifest {
  const key = parseKeyHex(keyHex);
  const magic = blob.subarray(0, 5).toString("utf8");
  if (magic !== MAGIC) {
    throw new EncDecryptError(`bad magic: expected ${MAGIC}, got ${JSON.stringify(magic)}`);
  }
  const iv = blob.subarray(5, 17);
  const authTag = blob.subarray(17, 33);
  const ciphertext = blob.subarray(33);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const gzipped = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(gunzipSync(gzipped).toString("utf8")) as ProManifest;
  } catch (cause) {
    throw new EncDecryptError("pro.enc decryption failed (wrong key or tampered blob)", { cause });
  }
}

const encSources = new Map<string, string>();
let hooksRegistered = false;

function ensureHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerHooks({
    // The default resolver checks that the target file exists on disk during
    // the resolve phase, so virtual (in-memory) modules must be short-circuited
    // in BOTH resolve and load; anything outside the map falls through to Node.
    resolve(specifier, context, nextResolve) {
      if (encSources.has(specifier)) {
        return { url: specifier, shortCircuit: true };
      }
      if (context.parentURL && (specifier.startsWith("./") || specifier.startsWith("../"))) {
        const url = new URL(specifier, context.parentURL).href;
        if (encSources.has(url)) return { url, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      const source = encSources.get(url);
      if (source === undefined) return nextLoad(url, context);
      return { format: url.endsWith(".json") ? "json" : "module", source, shortCircuit: true };
    },
  });
}

export function virtualModuleUrl(virtualDir: string, rel: string): string {
  return pathToFileURL(join(virtualDir, rel)).href;
}

// The virtual root is a fake file: URL under a REAL directory (virtualDir does
// not exist on disk): rolldown runtime's createRequire only accepts file:
// URLs, and hanging the tree under a real dir lets bare deps (@tsuki-hono/*,
// better-sqlite3, electron) resolve through the real node_modules exactly as
// the plaintext slot does.
export function registerManifestFiles(files: Record<string, string>, virtualDir: string): void {
  for (const [rel, base64] of Object.entries(files)) {
    encSources.set(virtualModuleUrl(virtualDir, rel), Buffer.from(base64, "base64").toString("utf8"));
  }
  ensureHooks();
}

export interface LoadEncryptedOptions {
  encPath: string;
  keyHex: string;
  virtualDir: string;
  entry?: string;
}

export async function loadEncryptedModule(
  opts: LoadEncryptedOptions,
): Promise<{ namespace: Record<string, unknown>; keyId: string }> {
  const blob = readFileSync(opts.encPath);
  const manifest = decryptProBlob(blob, opts.keyHex);

  registerManifestFiles(manifest.files, opts.virtualDir);

  const entryUrl = virtualModuleUrl(opts.virtualDir, opts.entry ?? "index.mjs");
  const namespace = (await import(entryUrl)) as Record<string, unknown>;
  return { namespace, keyId: manifest.keyId };
}
