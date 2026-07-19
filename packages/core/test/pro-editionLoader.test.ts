import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { loadEdition, parseBundleManifest } from "../src/pro/editionLoader.js";
import { getClaimedProtocol, resetProtocolClaimForTests } from "../src/pro/protocolClaim.js";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const WRONG_KEY_HEX = "ff".repeat(32);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const TSX_LOADER = createRequire(import.meta.url).resolve("tsx", { paths: [join(REPO_ROOT, "apps", "desktop")] });

const PUBLIC_COMMIT = "a".repeat(40);
const PRO_COMMIT = "b".repeat(40);

function bundleJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    editionAbiVersion: 1,
    entries: { server: "server/index.mjs", desktop: "desktop/index.mjs" },
    buildId: "test-v1",
    publicCommit: PUBLIC_COMMIT,
    proCommit: PRO_COMMIT,
    ...overrides,
  });
}

const SERVER_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "server";',
  "export function createEdition(host) {",
  '  return { kind: "server", name: host.name };',
  "}",
  "",
].join("\n");

const DESKTOP_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "desktop";',
  "export function createEdition(host) {",
  '  return { kind: "desktop", name: host.name };',
  "}",
  "",
].join("\n");

const THROWING_SERVER_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "server";',
  "export function createEdition() {",
  '  throw new Error("createEdition boom");',
  "}",
  "",
].join("\n");

const THROWING_AT_TOP_LEVEL_ENTRY = ['throw new Error("boom at top-level evaluation");', ""].join("\n");

const SERVER_ENTRY_V2 = [
  "export const abiVersion = 1;",
  'export const runtime = "server";',
  "export function createEdition(host) {",
  '  return { kind: "server-v2", name: host.name };',
  "}",
  "",
].join("\n");

const FIXTURE_FILES: Record<string, string> = {
  "bundle.json": bundleJson(),
  "server/index.mjs": SERVER_ENTRY,
  "desktop/index.mjs": DESKTOP_ENTRY,
};

function packBundle(files: Record<string, string>, keyId: string, keyHex: string): Buffer {
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

function stageEnc(
  files: Record<string, string> = FIXTURE_FILES,
  keyId = "test",
  keyHex = KEY_HEX,
): { encPath: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "kansoku-edition-"));
  const encPath = join(root, "pro.enc");
  writeFileSync(encPath, packBundle(files, keyId, keyHex));
  return { encPath, root };
}

