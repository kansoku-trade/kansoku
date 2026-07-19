import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
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

type BundleParseResult =
  | { ok: true; value: EditionBundleManifest }
  | { ok: false; message: string; cause?: unknown };

function parseBundleManifest(files: Record<string, string>): BundleParseResult {
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
    entries[key as EditionRuntimeKind] = value;
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
  cause?: unknown,
): EditionActivation<TEdition> {
  return { state, bundlePresent: true, error: { code, message, cause } };
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

  let manifest: ProManifest;
  try {
    const blob = readFileSync(options.encPath);
    manifest = decryptProBlob(blob, options.keyHex);
  } catch (cause) {
    if (cause instanceof EncDecryptError) {
      return activationError<TEdition>("failed", "PRO_BUNDLE_DECRYPT_FAILED", cause.message, cause);
    }
    throw cause;
  }

  const bundleResult = parseBundleManifest(manifest.files);
  if (!bundleResult.ok) {
    return activationError<TEdition>(
      "failed",
      "PRO_BUNDLE_MANIFEST_INVALID",
      bundleResult.message,
      bundleResult.cause,
    );
  }
  const bundle = bundleResult.value;

  if (bundle.editionAbiVersion !== EDITION_ABI_VERSION) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ABI_MISMATCH",
      `edition ABI mismatch: bundle requires ${bundle.editionAbiVersion}, host supports ${EDITION_ABI_VERSION}`,
    );
  }

  if (options.expectedPublicCommit !== undefined && options.expectedPublicCommit !== bundle.publicCommit) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ABI_MISMATCH",
      `public commit mismatch: host expects ${options.expectedPublicCommit}, bundle built against ${bundle.publicCommit}`,
    );
  }

  const entryPath = bundle.entries[options.runtime];
  if (entryPath === undefined || manifest.files[entryPath] === undefined) {
    return activationError<TEdition>(
      "incompatible",
      "PRO_EDITION_ENTRY_MISSING",
      `no edition entry for runtime "${options.runtime}"`,
    );
  }

  registerManifestFiles(manifest.files, options.virtualDir);
  const entryUrl = virtualModuleUrl(options.virtualDir, entryPath);
  const namespace = (await import(entryUrl)) as Record<string, unknown>;
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
      cause,
    );
  }

  return { state: "active", bundlePresent: true, keyId: manifest.keyId, edition };
}
