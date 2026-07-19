import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { EDITION_ABI_VERSION } from "@kansoku/pro-api/edition";
import type { EditionEntry, EditionRuntimeKind } from "@kansoku/pro-api/edition";
import type { ProManifest } from "./encLoader.js";
import { EncDecryptError, decryptProBlob, registerManifestFiles, virtualModuleUrl } from "./encLoader.js";

export type EditionActivationState = "absent" | "locked" | "active" | "incompatible" | "failed";

export type EditionErrorCode =
  | "PRO_BUNDLE_DECRYPT_FAILED"
  | "PRO_BUNDLE_MANIFEST_INVALID"
  | "PRO_EDITION_ABI_MISMATCH"
  | "PRO_EDITION_ENTRY_MISSING"
  | "PRO_EDITION_INIT_FAILED";

export interface EditionActivationError {
  code: EditionErrorCode;
  message: string;
  cause?: unknown;
}

export interface EditionActivation<TEdition> {
  state: EditionActivationState;
  bundlePresent: boolean;
  keyId?: string;
  buildId?: string;
  edition?: TEdition;
  error?: EditionActivationError;
}

export interface EditionBundleManifest {
  formatVersion: number;
  editionAbiVersion: number;
  entries: Partial<Record<EditionRuntimeKind, string>>;
  buildId?: string;
  publicCommit?: string;
  proCommit?: string;
}

export interface LoadEditionOptions<THost> {
  encPath: string;
  virtualDir: string;
  runtime: EditionRuntimeKind;
  keyHex?: string | null;
  host: THost;
  expectedPublicCommit?: string;
}

function isSafeVirtualEntryPath(entryPath: string): boolean {
  if (isAbsolute(entryPath)) return false;
  if (entryPath.split(/[/\\]/).includes("..")) return false;
  const normalized = normalize(entryPath);
  return !isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith("../");
}

const EDITION_RUNTIME_KINDS: readonly EditionRuntimeKind[] = ["server", "desktop", "web"];

function isEditionRuntimeKind(value: string): value is EditionRuntimeKind {
  return (EDITION_RUNTIME_KINDS as readonly string[]).includes(value);
}

export type BundleParseResult =
  | { ok: true; value: EditionBundleManifest }
  | { ok: false; message: string; cause?: unknown };