describe("loadEdition (in-process, no dynamic import reached)", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetProtocolClaimForTests();
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("absent: enc file missing", async () => {
    const activation = await loadEdition({
      encPath: join(tmpdir(), "kansoku-edition-definitely-missing", "pro.enc"),
      virtualDir: join(tmpdir(), "kansoku-edition-vdir-absent"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("absent");
    expect(activation.bundlePresent).toBe(false);
    expect(activation.error).toBeUndefined();
  });

  it("locked: enc present but no bundle key", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      host: {},
    });
    expect(activation.state).toBe("locked");
    expect(activation.bundlePresent).toBe(true);
    expect(activation.error).toBeUndefined();
  });

  it("failed: wrong key yields PRO_BUNDLE_DECRYPT_FAILED", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: WRONG_KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_DECRYPT_FAILED");
    expect(getClaimedProtocol()).toBeNull();
  });

  it("failed: tampered ciphertext yields PRO_BUNDLE_DECRYPT_FAILED", async () => {
    const blob = packBundle(FIXTURE_FILES, "test", KEY_HEX);
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff;
    const root = mkdtempSync(join(tmpdir(), "kansoku-edition-"));
    roots.push(root);
    const encPath = join(root, "pro.enc");
    writeFileSync(encPath, blob);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_DECRYPT_FAILED");
  });

  it("failed: encPath exists as a directory, readFileSync fails after existsSync check", async () => {
    const root = mkdtempSync(join(tmpdir(), "kansoku-edition-"));
    roots.push(root);
    const encPath = join(root, "pro.enc");
    mkdirSync(encPath);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_DECRYPT_FAILED");
  });

  it("failed: bundle.json missing from the file set", async () => {
    const { encPath, root } = stageEnc({ "server/index.mjs": SERVER_ENTRY });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_MANIFEST_INVALID");
    expect(activation.keyId).toBe("test");
    expect(activation.buildId).toBeUndefined();
  });

  it("failed: manifest file key escapes the virtual root", async () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "../evil.mjs": "export const pwned = true;",
    });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_MANIFEST_INVALID");
  });

  it("failed: bundle.json is unparseable garbage", async () => {
    const { encPath, root } = stageEnc({ "bundle.json": "{ not json", "server/index.mjs": SERVER_ENTRY });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_MANIFEST_INVALID");
  });

  it("failed: bundle.json formatVersion is not 1", async () => {
    const { encPath, root } = stageEnc({ ...FIXTURE_FILES, "bundle.json": bundleJson({ formatVersion: 2 }) });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_MANIFEST_INVALID");
  });

  it("failed: entry path escapes the virtual root", async () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "bundle.json": bundleJson({ entries: { server: "../evil.mjs", desktop: "desktop/index.mjs" } }),
    });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("failed");
    expect(activation.error?.code).toBe("PRO_BUNDLE_MANIFEST_INVALID");
  });

  it("incompatible: editionAbiVersion mismatch (bundle newer than host)", async () => {
    const { encPath, root } = stageEnc({ ...FIXTURE_FILES, "bundle.json": bundleJson({ editionAbiVersion: 2 }) });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("incompatible");
    expect(activation.error?.code).toBe("PRO_EDITION_ABI_MISMATCH");
    expect(activation.keyId).toBe("test");
    expect(activation.buildId).toBe("test-v1");
    expect(getClaimedProtocol()).toBeNull();
  });

  it("incompatible: editionAbiVersion mismatch (bundle older than host)", async () => {
    const { encPath, root } = stageEnc({ ...FIXTURE_FILES, "bundle.json": bundleJson({ editionAbiVersion: 0 }) });
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("incompatible");
    expect(activation.error?.code).toBe("PRO_EDITION_ABI_MISMATCH");
  });

  it("incompatible: requested runtime has no entry, no fallback to another runtime", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "web",
      keyHex: KEY_HEX,
      host: {},
    });
    expect(activation.state).toBe("incompatible");
    expect(activation.error?.code).toBe("PRO_EDITION_ENTRY_MISSING");
    expect(activation.edition).toBeUndefined();
  });

  it("incompatible: expectedPublicCommit mismatch", async () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const activation = await loadEdition({
      encPath,
      virtualDir: join(root, "vdir"),
      runtime: "server",
      keyHex: KEY_HEX,
      host: {},
      expectedPublicCommit: "c".repeat(40),
    });
    expect(activation.state).toBe("incompatible");
    expect(activation.error?.code).toBe("PRO_EDITION_ABI_MISMATCH");
  });
});

describe("parseBundleManifest (unknown runtime keys)", () => {
  it("filters unknown runtime keys out of entries instead of force-casting them", () => {
    const files: Record<string, string> = {
      "bundle.json": Buffer.from(
        bundleJson({
          entries: { server: "server/index.mjs", desktop: "desktop/index.mjs", tablet: "tablet/index.mjs" },
        }),
      ).toString("base64"),
    };

    const result = parseBundleManifest(files);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toEqual({ server: "server/index.mjs", desktop: "desktop/index.mjs" });
    expect(Object.keys(result.value.entries)).not.toContain("tablet");
  });
});

// registerHooks-based virtual module resolution only fires under Node's native
// ESM loader; vitest's vite-node runner intercepts import() before Node ever
// sees it (confirmed empirically: an in-process registerHooks + import() of a
// virtual specifier throws ERR_MODULE_NOT_FOUND under `vitest run`). Every
// scenario below that must actually reach `await import(entryUrl)` therefore
// runs in a spawned real Node process, mirroring pro-encLoader.test.ts's
// runNativeLoad pattern.
const RUNNER_SOURCE = [
  'import { readFileSync, writeFileSync } from "node:fs";',
  'const config = JSON.parse(readFileSync(process.env.CONFIG_PATH, "utf8"));',
  'const { loadEdition } = await import(process.env.EDITION_LOADER_URL);',
  "const results = {};",
  "for (const scenario of config.scenarios) {",
  "  const opts = {",
  "    encPath: scenario.encPath,",
  "    virtualDir: scenario.virtualDir,",
  "    runtime: scenario.runtime,",
  "    keyHex: scenario.keyHex,",
  "    host: scenario.host,",
  "  };",
  "  if (scenario.expectedPublicCommit !== undefined) opts.expectedPublicCommit = scenario.expectedPublicCommit;",
  "  const activation = await loadEdition(opts);",
  "  results[scenario.id] = {",
  "    state: activation.state,",
  "    bundlePresent: activation.bundlePresent,",
  "    keyId: activation.keyId ?? null,",
  "    buildId: activation.buildId ?? null,",
  "    errorCode: activation.error ? activation.error.code : null,",
  "    edition: activation.edition ?? null,",
  "  };",
  "}",
  "writeFileSync(process.env.OUTPUT_PATH, JSON.stringify(results));",
].join("\n");

interface Scenario {
  id: string;
  encPath: string;
  virtualDir: string;
  runtime: "server" | "desktop" | "web";
  keyHex: string;
  host: Record<string, unknown>;
  expectedPublicCommit?: string;
}

interface ScenarioResult {
  state: string;
  bundlePresent: boolean;
  keyId: string | null;
  buildId: string | null;
  errorCode: string | null;
  edition: unknown;
}

function runEditionScenarios(scenarios: Scenario[]): Record<string, ScenarioResult> {
  const workRoot = mkdtempSync(join(tmpdir(), "kansoku-edition-runner-"));
  try {
    const configPath = join(workRoot, "config.json");
    const outputPath = join(workRoot, "output.json");
    const runnerPath = join(workRoot, "runner.mjs");
    writeFileSync(configPath, JSON.stringify({ scenarios }));
    writeFileSync(runnerPath, RUNNER_SOURCE);
    const editionLoaderUrl = `file://${join(HERE, "..", "src", "pro", "editionLoader.ts")}`;
    execFileSync(process.execPath, ["--import", TSX_LOADER, runnerPath], {
      env: {
        ...process.env,
        CONFIG_PATH: configPath,
        OUTPUT_PATH: outputPath,
        EDITION_LOADER_URL: editionLoaderUrl,
      },
      encoding: "utf8",
    });
    return JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, ScenarioResult>;
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

describe("loadEdition (spawned Node process, real dynamic import)", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("activates server and desktop editions from the same enc, and honors a matching expectedPublicCommit", () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const results = runEditionScenarios([
      {
        id: "serverActive",
        encPath,
        virtualDir: join(root, "vdir-server"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "alice" },
      },
      {
        id: "desktopActive",
        encPath,
        virtualDir: join(root, "vdir-desktop"),
        runtime: "desktop",
        keyHex: KEY_HEX,
        host: { name: "bob" },
      },
      {
        id: "commitMatch",
        encPath,
        virtualDir: join(root, "vdir-commit-match"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "carol" },
        expectedPublicCommit: PUBLIC_COMMIT,
      },
    ]);

    expect(results.serverActive!.state).toBe("active");
    expect(results.serverActive!.errorCode).toBeNull();
    expect(results.serverActive!.keyId).toBe("test");
    expect(results.serverActive!.edition).toEqual({ kind: "server", name: "alice" });

    expect(results.desktopActive!.state).toBe("active");
    expect(results.desktopActive!.errorCode).toBeNull();
    expect(results.desktopActive!.edition).toEqual({ kind: "desktop", name: "bob" });

    expect(results.commitMatch!.state).toBe("active");
    expect(results.commitMatch!.errorCode).toBeNull();
    expect(results.commitMatch!.edition).toEqual({ kind: "server", name: "carol" });
  });

  it("incompatible: entry module's own runtime disagrees with the requested runtime, ABI mismatch", () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "bundle.json": bundleJson({ entries: { server: "desktop/index.mjs" } }),
    });
    roots.push(root);
    const results = runEditionScenarios([
      {
        id: "runtimeMismatch",
        encPath,
        virtualDir: join(root, "vdir-mismatch"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "dave" },
      },
    ]);
    expect(results.runtimeMismatch!.state).toBe("incompatible");
    expect(results.runtimeMismatch!.errorCode).toBe("PRO_EDITION_ABI_MISMATCH");
    expect(results.runtimeMismatch!.edition).toBeNull();
  });

  it("failed: createEdition throwing yields PRO_EDITION_INIT_FAILED", () => {
    const { encPath, root } = stageEnc({
      "bundle.json": bundleJson(),
      "server/index.mjs": THROWING_SERVER_ENTRY,
      "desktop/index.mjs": DESKTOP_ENTRY,
    });
    roots.push(root);
    const results = runEditionScenarios([
      {
        id: "initFailed",
        encPath,
        virtualDir: join(root, "vdir-init-failed"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "erin" },
      },
    ]);
    expect(results.initFailed!.state).toBe("failed");
    expect(results.initFailed!.errorCode).toBe("PRO_EDITION_INIT_FAILED");
    expect(results.initFailed!.edition).toBeNull();
    expect(results.initFailed!.keyId).toBe("test");
    expect(results.initFailed!.buildId).toBe("test-v1");
  });

  it("failed: entry module throws at top-level evaluation yields PRO_EDITION_INIT_FAILED", () => {
    const { encPath, root } = stageEnc({
      "bundle.json": bundleJson(),
      "server/index.mjs": THROWING_AT_TOP_LEVEL_ENTRY,
      "desktop/index.mjs": DESKTOP_ENTRY,
    });
    roots.push(root);
    const results = runEditionScenarios([
      {
        id: "topLevelThrow",
        encPath,
        virtualDir: join(root, "vdir-top-level-throw"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "frank" },
      },
    ]);
    expect(results.topLevelThrow!.state).toBe("failed");
    expect(results.topLevelThrow!.errorCode).toBe("PRO_EDITION_INIT_FAILED");
    expect(results.topLevelThrow!.edition).toBeNull();
    expect(results.topLevelThrow!.keyId).toBe("test");
    expect(results.topLevelThrow!.buildId).toBe("test-v1");
  });

  it("active: unknown runtime key in bundle.json entries does not prevent a valid runtime from loading", () => {
    const { encPath, root } = stageEnc({
      ...FIXTURE_FILES,
      "bundle.json": bundleJson({
        entries: { server: "server/index.mjs", desktop: "desktop/index.mjs", tablet: "desktop/index.mjs" },
      }),
    });
    roots.push(root);
    const results = runEditionScenarios([
      {
        id: "serverActiveWithUnknownKey",
        encPath,
        virtualDir: join(root, "vdir-unknown-runtime-key"),
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "grace" },
      },
    ]);
    expect(results.serverActiveWithUnknownKey!.state).toBe("active");
    expect(results.serverActiveWithUnknownKey!.edition).toEqual({ kind: "server", name: "grace" });
  });

  it("stale-module guard: two different bundles loaded through the same virtualDir do not reuse a stale ESM evaluation", () => {
    const first = stageEnc(FIXTURE_FILES, "first", KEY_HEX);
    roots.push(first.root);
    const second = stageEnc(
      { "bundle.json": bundleJson(), "server/index.mjs": SERVER_ENTRY_V2, "desktop/index.mjs": DESKTOP_ENTRY },
      "second",
      KEY_HEX,
    );
    roots.push(second.root);
    const sharedRoot = mkdtempSync(join(tmpdir(), "kansoku-edition-shared-vdir-"));
    roots.push(sharedRoot);
    const sharedVirtualDir = join(sharedRoot, "vdir");

    const results = runEditionScenarios([
      {
        id: "firstLoad",
        encPath: first.encPath,
        virtualDir: sharedVirtualDir,
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "alice" },
      },
      {
        id: "secondLoad",
        encPath: second.encPath,
        virtualDir: sharedVirtualDir,
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "alice" },
      },
    ]);

    expect(results.firstLoad!.state).toBe("active");
    expect(results.firstLoad!.edition).toEqual({ kind: "server", name: "alice" });
    expect(results.secondLoad!.state).toBe("active");
    expect(results.secondLoad!.edition).toEqual({ kind: "server-v2", name: "alice" });
  });

  it("cache reuse: the same bundle loaded twice through the same virtualDir succeeds both times", () => {
    const { encPath, root } = stageEnc();
    roots.push(root);
    const sharedRoot = mkdtempSync(join(tmpdir(), "kansoku-edition-shared-vdir-"));
    roots.push(sharedRoot);
    const sharedVirtualDir = join(sharedRoot, "vdir");

    const results = runEditionScenarios([
      {
        id: "firstLoad",
        encPath,
        virtualDir: sharedVirtualDir,
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "alice" },
      },
      {
        id: "secondLoad",
        encPath,
        virtualDir: sharedVirtualDir,
        runtime: "server",
        keyHex: KEY_HEX,
        host: { name: "alice" },
      },
    ]);

    expect(results.firstLoad!.state).toBe("active");
    expect(results.firstLoad!.edition).toEqual({ kind: "server", name: "alice" });
    expect(results.secondLoad!.state).toBe("active");
    expect(results.secondLoad!.edition).toEqual({ kind: "server", name: "alice" });
  });
});