export function parseBundleManifest(files: Record<string, string>): BundleParseResult {
  for (const fileKey of Object.keys(files)) {
    if (!isSafeVirtualEntryPath(fileKey)) {
      return { ok: false, message: `bundle manifest file "${fileKey}" escapes the virtual root` };
    }
  }

  const raw = files["bundle.json"];
  if (raw === undefined) {
    return { ok: false, message: "bundle.json missing from pro bundle manifest" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch (cause) {
    return { ok: false, message: "bundle.json is not valid JSON", cause };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "bundle.json must be a JSON object" };
  }
  const candidate = parsed as Record<string, unknown>;

  if (candidate.formatVersion !== 1) {
    return {
      ok: false,
      message: `bundle.json formatVersion must be 1, got ${JSON.stringify(candidate.formatVersion)}`,
    };
  }

  if (typeof candidate.editionAbiVersion !== "number") {
    return { ok: false, message: "bundle.json editionAbiVersion must be a number" };
  }

  if (typeof candidate.entries !== "object" || candidate.entries === null || Array.isArray(candidate.entries)) {
    return { ok: false, message: "bundle.json entries must be an object" };
  }

  const entries: Partial<Record<EditionRuntimeKind, string>> = {};
  for (const [key, value] of Object.entries(candidate.entries as Record<string, unknown>)) {
    if (typeof value !== "string") {
      return { ok: false, message: `bundle.json entries.${key} must be a string path` };
    }
    if (!isSafeVirtualEntryPath(value)) {
      return { ok: false, message: `bundle.json entries.${key} path "${value}" escapes the virtual root` };
    }
    if (isEditionRuntimeKind(key)) {
      entries[key] = value;
    }
  }

  return {
    ok: true,
    value: {
      formatVersion: candidate.formatVersion,
      editionAbiVersion: candidate.editionAbiVersion,
      entries,
      buildId: typeof candidate.buildId === "string" ? candidate.buildId : undefined,
      publicCommit: typeof candidate.publicCommit === "string" ? candidate.publicCommit : undefined,
      proCommit: typeof candidate.proCommit === "string" ? candidate.proCommit : undefined,
    },
  };
}

function activationError<TEdition>(
  state: "incompatible" | "failed",
  code: EditionErrorCode,
  message: string,
  options?: { cause?: unknown; keyId?: string; buildId?: string },
): EditionActivation<TEdition> {
  return {
    state,
    bundlePresent: true,
    keyId: options?.keyId,
    buildId: options?.buildId,
    error: { code, message, cause: options?.cause },
  };
}

export async function loadEdition<THost, TEdition>(
  options: LoadEditionOptions<THost>,
): Promise<EditionActivation<TEdition>> {
  const bundlePresent = existsSync(options.encPath);
  if (!bundlePresent) {
    console.info("edition slot: pro.enc not present, running unlocked");
    return { state: "absent", bundlePresent: false };
  }

  if (!options.keyHex) {
    console.info("edition slot: pro.enc present but no bundle key, running unlocked");
    return { state: "locked", bundlePresent: true };
  }

  let blob: Buffer;
  try {
    blob = readFileSync(options.encPath);
  } catch (cause) {
    return activationError<TEdition>(
      "failed",
      "PRO_BUNDLE_DECRYPT_FAILED",
      "pro.enc could not be read after it was confirmed present",
      { cause },
    );
  }

  let manifest: ProManifest;
  try {
    manifest = decryptProBlob(blob, options.keyHex);
  } catch (cause) {
    if (cause instanceof EncDecryptError) {
      return activationError<TEdition>("failed", "PRO_BUNDLE_DECRYPT_FAILED", cause.message, { cause });
    }
    throw cause;
  }

  const bundleResult = parseBundleManifest(manifest.files);
  if (!bundleResult.ok) {
    return activationError<TEdition>("failed", "PRO_BUNDLE_MANIFEST_INVALID", bundleResult.message, {
      cause: bundleResult.cause,
      keyId: manifest.keyId,
    });
  }
  const bundle = bundleResult.value;

  if (bundle.editionAbiVersion !== EDITION_ABI_VERSION) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ABI_MISMATCH",
      `edition ABI mismatch: bundle requires ${bundle.editionAbiVersion}, host supports ${EDITION_ABI_VERSION}`,
      { keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }

  if (options.expectedPublicCommit !== undefined && options.expectedPublicCommit !== bundle.publicCommit) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ABI_MISMATCH",
      `public commit mismatch: host expects ${options.expectedPublicCommit}, bundle built against ${bundle.publicCommit}`,
      { keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }

  const entryPath = bundle.entries[options.runtime];
  if (entryPath === undefined || manifest.files[entryPath] === undefined) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ENTRY_MISSING",
      `no edition entry for runtime "${options.runtime}"`,
      { keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }

  const virtualRoot = join(options.virtualDir, createHash("sha256").update(blob).digest("hex").slice(0, 16));
  registerManifestFiles(manifest.files, virtualRoot);
  const entryUrl = virtualModuleUrl(virtualRoot, entryPath);

  let namespace: Record<string, unknown>;
  try {
    namespace = (await import(entryUrl)) as Record<string, unknown>;
  } catch (cause) {
    return activationError<TEdition>(
      "failed",
      "PRO_EDITION_INIT_FAILED",
      `edition entry "${entryPath}" threw while importing for runtime "${options.runtime}"`,
      { cause, keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }
  const entryModule = (namespace.default ?? namespace) as Partial<EditionEntry<THost, TEdition>>;

  if (
    entryModule.abiVersion !== EDITION_ABI_VERSION ||
    entryModule.runtime !== options.runtime ||
    typeof entryModule.createEdition !== "function"
  ) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ABI_MISMATCH",
      `edition entry "${entryPath}" failed ABI validation for runtime "${options.runtime}"`,
      { keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }

  let edition: TEdition;
  try {
    edition = await entryModule.createEdition(options.host);
  } catch (cause) {
    return activationError<TEdition>(
      "failed",
      "PRO_EDITION_INIT_FAILED",
      `createEdition threw for runtime "${options.runtime}"`,
      { cause, keyId: manifest.keyId, buildId: bundle.buildId },
    );
  }

  return { state: "active", bundlePresent: true, keyId: manifest.keyId, buildId: bundle.buildId, edition };
}
