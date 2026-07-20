# Single-Graph Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile host and pro in one vite module graph, isolate pro code into `__pro__/` chunks, encrypt only those chunks into `pro.enc` — so a single dmg is both the free build and (with a key) the Pro build, with no versioned edition ABI anywhere.

**Architecture:** Pro source lives in `apps/pro/overlays/<mirror path>/foo.pro.ts` and is projected into the public repo as gitignored symlinks. A vite resolve plugin prefers `.pro` files when present. Chunk routing sends every chunk containing an `apps/pro/` module to `__pro__/`; two build-fatal assertions keep that boundary airtight. `stagePro` encrypts `__pro__` (node + web) into one `pro.enc` and deletes the plaintext. At runtime the node loader maps decrypted files back onto their original `dist-main/__pro__` paths (so relative imports of shared chunks resolve to the real files — one module graph), and Electron's `app://` handler serves decrypted web chunks from memory at their original paths. Every host reaches pro through exactly one `await import()` wrapped in try/catch; failure means free mode.

**Tech Stack:** vite 8 (rolldown) SSR + browser builds, Electron 43, Node 24 `registerHooks` virtual modules, AES-256-GCM (`KPRO1` format), pnpm workspaces, vitest.

## Global Constraints

- Public repo `kansoku` is public: no private source, license implementation, or credentials may land in it. Pro source lives only in `apps/pro` (a worktree of `kansoku-pro`) and reaches the public tree only as gitignored symlinks.
- Never commit across repos in one commit. Public code, pro code, and superproject pins each commit separately.
- Overlay file convention is **two files**: default `foo.ts`, override `foo.pro.ts`. No `.oss.ts` third file.
- Web Pro UI is **Electron-only**. The standalone server build ships free-only; do not add pro chunk serving to `apps/server`.
- Encrypted container format is `KPRO1`: `"KPRO1"` magic + 12-byte IV + 16-byte GCM authTag + AES-256-GCM ciphertext of `gzip(JSON)`. A golden fixture pins it; do not change the byte format.
- No versioned edition ABI. Do not introduce `EditionEntry`, `abiVersion`, host-object passing, `WebEditionHost`, `pro-asset://`, or a dist-dev protocol.
- Bundle key is 64 hex chars (32 bytes). `KANSOKU_BUNDLE_KEY` / `KANSOKU_BUNDLE_KEY_ID` env, or an activated license key from `licenseState`.
- Free mode is the failure mode: absent bundle, missing key, wrong key, tampered blob, and community build all resolve to a fully working free app, never a crash.
- Chinese (中文白话) for docs in this repo; English for code comments, commits, and PR text.
- Comments: none by default. Only for unexpected behavior or hidden invariants.

---

## Task 0: Branch setup and PR closure

**Files:**
- No source changes; branch and PR state only.

**Interfaces:**
- Produces: public branch `feat/single-graph-overlay` off `origin/main`; pro branch `feat/single-graph-overlay` off pro `origin/main`. Every later task commits onto these.

- [ ] **Step 1: Confirm all five working trees are clean except known user WIP**

Run from the workspace root:

```bash
git -C repos/kansoku status --short
git -C repos/kansoku/apps/pro status --short
```

Expected: the only entries are the user's own bench / LicensePanel / manifest WIP. If anything else is dirty, STOP and report — do not stash or discard.

- [ ] **Step 2: Create the public branch**

```bash
cd repos/kansoku
git fetch origin
git switch -c feat/single-graph-overlay origin/main
```

Expected: `Switched to a new branch 'feat/single-graph-overlay'`.

- [ ] **Step 3: Create the pro branch in the apps/pro worktree**

```bash
cd repos/kansoku/apps/pro
git fetch origin
git switch -c feat/single-graph-overlay origin/main
```

Expected: `Switched to a new branch 'feat/single-graph-overlay'`.

- [ ] **Step 4: Close the superseded PRs**

```bash
cd repos/kansoku
gh pr close 50 --comment "Superseded by the single-graph overlay architecture (docs/superpowers/specs/2026-07-20-single-graph-overlay-design.md). Branch kept as porting material."
cd apps/pro
gh pr close 9 --repo kansoku-trade/kansoku-pro --comment "Superseded by the single-graph overlay architecture. Branch kept as porting material."
```

Expected: both report the PR as closed.

- [ ] **Step 5: Carry the spec onto the new branch**

```bash
cd repos/kansoku
git checkout codex/pro-overlay-poc -- docs/superpowers/specs/2026-07-20-single-graph-overlay-design.md
git add docs/superpowers/specs/2026-07-20-single-graph-overlay-design.md
git commit -m "docs(spec): single-graph overlay architecture"
```

Expected: one commit containing only the spec file.

---

## Task 1: Port the build-overlay package

**Files:**
- Create (port from branch `codex/pro-overlay-poc`): `packages/build-overlay/` — `package.json`, `tsconfig.json`, `README.md`, `.gitignore`, `src/index.ts`, `scripts/sync.mjs`, `scripts/overlaySync.mjs`, `scripts/overlaySync.d.mts`, `eslint/plugin.mjs`, `eslint/plugin.d.mts`, `test/resolve.test.ts`, `test/sync.test.ts`, `test/eslintRules.test.ts`
- Create (new, not ported): `packages/build-overlay/src/chunkGuard.ts`, `packages/build-overlay/test/chunkGuard.test.ts`
- Do NOT port: `packages/build-overlay/poc/` (retired — the real pipelines are the regression test)
- Modify: `pnpm-workspace.yaml` (if `packages/*` is not already a glob), root `package.json` (add `overlay:sync` / `overlay:check` scripts)

**Interfaces:**
- Produces:
  - `proOverlayPlugin(options?: { overlayRoot?: string }): Plugin` from `packages/build-overlay/src/index.ts` — a vite/rolldown plugin whose `resolveId` prefers `<base>.pro.<ext>` when that file exists under `overlayRoot`. Task 3, 4 and 6 consume it.
  - `isProModule(id: string): boolean` and `proLeakGuard(options: { proDir: string }): Plugin` from `packages/build-overlay/src/chunkGuard.ts` — ONE shared implementation of the two build-fatal chunk-boundary assertions, consumed by both the desktop and web configs (Tasks 3 and 4). `proDir` is the chunk-path segment that marks encrypted output (`'__pro__/'`); a chunk counts as encrypted when its emitted name contains that segment, which covers both `__pro__/x.mjs` (desktop) and `assets/__pro__/x.js` (web).
  - `node packages/build-overlay/scripts/sync.mjs [--check]` — creates/updates/removes projection symlinks, writes `.kansoku-overlay-links.json`; `--check` is read-only and exits non-zero on drift. Tasks 2 and 9 consume it.
  - ESLint plugin at `packages/build-overlay/eslint/plugin.mjs` exporting rules `no-explicit-pro-import`, `no-apps-pro-import`, `no-pro-only-resolution`, `no-self-default-import`, `overlay-manifest-consistency`, `no-escaping-import`. Task 2 consumes it.

- [ ] **Step 1: Copy the package from the porting branch**

```bash
cd repos/kansoku
git checkout codex/pro-overlay-poc -- packages/build-overlay
git rm -r --cached packages/build-overlay/poc
rm -rf packages/build-overlay/poc
```

Expected: `packages/build-overlay` present without `poc/`.

- [ ] **Step 2: Drop POC references from the package**

Open `packages/build-overlay/package.json` and `packages/build-overlay/README.md`. Remove any script or prose that points at `poc/`. The scripts block must end up exactly:

```json
  "scripts": {
    "check": "node scripts/sync.mjs --check",
    "sync": "node scripts/sync.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 3: Delete POC-dependent tests, keep the rest**

The three test files test the plugin, the sync script, and the ESLint rules against temp fixtures, not against `poc/`. Verify:

```bash
grep -rn "poc/" packages/build-overlay/test/ packages/build-overlay/src/ packages/build-overlay/scripts/ packages/build-overlay/eslint/
```

Expected: no output. If any hit appears, remove that test case or fixture reference.

- [ ] **Step 4: Run the package tests**

```bash
cd repos/kansoku
pnpm install
pnpm --filter @kansoku/build-overlay test
```

Expected: all tests pass. If a test fails because it referenced the POC, fix the test to use its own temp fixture.

- [ ] **Step 5: Typecheck the package**

```bash
pnpm --filter @kansoku/build-overlay typecheck
```

Expected: no output (success).

- [ ] **Step 5b: Write the shared chunk-guard test**

Create `packages/build-overlay/test/chunkGuard.test.ts`:

```ts
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isProModule, proLeakGuard } from '../src/chunkGuard.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function runGuard(bundle: Record<string, unknown>): string | null {
  const plugin = proLeakGuard({ proDir: '__pro__/' });
  let error: string | null = null;
  const ctx = {
    error(message: string) {
      error = message;
      throw new Error(message);
    },
  };
  try {
    (plugin.generateBundle as (this: typeof ctx, o: unknown, b: unknown) => void).call(ctx, {}, bundle);
  } catch {
    // guard reported via ctx.error; message captured above
  }
  return error;
}

describe('isProModule', () => {
  it('matches a path inside apps/pro', () => {
    expect(isProModule('/repo/apps/pro/overlays/apps/web/src/x.pro.tsx')).toBe(true);
  });

  it('does not match a public path that merely mentions pro', () => {
    expect(isProModule('/repo/apps/web/src/proHelpers.ts')).toBe(false);
  });

  it('strips vite query suffixes before deciding', () => {
    expect(isProModule('/repo/apps/pro/overlays/x.pro.ts?used')).toBe(true);
  });

  it('follows a symlink projection back into apps/pro', () => {
    const root = mkdtempSync(join(tmpdir(), 'kansoku-guard-'));
    roots.push(root);
    mkdirSync(join(root, 'apps', 'pro', 'overlays'), { recursive: true });
    mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
    const real = join(root, 'apps', 'pro', 'overlays', 'page.pro.tsx');
    const link = join(root, 'apps', 'web', 'src', 'page.pro.tsx');
    writeFileSync(real, 'export default null;\n');
    symlinkSync(real, link);
    expect(isProModule(link)).toBe(true);
  });
});

describe('proLeakGuard', () => {
  it('passes when pro modules stay inside the encrypted dir', () => {
    expect(
      runGuard({
        'main.mjs': { type: 'chunk', modules: { '/repo/apps/desktop/src/main.ts': {} }, imports: [] },
        '__pro__/pro-a1.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/edition.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('recognises the encrypted dir under a nested asset prefix', () => {
    expect(
      runGuard({
        'assets/index-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/web/src/main.tsx': {} },
          imports: [],
        },
        'assets/__pro__/pro-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/apps/web/src/edition/pro.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('fails when a pro module lands in a public chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/leaked.pro.ts': {} },
          imports: [],
        },
      }),
    ).toContain('pro module outside');
  });

  it('fails when a public chunk statically imports an encrypted chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/main.ts': {} },
          imports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toContain('statically imports encrypted chunk');
  });

  it('allows a public chunk to reach the encrypted dir dynamically', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/edition/pro.ts': {} },
          imports: [],
          dynamicImports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 5c: Run it to verify it fails**

```bash
cd repos/kansoku && pnpm --filter @kansoku/build-overlay vitest run test/chunkGuard.test.ts
```

Expected: FAIL — cannot resolve `../src/chunkGuard.js`.

- [ ] **Step 5d: Implement the shared chunk guard**

Create `packages/build-overlay/src/chunkGuard.ts`:

```ts
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import type { Plugin } from 'vite';

const PRO_PATH_MARKER = `${sep}apps${sep}pro${sep}`;

export function isProModule(id: string): boolean {
  const path = id.split('?')[0]!;
  if (path.includes(PRO_PATH_MARKER)) return true;
  try {
    return realpathSync(path).includes(PRO_PATH_MARKER);
  } catch {
    return false;
  }
}

export interface ProLeakGuardOptions {
  // Chunk-path segment marking encrypted output. A chunk counts as encrypted
  // when its emitted name contains this segment, so both '__pro__/x.mjs' and
  // 'assets/__pro__/x.js' are recognised.
  proDir: string;
}

// This dir IS the paid-code boundary: stagePro encrypts it into pro.enc and
// deletes the plaintext. Two invariants, both build-fatal:
//   1. no pro module may land in a chunk outside it (it would ship
//      unencrypted);
//   2. no chunk outside it may STATICALLY import a chunk inside it — the
//      plaintext is gone in shipped builds, so a static edge crashes the free
//      app at startup. The composition point's dynamic import is the only
//      legal edge, and it is wrapped in try/catch.
export function proLeakGuard({ proDir }: ProLeakGuardOptions): Plugin {
  const isEncrypted = (fileName: string) => fileName.includes(proDir);

  return {
    name: 'kansoku:pro-leak-guard',
    generateBundle(_options, bundle) {
      const problems: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || isEncrypted(fileName)) continue;
        for (const id of Object.keys(chunk.modules)) {
          if (isProModule(id)) {
            problems.push(`pro module outside ${proDir} — ${fileName}: ${id}`);
          }
        }
        for (const imported of chunk.imports) {
          if (isEncrypted(imported)) {
            problems.push(
              `public chunk statically imports encrypted chunk — ${fileName} -> ${imported}`,
            );
          }
        }
      }
      if (problems.length > 0) {
        this.error(`pro chunk boundary violated:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      }
    },
  };
}
```

Export both from `packages/build-overlay/src/index.ts`:

```ts
export { isProModule, proLeakGuard, type ProLeakGuardOptions } from './chunkGuard.js';
```

- [ ] **Step 5e: Run the test to verify it passes**

```bash
cd repos/kansoku && pnpm --filter @kansoku/build-overlay vitest run test/chunkGuard.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 6: Add root convenience scripts**

In the root `package.json` `scripts` block, add:

```json
    "overlay:sync": "pnpm --filter @kansoku/build-overlay sync",
    "overlay:check": "pnpm --filter @kansoku/build-overlay check",
```

- [ ] **Step 7: Commit**

```bash
git add packages/build-overlay package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(build-overlay): port the overlay resolver, sync script, and lint rules"
```

---

## Task 2: Wire lint, gitignore, and pro-side overlay scaffolding

**Files:**
- Modify: `eslint.config.mjs` (public repo root) — register the overlay ESLint plugin and rules
- Modify: `.gitignore` (public repo root) — ignore `*.pro.ts`, `*.pro.tsx`, `*.pro.mts`, `*.pro.cts` and `.kansoku-overlay-links.json`
- Create (pro repo): `apps/pro/overlay.private-only.json`
- Create (pro repo): `apps/pro/overlays/.gitkeep`
- Modify (pro repo): `apps/pro/eslint.config.mjs` — enable `no-explicit-pro-import`, `no-self-default-import`, `overlay-manifest-consistency`, `no-escaping-import` over `overlays/**`

**Interfaces:**
- Consumes: ESLint plugin from Task 1.
- Produces: `apps/pro/overlays/` as the single home for pro overlay files; `apps/pro/overlay.private-only.json` with shape `{ "files": string[] }` listing pro-only overlays (paths relative to the public repo root, e.g. `apps/web/src/pages/research/ResearchPage.pro.tsx`).

- [ ] **Step 1: Ignore projections in the public repo**

Append to `.gitignore`:

```gitignore
# Pro overlay projections (symlinks into apps/pro/overlays) — never committed
*.pro.ts
*.pro.tsx
*.pro.mts
*.pro.cts
.kansoku-overlay-links.json
```

- [ ] **Step 2: Register the lint rules in the public config**

Port the overlay block from the porting branch:

```bash
git show codex/pro-overlay-poc:eslint.config.mjs > /tmp/overlay-eslint-ref.mjs
```

Read `/tmp/overlay-eslint-ref.mjs`, copy the `@kansoku/build-overlay/eslint` import and the block enabling `no-explicit-pro-import`, `no-apps-pro-import`, `no-pro-only-resolution`, `no-escaping-import` into the current `eslint.config.mjs`, adapting to the current file's structure. Do not copy unrelated changes.

- [ ] **Step 3: Verify lint still runs clean on the untouched tree**

```bash
pnpm lint
```

Expected: exits 0. If a new rule fires on existing public code, that is a real finding — fix the code, not the rule.

- [ ] **Step 4: Create the pro-side scaffolding**

```bash
cd apps/pro
mkdir -p overlays
touch overlays/.gitkeep
cat > overlay.private-only.json <<'JSON'
{
  "files": []
}
JSON
```

- [ ] **Step 5: Enable the pro-side lint rules**

```bash
git show codex/pro-overlay-poc:eslint.config.mjs > /tmp/pro-eslint-ref.mjs
```

Read `/tmp/pro-eslint-ref.mjs` and merge the `overlays/**` block (rules `no-explicit-pro-import`, `no-self-default-import`, `overlay-manifest-consistency`, `no-escaping-import`) into `apps/pro/eslint.config.mjs`.

- [ ] **Step 6: Verify sync is a no-op on an empty overlays dir**

```bash
cd repos/kansoku
pnpm overlay:check
```

Expected: exits 0, reports zero projections.

- [ ] **Step 7: Commit both repos separately**

```bash
cd repos/kansoku
git add .gitignore eslint.config.mjs
git commit -m "chore(lint): enable overlay dependency-direction rules; ignore projections"

cd apps/pro
git add overlays/.gitkeep overlay.private-only.json eslint.config.mjs
git commit -m "chore(overlays): scaffold the overlay root and private-only manifest"
```

---

## Task 3: Desktop main-process chunk isolation

**Files:**
- Modify: `apps/desktop/vite.main.config.ts` — swap the `apps/pro/src` entry model for overlay-driven chunk routing
- Create: `apps/desktop/test/build/proChunkRouting.test.ts`

**Interfaces:**
- Consumes: `proOverlayPlugin`, `isProModule`, `proLeakGuard` from Task 1 (`@kansoku/build-overlay`).
- Produces: desktop main build emits pro chunks under `dist-main/__pro__/`; `chunkFileNamesFor` is exported from the config module so the routing rule is testable without running a build.

- [ ] **Step 1: Write the chunk-routing test first**

The guard itself is already tested in Task 1. What is untested here is this config's routing rule: which emitted name a chunk gets.

Create `apps/desktop/test/build/proChunkRouting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chunkFileNamesFor } from '../../vite.main.config.js';

describe('chunkFileNamesFor (desktop)', () => {
  it('routes a chunk containing a pro module into __pro__', () => {
    const name = chunkFileNamesFor({
      name: 'edition',
      moduleIds: ['/repo/apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts'],
      facadeModuleId: null,
    });
    expect(name).toBe('__pro__/[name]-[hash].mjs');
  });

  it('routes a public chunk to the normal location', () => {
    const name = chunkFileNamesFor({
      name: 'kernel',
      moduleIds: ['/repo/apps/desktop/src/boot/kernel.ts'],
      facadeModuleId: null,
    });
    expect(name).toBe('[name]-[hash].mjs');
  });

  it('routes a module-less pro facade chunk into __pro__', () => {
    const name = chunkFileNamesFor({
      name: 'facade',
      moduleIds: [],
      facadeModuleId: '/repo/apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts',
    });
    expect(name).toBe('__pro__/[name]-[hash].mjs');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/desktop && pnpm vitest run test/build/proChunkRouting.test.ts
```

Expected: FAIL — `chunkFileNamesFor` is not exported.

- [ ] **Step 3: Rewrite the config's pro handling**

Replace the top of `apps/desktop/vite.main.config.ts` (everything above `export default defineConfig`) with this. The key change from what is on main: pro modules are identified by realpath landing under `apps/pro/`, not by a fixed `apps/pro/src` entry, and pro enters the graph through overlay resolution rather than a second rollup input.

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { isProModule, proLeakGuard, proOverlayPlugin } from '@kansoku/build-overlay';

const desktopDir = fileURLToPath(new URL('.', import.meta.url));
const overlayRoot = fileURLToPath(new URL('../pro/overlays', import.meta.url));
const proPresent = process.env.KANSOKU_FORCE_FREE !== '1' && existsSync(overlayRoot);
const isDev = process.env.KANSOKU_DESKTOP_DEV === '1';

export const PRO_CHUNK_DIR = '__pro__/';

export interface ChunkNameInput {
  name: string;
  moduleIds: readonly string[];
  facadeModuleId: string | null;
}

export function chunkFileNamesFor(chunk: ChunkNameInput): string {
  const isPro =
    chunk.moduleIds.some(isProModule) ||
    (chunk.facadeModuleId != null && isProModule(chunk.facadeModuleId));
  return isPro ? `${PRO_CHUNK_DIR}[name]-[hash].mjs` : '[name]-[hash].mjs';
}
```

- [ ] **Step 4: Point the build at a single entry with pro chunk routing**

In the same file, `build.rollupOptions` becomes:

```ts
    rollupOptions: {
      input: { main: fileURLToPath(new URL('./src/main.ts', import.meta.url)) },
      external: [/^electron($|\/)/, /^better-sqlite3($|\/)/, /^electron-sparkle-updater($|\/)/],
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: chunkFileNamesFor,
      },
    },
```

And the plugins array:

```ts
  plugins: [
    ...(proPresent ? [proOverlayPlugin({ overlayRoot })] : []),
    proLeakGuard({ proDir: PRO_CHUNK_DIR }),
  ],
```

Leave the rest of the config (ssr.noExternal, external list, outDir, target, define) exactly as it is.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/desktop && pnpm vitest run test/build/proChunkRouting.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Verify the free build still builds**

```bash
cd apps/desktop && KANSOKU_FORCE_FREE=1 pnpm build
ls dist-main/__pro__ 2>&1
```

Expected: build succeeds; the `ls` reports "No such file or directory".

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/vite.main.config.ts apps/desktop/test/build/proChunkRouting.test.ts
git commit -m "build(desktop): route pro chunks into __pro__ via overlay resolution"
```

---

## Task 4: Web build chunk isolation

**Files:**
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/test/build/proChunkRouting.test.ts`

**Interfaces:**
- Consumes: `proOverlayPlugin`, `isProModule`, `proLeakGuard` from Task 1 — the SAME shared implementation Task 3 uses. Do not redefine either function here.
- Produces: web build emits pro chunks under `dist/assets/__pro__/`; `chunkFileNamesFor` exported for the test.

- [ ] **Step 1: Write the chunk-routing test first**

Create `apps/web/test/build/proChunkRouting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chunkFileNamesFor } from '../../vite.config.js';

describe('chunkFileNamesFor (web)', () => {
  it('routes a chunk containing a pro module under assets/__pro__', () => {
    const name = chunkFileNamesFor({
      name: 'research',
      moduleIds: ['/repo/apps/pro/overlays/apps/web/src/pages/research/ResearchPage.pro.tsx'],
      facadeModuleId: null,
    });
    expect(name).toBe('assets/__pro__/[name]-[hash].js');
  });

  it('routes a public chunk to the normal assets location', () => {
    const name = chunkFileNamesFor({
      name: 'home',
      moduleIds: ['/repo/apps/web/src/pages/Home.tsx'],
      facadeModuleId: null,
    });
    expect(name).toBe('assets/[name]-[hash].js');
  });

  it('routes a module-less pro facade chunk under assets/__pro__', () => {
    const name = chunkFileNamesFor({
      name: 'facade',
      moduleIds: [],
      facadeModuleId: '/repo/apps/pro/overlays/apps/web/src/edition/pro.pro.ts',
    });
    expect(name).toBe('assets/__pro__/[name]-[hash].js');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/web && pnpm vitest run test/build/proChunkRouting.test.ts
```

Expected: FAIL — `chunkFileNamesFor` is not exported.

- [ ] **Step 3: Add overlay resolution and chunk routing to the web config**

In `apps/web/vite.config.ts`, add to the imports:

```ts
import { existsSync } from 'node:fs';
import { isProModule, proLeakGuard, proOverlayPlugin } from '@kansoku/build-overlay';
```

and above `export default defineConfig`:

```ts
const overlayRoot = fileURLToPath(new URL('../pro/overlays', import.meta.url));
const proPresent = process.env.KANSOKU_FORCE_FREE !== '1' && existsSync(overlayRoot);

export const PRO_CHUNK_DIR = '__pro__/';

export interface ChunkNameInput {
  name: string;
  moduleIds: readonly string[];
  facadeModuleId: string | null;
}

export function chunkFileNamesFor(chunk: ChunkNameInput): string {
  const isPro =
    chunk.moduleIds.some(isProModule) ||
    (chunk.facadeModuleId != null && isProModule(chunk.facadeModuleId));
  return isPro ? `assets/${PRO_CHUNK_DIR}[name]-[hash].js` : 'assets/[name]-[hash].js';
}
```

- [ ] **Step 4: Register the plugins and chunk naming**

The `plugins` array becomes:

```ts
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    ...(proPresent ? [proOverlayPlugin({ overlayRoot })] : []),
    proLeakGuard({ proDir: PRO_CHUNK_DIR }),
  ],
```

Add a `build` block (or extend the existing one):

```ts
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: chunkFileNamesFor,
      },
    },
  },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/build/proChunkRouting.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Verify the free web build**

```bash
cd apps/web && KANSOKU_FORCE_FREE=1 pnpm build
ls dist/assets/__pro__ 2>&1
```

Expected: build succeeds; `ls` reports "No such file or directory".

- [ ] **Step 7: Commit**

```bash
git add apps/web/vite.config.ts apps/web/test/build/proChunkRouting.test.ts
git commit -m "build(web): route pro chunks into assets/__pro__ via overlay resolution"
```

---

## Task 5: Composition points — the single dynamic-import boundary

**Files:**
- Create: `apps/desktop/src/edition/pro.ts` (default, free)
- Create: `apps/desktop/src/edition/types.ts`
- Create: `apps/desktop/test/edition/proComposition.test.ts`
- Create: `apps/web/src/edition/pro.ts` (default, free)
- Create: `apps/web/src/edition/types.ts`
- Create: `apps/web/test/edition/proComposition.test.ts`
- Create: `apps/server/src/edition/pro.ts` (default, free)
- Create: `apps/server/src/edition/types.ts`

**Interfaces:**
- Produces the three composition contracts every later task builds on:

```ts
// apps/desktop/src/edition/types.ts
import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { ProChannel } from '@kansoku/pro-api';

export interface DesktopProComposition {
  ipcServices: readonly IpcServiceConstructor[];
  realtimeChannels: readonly ProChannel[];
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}

// apps/web/src/edition/types.ts
import type { ComponentType } from 'react';

export interface WebProComposition {
  routes: Readonly<Record<string, ComponentType>>;
}

// apps/server/src/edition/types.ts
export interface ServerProComposition {
  modules: readonly unknown[];
  start?: () => Promise<void> | void;
}
```

- Each `edition/pro.ts` exports `loadProComposition(): Promise<X | null>` returning `null`. The `.pro.ts` overrides (Task 7) return real compositions. Hosts call only `loadProComposition()`.

- [ ] **Step 1: Write the desktop composition test first**

Create `apps/desktop/test/edition/proComposition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadProComposition } from '../../src/edition/pro.js';

describe('desktop loadProComposition (default/free)', () => {
  it('resolves to null so the host runs free', async () => {
    await expect(loadProComposition()).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/desktop && pnpm vitest run test/edition/proComposition.test.ts
```

Expected: FAIL — cannot resolve `../../src/edition/pro.js`.

- [ ] **Step 3: Write the desktop types and default composition**

`apps/desktop/src/edition/types.ts`:

```ts
import type { IpcServiceConstructor } from 'electron-ipc-decorator';
import type { ProChannel } from '@kansoku/pro-api';

export interface DesktopProComposition {
  ipcServices: readonly IpcServiceConstructor[];
  realtimeChannels: readonly ProChannel[];
  start?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}
```

`apps/desktop/src/edition/pro.ts`:

```ts
import type { DesktopProComposition } from './types.js';

export async function loadProComposition(): Promise<DesktopProComposition | null> {
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/desktop && pnpm vitest run test/edition/proComposition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the web composition test**

Create `apps/web/test/edition/proComposition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadProComposition } from '../../src/edition/pro';

describe('web loadProComposition (default/free)', () => {
  it('resolves to null so no pro routes exist', async () => {
    await expect(loadProComposition()).resolves.toBeNull();
  });
});
```

- [ ] **Step 6: Write the web types and default composition**

`apps/web/src/edition/types.ts`:

```ts
import type { ComponentType } from 'react';

export interface WebProComposition {
  routes: Readonly<Record<string, ComponentType>>;
}
```

`apps/web/src/edition/pro.ts`:

```ts
import type { WebProComposition } from './types';

export async function loadProComposition(): Promise<WebProComposition | null> {
  return null;
}
```

- [ ] **Step 7: Write the server types and default composition**

`apps/server/src/edition/types.ts`:

```ts
export interface ServerProComposition {
  modules: readonly unknown[];
  start?: () => Promise<void> | void;
}
```

`apps/server/src/edition/pro.ts`:

```ts
import type { ServerProComposition } from './types.js';

export async function loadProComposition(): Promise<ServerProComposition | null> {
  return null;
}
```

- [ ] **Step 8: Run web and desktop tests**

```bash
cd apps/web && pnpm vitest run test/edition/proComposition.test.ts
cd ../desktop && pnpm vitest run test/edition/proComposition.test.ts
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/edition apps/desktop/test/edition apps/web/src/edition apps/web/test/edition apps/server/src/edition
git commit -m "feat(edition): add the free composition points hosts resolve pro through"
```

---

## Task 6: Host wiring — consume the composition points

**Files:**
- Modify: `apps/desktop/src/boot/kernel.ts`
- Modify: `apps/web/src/PageRouter.tsx`
- Create: `apps/web/src/edition/useProRoutes.ts`
- Create: `apps/web/test/edition/useProRoutes.test.tsx`
- Modify: `apps/server/src/runtimeInit.ts`
- Modify: `apps/desktop/test/boot/kernel.test.ts`

**Interfaces:**
- Consumes: `loadProComposition()` from Task 5.
- Produces: `useProRoutes(): Record<string, ComponentType> | null` from `apps/web/src/edition/useProRoutes.ts` — a hook returning pro routes once resolved, `null` until then and forever in free mode.

- [ ] **Step 1: Wire the desktop kernel**

In `apps/desktop/src/boot/kernel.ts`, after `createKernel()` and before `createServices` consumers get their list, add:

```ts
  const proComposition = await import('../edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[desktop] pro composition unavailable, running free', error);
      return null;
    });
```

Then extend the returned `ipcServiceClasses` and the realtime bridge call:

```ts
  attachRealtimeBridge(proComposition?.realtimeChannels ?? []);
  await proComposition?.start?.();

  return {
    kernel,
    ipcServiceClasses: [
      ...nonAiIpcServiceClasses,
      ...(proComposition?.ipcServices ?? []),
    ] as const,
    dispose: async () => {
      await proComposition?.dispose?.();
    },
  };
```

- [ ] **Step 2: Write the web hook test**

Create `apps/web/test/edition/useProRoutes.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const loadProComposition = vi.hoisted(() => vi.fn());
vi.mock('../../src/edition/pro', () => ({ loadProComposition }));

import { useProRoutes } from '../../src/edition/useProRoutes';

describe('useProRoutes', () => {
  it('stays null in free mode', async () => {
    loadProComposition.mockResolvedValue(null);
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('exposes routes once the pro composition resolves', async () => {
    const Page = () => null;
    loadProComposition.mockResolvedValue({ routes: { '/research': Page } });
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!['/research']).toBe(Page);
  });

  it('stays null when the pro chunk fails to load', async () => {
    loadProComposition.mockRejectedValue(new Error('chunk missing'));
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd apps/web && pnpm vitest run test/edition/useProRoutes.test.tsx
```

Expected: FAIL — cannot resolve `../../src/edition/useProRoutes`.

- [ ] **Step 4: Implement the hook**

Create `apps/web/src/edition/useProRoutes.ts`:

```ts
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

let cached: Promise<Record<string, ComponentType> | null> | null = null;

// The import of ./pro MUST stay dynamic. A static edge would merge the pro
// chunk into this public chunk, which either ships paid code unencrypted or
// breaks the free build once the plaintext is stripped.
function resolveProRoutes(): Promise<Record<string, ComponentType> | null> {
  cached ??= import('./pro')
    .then((m) => m.loadProComposition())
    .then((composition) => (composition ? { ...composition.routes } : null))
    .catch(() => null);
  return cached;
}

export function useProRoutes(): Record<string, ComponentType> | null {
  const [routes, setRoutes] = useState<Record<string, ComponentType> | null>(null);

  useEffect(() => {
    let active = true;
    void resolveProRoutes().then((resolved) => {
      if (active) setRoutes(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return routes;
}

export function resetProRoutesForTests(): void {
  cached = null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/edition/useProRoutes.test.tsx
```

Expected: 3 tests PASS. If the module-level cache leaks between cases, call `resetProRoutesForTests()` in a `beforeEach`.

- [ ] **Step 6: Consume the hook in the router**

In `apps/web/src/PageRouter.tsx`, inside `Router()`, after `const pathname = routePathname(route);` add:

```tsx
  const proRoutes = useProRoutes();
  const ProPage = proRoutes?.[pathname];
  if (ProPage) return <ProPage />;
```

Add the import `import { useProRoutes } from './edition/useProRoutes';`. Public route matching stays exactly as-is below this — pro routes win only when a pro composition supplied that exact pathname.

- [ ] **Step 7: Wire the server runtime**

In `apps/server/src/runtimeInit.ts`, replace the `loadPro(...)` call and its `getPro()` consumers with:

```ts
  const proComposition = await import('./edition/pro.js')
    .then((m) => m.loadProComposition())
    .catch((error: unknown) => {
      console.warn('[server] pro composition unavailable, running free', error);
      return null;
    });
  await proComposition?.start?.();
```

Return `proComposition` from `initServerRuntime` so `bootstrap.ts` can pass `proComposition?.modules ?? []` into the Tsuki root module. Update `ServerRuntimeOptions` to drop `proAppDir` and `proEntry`.

- [ ] **Step 8: Update the desktop kernel test**

In `apps/desktop/test/boot/kernel.test.ts`, replace any `@kansoku/core/pro/registry` mock with:

```ts
const loadProComposition = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../src/edition/pro.js', () => ({ loadProComposition }));
```

and add a case asserting a rejecting `loadProComposition` still boots:

```ts
it('boots free when the pro composition rejects', async () => {
  loadProComposition.mockRejectedValueOnce(new Error('chunk missing'));
  const result = await bootKernel();
  expect(result.ipcServiceClasses).toEqual(nonAiIpcServiceClasses);
});
```

- [ ] **Step 9: Run the affected suites**

```bash
cd apps/desktop && pnpm test
cd ../web && pnpm test
cd ../server && pnpm test
```

Expected: all green. Fix any test that still references `getPro` / `loadPro` / `registry`.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/boot/kernel.ts apps/desktop/test/boot/kernel.test.ts apps/web/src/PageRouter.tsx apps/web/src/edition apps/web/test/edition apps/server/src/runtimeInit.ts apps/server/src/bootstrap.ts
git commit -m "feat(edition): resolve pro through the composition points in all three hosts"
```

---

## Task 7: Port pro source into overlays

**Files (pro repo):**
- Create: `apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts`
- Create: `apps/pro/overlays/apps/web/src/edition/pro.pro.ts`
- Create: `apps/pro/overlays/apps/server/src/edition/pro.pro.ts`
- Create: `apps/pro/overlays/apps/web/src/pages/research/ResearchPage.pro.tsx` and the other pro pages (exact set determined in Step 1)
- Modify: `apps/pro/overlay.private-only.json`
- Keep in place: `apps/pro/src/**` (services, modules, AI, license client) — overlays import from it by relative path

**Interfaces:**
- Consumes: `DesktopProComposition` / `WebProComposition` / `ServerProComposition` from Task 5.
- Produces: three `.pro.ts` composition overrides returning real compositions.

- [ ] **Step 1: Inventory what the porting branch put on the web side**

```bash
cd repos/kansoku/apps/pro
git ls-tree -r --name-only codex/pro-overlay-poc -- src/web | sed 's|^src/web/||'
```

Write down the resulting file list — it is the set of pro pages to place under `overlays/apps/web/src/…`. Each file's destination mirrors where the public repo would host it (a page rendered at `/research` goes to `overlays/apps/web/src/pages/research/`).

- [ ] **Step 2: Copy the pro page sources**

For each file from Step 1:

```bash
git show codex/pro-overlay-poc:src/web/<path> > overlays/apps/web/src/<mirror-path>
```

Rename each to end in `.pro.tsx` / `.pro.ts`. Then rewrite their imports: anything that reached the host through the WebEditionHost ABI (host-injected React, api client, realtime) becomes a normal import of the public module (`@web/client`, `@web/apiHooks`, `react`), because they are now in the same module graph.

- [ ] **Step 3: Write the web composition override**

`apps/pro/overlays/apps/web/src/edition/pro.pro.ts`:

```ts
import type { WebProComposition } from './types';
import { ResearchPage } from '../pages/research/ResearchPage.pro';

export async function loadProComposition(): Promise<WebProComposition | null> {
  return {
    routes: {
      '/research': ResearchPage,
    },
  };
}
```

Extend `routes` with every pathname the Step 1 inventory covers. The `./types` import resolves to the public repo's `apps/web/src/edition/types.ts` through the projection — do not copy that file into overlays.

- [ ] **Step 4: Write the desktop composition override**

`apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts`:

```ts
import type { DesktopProComposition } from './types.js';

export async function loadProComposition(): Promise<DesktopProComposition | null> {
  const [{ proIpcServices }, { proRealtimeChannels }, { startProSchedulers, stopProSchedulers }] =
    await Promise.all([
      import('../../../../../src/ipc/index.js'),
      import('../../../../../src/server/realtime/channels.js'),
      import('../../../../../src/schedulers.js'),
    ]);

  return {
    ipcServices: proIpcServices,
    realtimeChannels: proRealtimeChannels,
    start: startProSchedulers,
    dispose: stopProSchedulers,
  };
}
```

Adjust the relative depth and the exported names to what `apps/pro/src` actually provides — check with `git grep -n "export const proIpcServices\|export function startProSchedulers" src/`. If those aggregate exports do not exist, create them in `apps/pro/src` as thin barrels rather than inlining lists here.

- [ ] **Step 5: Write the server composition override**

`apps/pro/overlays/apps/server/src/edition/pro.pro.ts`:

```ts
import type { ServerProComposition } from './types.js';

export async function loadProComposition(): Promise<ServerProComposition | null> {
  const { proServerModules, startProServer } = await import('../../../../../src/server/index.js');
  return { modules: proServerModules, start: startProServer };
}
```

Again verify the exported names against `apps/pro/src/server/`.

- [ ] **Step 6: Register pro-only overlays**

Every overlay whose public sibling does not exist (all the pro pages) must be listed in `apps/pro/overlay.private-only.json`:

```json
{
  "files": [
    "apps/web/src/pages/research/ResearchPage.pro.tsx"
  ]
}
```

List every pro-only file from Step 2. The three `edition/pro.pro.ts` files have public siblings and must NOT be listed.

- [ ] **Step 7: Sync and verify the projections**

```bash
cd repos/kansoku
pnpm overlay:sync
pnpm overlay:check
```

Expected: sync reports the created symlinks; check exits 0.

- [ ] **Step 8: Lint the pro side**

```bash
cd apps/pro && pnpm lint
```

Expected: exits 0. `overlay-manifest-consistency` catches any pro-only file missing from the manifest — fix the manifest, not the rule.

- [ ] **Step 9: Typecheck in pro mode**

```bash
cd repos/kansoku && pnpm typecheck:pro
```

Expected: no errors. This is the first proof the overlays resolve against the public types.

- [ ] **Step 10: Commit (pro repo only)**

```bash
cd apps/pro
git add overlays overlay.private-only.json src
git commit -m "feat(overlays): compose pro through the host composition points"
```

---

## Task 8: Encryption pipeline

**Files:**
- Modify: `apps/pro/scripts/packEnc.mjs` (pro repo) — accept two staged dirs, drop ABI fields
- Modify: `apps/desktop/scripts/stagePro.mjs` — stage node + web `__pro__` into one `pro.enc`
- Modify: `packages/core/src/pro/loader.ts` — decrypt and expose files, no ProModule registry
- Modify: `packages/core/src/pro/encLoader.ts` — expose the decrypted web files to the caller
- Create: `apps/pro/src/entries/canary.ts` (pro repo) — imported by the three composition overrides
- Modify: `apps/desktop/scripts/afterPack.cjs` — canary scan
- Create: `packages/core/test/pro-loader.test.ts`

**Interfaces:**
- Consumes: `__pro__` dirs produced by Tasks 3 and 4.
- Produces:
  - `packEnc.mjs --node <dir> --web <dir> --out <file>` writing the `KPRO1` blob; `bundle.json` inside carries `{ formatVersion: 1, buildId, publicCommit, proCommit }` — no `editionAbiVersion`, no `entries`.
  - `loadPro(appDir?: string): Promise<{ webFiles: Map<string, Buffer> } | null>` from `packages/core/src/pro/loader.ts` — decrypts, registers node virtual modules at their original `dist-main/__pro__` paths, returns the web files for Task 9. Returns `null` in every free-mode case.

- [ ] **Step 1: Write the loader test first**

Create `packages/core/test/pro-loader.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPro } from '../src/pro/loader.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function stageAppDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'kansoku-loader-'));
  roots.push(root);
  mkdirSync(join(root, 'pro'), { recursive: true });
  return root;
}

describe('loadPro', () => {
  it('returns null when pro.enc is absent', async () => {
    await expect(loadPro(stageAppDir())).resolves.toBeNull();
  });

  it('returns null when pro.enc is present but no key is available', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1'));
    await expect(loadPro(root)).resolves.toBeNull();
  });

  it('returns null on a tampered blob rather than throwing', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1garbage'));
    process.env.KANSOKU_BUNDLE_KEY = '00'.repeat(32);
    try {
      await expect(loadPro(root)).resolves.toBeNull();
    } finally {
      delete process.env.KANSOKU_BUNDLE_KEY;
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd packages/core && pnpm vitest run test/pro-loader.test.ts
```

Expected: FAIL — the current `loadPro` returns a boolean and touches the registry.

- [ ] **Step 3: Rewrite the loader**

Replace `packages/core/src/pro/loader.ts` with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getActiveBundleKey } from '../license/licenseState.js';
import { decryptProBlob, registerVirtualModules } from './encLoader.js';
import { setEncBundlePresent } from './bundleState.js';

export interface ProPayload {
  webFiles: Map<string, Buffer>;
}

const NODE_PREFIX = 'node/';
const WEB_PREFIX = 'web/';

export async function loadPro(appDir?: string): Promise<ProPayload | null> {
  if (!appDir) return null;
  const encPath = join(appDir, 'pro', 'pro.enc');
  const present = existsSync(encPath);
  setEncBundlePresent(present);
  if (!present) return null;

  const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY;
  if (!keyHex) {
    console.info('pro slot: encrypted bundle present but no key, running free');
    return null;
  }

  try {
    const manifest = decryptProBlob(readFileSync(encPath), keyHex);
    const nodeFiles = new Map<string, string>();
    const webFiles = new Map<string, Buffer>();
    for (const [rel, base64] of Object.entries(manifest.files)) {
      const buffer = Buffer.from(base64, 'base64');
      if (rel.startsWith(NODE_PREFIX)) {
        // Virtual path is the plaintext chunk's ORIGINAL location, so its
        // relative imports of shared chunks land on the real dist files.
        nodeFiles.set(
          join(appDir, 'dist-main', '__pro__', rel.slice(NODE_PREFIX.length)),
          buffer.toString('utf8'),
        );
      } else if (rel.startsWith(WEB_PREFIX)) {
        webFiles.set(rel.slice(WEB_PREFIX.length), buffer);
      }
    }
    registerVirtualModules(nodeFiles);
    return { webFiles };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`pro slot: bundle failed to load, running free: ${message}`);
    return null;
  }
}
```

- [ ] **Step 4: Expose `registerVirtualModules` from encLoader**

In `packages/core/src/pro/encLoader.ts`, keep `decryptProBlob` and the `registerHooks` machinery, and export:

```ts
export function registerVirtualModules(files: Map<string, string>): void {
  ensureHooks();
  for (const [path, source] of files) {
    encSources.set(pathToFileURL(path).href, source);
  }
}
```

Delete `loadEncryptedModule` (its dynamic-import-the-entry job is gone — the entry is now reached through the normal chunk graph).

- [ ] **Step 5: Run the loader test**

```bash
cd packages/core && pnpm vitest run test/pro-loader.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Add the canary in the pro repo**

Create `apps/pro/src/entries/canary.ts`:

```ts
export const PRO_CANARY = 'KANSOKU-PRO-CANARY-9d4f2b7e1c';
(globalThis as Record<string, unknown>).__kansokuProCanary ??= PRO_CANARY;
```

Add `import '../../../../../src/entries/canary.js';` (depth adjusted) as the first line of each of the three `pro.pro.ts` overrides from Task 7.

- [ ] **Step 7: Rewrite packEnc's CLI and manifest**

In `apps/pro/scripts/packEnc.mjs`, replace the entry-validation block with a two-dir collector:

```js
function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function collectPrefixed(dir, prefix) {
  const files = {};
  for (const [rel, base64] of Object.entries(collectDistFiles(dir))) {
    files[`${prefix}${rel}`] = base64;
  }
  return files;
}
```

`main()` becomes:

```js
function main() {
  const proDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const nodeDir = argValue('--node');
  const webDir = argValue('--web');
  const outFile = argValue('--out');
  if (!nodeDir || !webDir || !outFile) {
    console.error('packEnc: --node <dir> --web <dir> --out <file> are all required');
    process.exit(1);
  }
  for (const dir of [nodeDir, webDir]) {
    if (!existsSync(dir)) {
      console.error(`packEnc: ${dir} not found — run the build first`);
      process.exit(1);
    }
  }

  const devRandomKey = process.argv.includes('--dev-random-key');
  const { key, keyId } = resolveKeyAndId(devRandomKey);
  const manifest = {
    keyId,
    files: { ...collectPrefixed(nodeDir, 'node/'), ...collectPrefixed(webDir, 'web/') },
  };

  try {
    injectBundleManifest(manifest, {
      buildId: resolveDesktopBuildId(proDir),
      publicCommit: resolveGitHead(join(proDir, '..', '..'), 'public'),
      proCommit: resolveGitHead(proDir, 'pro'),
    });
  } catch (cause) {
    console.error(cause.message);
    process.exit(1);
  }

  const blob = encryptManifest(manifest, key);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, blob);
  console.log(
    `packEnc: wrote ${outFile} (${blob.length} bytes, ${Object.keys(manifest.files).length} files, keyId=${keyId})`,
  );
}
```

And `injectBundleManifest` writes only:

```js
  const bundle = { formatVersion: 1, buildId, publicCommit, proCommit };
```

Delete `REQUIRED_EDITION_ENTRIES` and the entry-presence check. KEEP `assertNoElectronReferencesInServerChunks` — repoint it at the `node/` prefix — and KEEP `assertNoUnsafeReferencesInWebChunks` repointed at `web/`.

- [ ] **Step 8: Rewrite stagePro**

Replace `apps/desktop/scripts/stagePro.mjs` body after the free-build guard with:

```js
const nodeStage = join(desktopDir, 'dist-main', '__pro__');
const webStage = join(desktopDir, '..', 'web', 'dist', 'assets', '__pro__');

for (const [label, dir] of [['dist-main', nodeStage], ['web dist', webStage]]) {
  if (!existsSync(dir)) {
    console.error(`stagePro: apps/pro present but ${label} __pro__ missing — run pnpm build first`);
    process.exit(1);
  }
}

mkdirSync(destDir, { recursive: true });
const args = [
  join(proDir, 'scripts', 'packEnc.mjs'),
  '--node', nodeStage,
  '--web', webStage,
  '--out', destFile,
];
if (!process.env.KANSOKU_BUNDLE_KEY && process.env.KANSOKU_BUNDLE_DEV_RANDOM_KEY === '1') {
  args.push('--dev-random-key');
}
const packEnc = spawnSync('node', args, { stdio: 'inherit' });
if (packEnc.status !== 0) process.exit(packEnc.status ?? 1);

rmSync(nodeStage, { recursive: true, force: true });
rmSync(webStage, { recursive: true, force: true });
console.log('stagePro: staged pro.enc and removed both plaintext __pro__ dirs');
```

The free-build guard must check BOTH dirs are absent and fail if either exists (stale build).

- [ ] **Step 9: Update afterPack to the canary scan**

In `apps/desktop/scripts/afterPack.cjs`, keep `verifyBetterSqlite3Payload` and the source-map / stray-pro-entry scans; replace any marker-string scan with:

```js
const PRO_CANARY = ['KANSOKU', 'PRO', 'CANARY', '9d4f2b7e1c'].join('-');

function verifyNoPlaintextPro(context) {
  const asarPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar',
  );
  if (readFileSync(asarPath).includes(PRO_CANARY)) {
    throw new Error('pro canary found in app.asar — plaintext pro code leaked into the package');
  }
}
```

Call it from `afterPack` alongside the existing scans.

- [ ] **Step 10: Run the core suite**

```bash
cd packages/core && pnpm test
```

Expected: green. Delete any test that exercised `loadEncryptedModule` or the ProModule registry; keep `pro-encLoader-golden.test.ts` (the byte format is unchanged).

- [ ] **Step 11: Commit both repos**

```bash
cd repos/kansoku
git add packages/core/src/pro packages/core/test apps/desktop/scripts
git commit -m "feat(pro): decrypt into virtual node modules and web file map"

cd apps/pro
git add scripts/packEnc.mjs src/entries/canary.ts overlays
git commit -m "build(packEnc): pack node and web chunks into one bundle, drop ABI fields"
```

---

## Task 9: Serve decrypted web chunks over app://

**Files:**
- Modify: `apps/desktop/src/platform/protocol/protocol.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/boot/kernel.ts` (return `webFiles` from the payload)
- Create: `apps/desktop/test/protocol/proAssets.test.ts`

**Interfaces:**
- Consumes: `ProPayload.webFiles` (`Map<string, Buffer>`, keys relative to the web dist root, e.g. `assets/__pro__/research-a1b2.js`) from Task 8.
- Produces: `setProAssets(files: Map<string, Buffer> | null): void` and the amended `registerAppProtocolHandler` in `protocol.ts` — a request whose guarded relative path hits the map is served from memory, everything else falls through to dist.

- [ ] **Step 1: Write the test first**

Create `apps/desktop/test/protocol/proAssets.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveAssetSource, setProAssets } from '@desktop/platform/protocol/protocol.js';

describe('resolveAssetSource', () => {
  beforeEach(() => setProAssets(null));

  it('falls through to disk when no pro assets are registered', () => {
    expect(resolveAssetSource('assets/main-a1.js')).toEqual({ kind: 'disk' });
  });

  it('serves a registered pro chunk from memory', () => {
    const body = Buffer.from('export const x = 1;');
    setProAssets(new Map([['assets/__pro__/pro-a1.js', body]]));
    expect(resolveAssetSource('assets/__pro__/pro-a1.js')).toEqual({ kind: 'memory', body });
  });

  it('falls through for a path the pro map does not carry', () => {
    setProAssets(new Map([['assets/__pro__/pro-a1.js', Buffer.from('x')]]));
    expect(resolveAssetSource('index.html')).toEqual({ kind: 'disk' });
  });

  it('drops registered assets when cleared', () => {
    setProAssets(new Map([['assets/__pro__/pro-a1.js', Buffer.from('x')]]));
    setProAssets(null);
    expect(resolveAssetSource('assets/__pro__/pro-a1.js')).toEqual({ kind: 'disk' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/desktop && pnpm vitest run test/protocol/proAssets.test.ts
```

Expected: FAIL — `resolveAssetSource` / `setProAssets` do not exist.

- [ ] **Step 3: Implement the in-memory layer**

In `apps/desktop/src/platform/protocol/protocol.ts` add:

```ts
export type AssetSource = { kind: 'disk' } | { kind: 'memory'; body: Buffer };

let proAssets: Map<string, Buffer> | null = null;

export function setProAssets(files: Map<string, Buffer> | null): void {
  proAssets = files;
}

export function resolveAssetSource(relativePath: string): AssetSource {
  const body = proAssets?.get(relativePath);
  return body ? { kind: 'memory', body } : { kind: 'disk' };
}
```

In the protocol handler, after `decideRoute` yields `{ kind: 'static', relativePath }`, consult `resolveAssetSource(relativePath)` and return a `Response` built from `body` with the extension-derived MIME type when it is `memory`; otherwise keep the existing `readFile` path.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/desktop && pnpm vitest run test/protocol/proAssets.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Feed the map in at boot**

In `apps/desktop/src/boot/kernel.ts`, capture the payload from `loadPro(app.getAppPath())` and include `webFiles` in the return value. In `apps/desktop/src/main.ts`, after `registerAppProtocolHandler({...})`:

```ts
    setProAssets(webFiles ?? null);
```

with `webFiles` destructured from `bootKernel()`. On quit, in the existing `before-quit` handler, add `setProAssets(null);` so the buffers become GC-eligible.

- [ ] **Step 6: Run the desktop suite**

```bash
cd apps/desktop && pnpm test
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/platform/protocol/protocol.ts apps/desktop/src/main.ts apps/desktop/src/boot/kernel.ts apps/desktop/test/protocol/proAssets.test.ts
git commit -m "feat(desktop): serve decrypted pro chunks from memory over app://"
```

---

## Task 10: Delete the runtime ABI layer

**Files:**
- Delete: `packages/core/src/pro/registry.ts`, `packages/core/src/pro/editionLoader.ts`, `packages/core/src/pro/editionRuntime.ts`, `packages/core/src/pro/webEditionHost.ts`, `packages/core/src/pro/webManifest.ts`, `packages/core/src/edition/**` (host/base/ipcRegistry/realtimeRegistry/desktopEdition/serverEdition), and their tests
- Delete: `apps/web/src/host/**` (bootstrapWebEditionHost, proEditionRegistry, ProEditionFallback, useProSlot) and their tests
- Delete: `apps/desktop/src/platform/protocol/proAssetProtocol.ts` and its test
- Modify: `packages/pro-api/src/index.ts` — drop `ProModule`, `ProHooks`, `ProHostContext`; keep `ProChannel`, license and AI types
- Modify: every consumer the deletions break

**Interfaces:**
- Consumes: nothing new. This task only removes the superseded layer.
- Produces: a tree where the ABI symbols do not exist.

- [ ] **Step 1: Inventory the symbols to remove**

```bash
cd repos/kansoku
git grep -n "EditionEntry\|abiVersion\|WebEditionHost\|loadEditionFromDevDist\|pro-asset\|ProModule\|getProHooks\|registerProModule\|pro/registry" -- apps packages | tee /tmp/abi-refs.txt
wc -l /tmp/abi-refs.txt
```

This list is the task's work queue.

- [ ] **Step 2: Replace ProHooks consumers with the composition**

`getProHooks()` callers (follow / deep-dive triggers in core services) must instead receive their behavior from the pro composition. For each caller, introduce a public no-op default in `packages/core/src/pro/features.ts` and have the desktop/server composition override register the real implementation at `start()`. Verify the free path still returns the same disabled results:

```bash
git grep -n "getProHooks" -- packages apps
```

Expected after the change: no output.

- [ ] **Step 3: Delete the modules**

```bash
git rm packages/core/src/pro/registry.ts packages/core/src/pro/editionLoader.ts \
       packages/core/src/pro/editionRuntime.ts packages/core/src/pro/webEditionHost.ts \
       packages/core/src/pro/webManifest.ts
git rm -r packages/core/src/edition apps/web/src/host
git rm apps/desktop/src/platform/protocol/proAssetProtocol.ts
git rm packages/core/test/pro-editionLoader.test.ts packages/core/test/pro-editionRuntime.test.ts \
       packages/core/test/pro-webEditionHost.test.ts packages/core/test/edition-base.test.ts \
       packages/core/test/edition-serverBuilder.test.ts
git rm apps/desktop/test/protocol/proAssetProtocol.test.ts
```

Adjust the list to what Step 1 actually found; some paths may not exist on this branch.

- [ ] **Step 4: Trim pro-api**

In `packages/pro-api/src/index.ts`, delete the `ProModule`, `ProHooks`, and `ProHostContext` interfaces. Keep `ProChannel`, `ProCapabilities`, `ProLicenseGate`, `ProAi*`, `SecretBox`, and the license types.

- [ ] **Step 5: Remove the CSP nonce / importmap machinery**

The nonce CSP existed for the WebEditionHost importmap. Delete `apps/desktop/src/shell/window/cspNonce.ts`, `cspNonceArgv.ts`, their tests, and the `scriptNonce` option in `csp.ts`; drop `pro-asset:` and `blob:` from `script-src`. Keep the rest of the policy and keep applying it in packaged mode.

- [ ] **Step 6: Fix every remaining consumer**

```bash
pnpm typecheck && pnpm typecheck:pro
```

Iterate until clean. Every error is a consumer of a deleted symbol — rewire it to the composition points, never reintroduce the deleted module.

- [ ] **Step 7: Verify the symbols are gone**

```bash
git grep -n "EditionEntry\|abiVersion\|WebEditionHost\|loadEditionFromDevDist\|pro-asset\|ProModule" -- apps packages
```

Expected: no output (matches inside `docs/` are fine and expected).

- [ ] **Step 8: Run every suite**

```bash
pnpm -r test
```

Expected: core / server / web / desktop / build-overlay all green.

- [ ] **Step 9: Commit**

```bash
git add -A -- apps packages
git commit -m "refactor: delete the runtime edition ABI layer"
```

---

## Task 11: Dev workflow and pro-repo cleanup

**Files:**
- Modify (pro repo): `apps/pro/package.json` — drop `build`, `build:node`, `build:web`, `dev:watch`, `pack`, `release`, `abi:gate`, `poc:overlay`
- Delete (pro repo): `apps/pro/vite.config.node.ts`, `apps/pro/vite.config.web.ts`, `apps/pro/vite.overlay-poc.config.ts`, `apps/pro/scripts/devWatch.mjs`, `apps/pro/scripts/runAbiGate.mjs`, `apps/pro/scripts/runOverlayPoc.mjs`, `apps/pro/src/entries/{server,desktop,web}.ts`
- Keep (pro repo): `apps/pro/scripts/packEnc.mjs`, `ensureNativeAbi.mjs`, `src/entries/canary.ts`
- Modify: `apps/desktop/scripts/dev.mjs` — no change expected; verify pro chunks rebuild on overlay edits

**Interfaces:**
- Consumes: everything from Tasks 3–10.
- Produces: pro no longer produces its own bundle; the desktop build is the only producer.

- [ ] **Step 1: Delete the pro-side build pipeline**

```bash
cd repos/kansoku/apps/pro
git rm vite.config.node.ts vite.config.web.ts vite.overlay-poc.config.ts \
       scripts/devWatch.mjs scripts/runAbiGate.mjs scripts/runOverlayPoc.mjs \
       src/entries/server.ts src/entries/desktop.ts src/entries/web.ts
```

- [ ] **Step 2: Trim the pro package scripts**

`apps/pro/package.json` scripts must end up exactly:

```json
  "scripts": {
    "lint": "eslint .",
    "pretest": "node scripts/ensureNativeAbi.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "bench:run": "vite-node src/bench/cli.ts"
  },
```

- [ ] **Step 3: Verify dev picks up an overlay edit**

```bash
cd repos/kansoku
pnpm dev:desktop
```

With the app running, edit a string in one of the pro pages under `apps/pro/overlays/apps/web/src/pages/`. Expected: the vite dev server HMRs the change into the running window. Stop the dev server.

- [ ] **Step 4: Verify the packaged dev-mode desktop build carries pro chunks**

```bash
cd apps/desktop && pnpm build
ls dist-main/__pro__ ../web/dist/assets/__pro__
```

Expected: both directories exist and are non-empty (this is the pre-encryption state `stagePro` consumes).

- [ ] **Step 5: Run the pro suite**

```bash
cd apps/pro && pnpm test && pnpm typecheck
```

Expected: green.

- [ ] **Step 6: Commit (pro repo)**

```bash
cd apps/pro
git add -A
git commit -m "build: retire the pro-side bundle pipeline (the desktop build is the only producer)"
```

---

## Task 12: Four-state acceptance and release smoke

**Files:**
- Create: `apps/desktop/scripts/verifyFourStates.mjs`
- Modify: `docs/pro-overlay.md` — rewrite for the single-graph architecture

**Interfaces:**
- Consumes: the whole pipeline.
- Produces: a repeatable script proving the four activation states.

- [ ] **Step 1: Emit a structured boot state line**

The four-state check must assert on a POSITIVE signal, not on the absence of a
warning — a silently-uncomposed pro build would pass an absence check.

In `apps/desktop/src/boot/kernel.ts`, right after `proComposition` resolves, add:

```ts
  console.log(`[boot] proComposition=${proComposition ? 'active' : 'free'}`);
```

In `apps/desktop/src/main.ts`, at the end of the successful boot block:

```ts
    if (process.env.KANSOKU_EXIT_AFTER_BOOT === '1') app.quit();
```

- [ ] **Step 2: Write the four-state script**

Create `apps/desktop/scripts/verifyFourStates.mjs`:

```js
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appBin = join(desktopDir, 'release', 'mac-arm64', 'Kansoku.app', 'Contents', 'MacOS', 'Kansoku');
const key = randomBytes(32).toString('hex');
let failures = 0;

function bootState(env) {
  const result = spawnSync(appBin, [], {
    env: { ...process.env, ...env, KANSOKU_EXIT_AFTER_BOOT: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = /\[boot\] proComposition=(active|free)/.exec(log);
  if (!match) {
    console.error('no [boot] proComposition line in output:\n' + log.slice(-2000));
    return { state: null, exitCode: result.status };
  }
  return { state: match[1], exitCode: result.status };
}

function expectState(label, env, expected) {
  const { state, exitCode } = bootState(env);
  if (state !== expected || exitCode !== 0) {
    console.error(`FAIL ${label}: state=${state} (want ${expected}), exit=${exitCode} (want 0)`);
    failures += 1;
    return;
  }
  console.log(`ok ${label}: proComposition=${state}, clean exit`);
}

function packageApp(env, label) {
  console.log(`\n== packaging: ${label}`);
  execFileSync('pnpm', ['package'], { cwd: desktopDir, stdio: 'inherit', env: { ...process.env, ...env } });
}

packageApp({ KANSOKU_BUNDLE_KEY: key, KANSOKU_BUNDLE_KEY_ID: 'four-state' }, 'pro build');
expectState('activated (correct key)', { KANSOKU_BUNDLE_KEY: key }, 'active');
expectState('locked (no key)', { KANSOKU_BUNDLE_KEY: '' }, 'free');
expectState('wrong key', { KANSOKU_BUNDLE_KEY: 'ff'.repeat(32) }, 'free');

packageApp({ KANSOKU_FORCE_FREE: '1' }, 'community build');
expectState('community build', {}, 'free');

process.exit(failures === 0 ? 0 : 1);
```

Note the community case asserts the app boots free and exits cleanly. That the
community ARTIFACT carries no pro code is a separate, stronger check — the
canary scan in Step 4, which greps the packaged bytes rather than the log.

- [ ] **Step 3: Run it**

```bash
cd apps/desktop && node scripts/verifyFourStates.mjs
```

Expected: four `ok` lines, exit 0. Any FAIL is a real defect — fix the code, not the assertion. Note this packages twice (~8 minutes total).

- [ ] **Step 4: Confirm the community artifact carries no pro bytes**

The community build from Step 2 is still in `release/`. Scan it:

```bash
cd apps/desktop
grep -rl "KANSOKU-PRO-CANARY-9d4f2b7e1c" release/mac-arm64/Kansoku.app; echo "grep exit=$?"
```

Expected: no file list, `grep exit=1` (no matches). Any hit means plaintext pro code shipped in the community artifact — a release blocker.

- [ ] **Step 5: Manual release smoke**

Install the Pro-keyed dmg, launch unactivated (Pro routes must 404 / not exist in the router), activate a license, relaunch, and confirm follow / deep-dive / research all work. Record the result in the commit message.

- [ ] **Step 6: Rewrite the overlay doc**

Rewrite `docs/pro-overlay.md` for this architecture: overlay convention and sync, the composition points and the single dynamic-import boundary, chunk routing and the two build-fatal assertions, `stagePro` / `packEnc` / decryption, `app://` in-memory serving, the dev workflow, and the four-state matrix. Delete every mention of Edition ABI, dist-dev, `pro-asset://`, and the POC.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/scripts/verifyFourStates.mjs apps/desktop/src/main.ts apps/desktop/src/boot/kernel.ts docs/pro-overlay.md
git commit -m "test(desktop): verify the four activation states end to end"
```

---

## Task 13: Full verification and PRs

- [ ] **Step 1: Run every gate**

```bash
cd repos/kansoku
pnpm install
pnpm -r test
pnpm typecheck
pnpm typecheck:pro
pnpm lint
pnpm overlay:check
```

Expected: all green. Record the per-suite counts.

- [ ] **Step 2: Confirm both working trees are clean**

```bash
git status --short
git -C apps/pro status --short
```

Expected: only the user's pre-existing WIP.

- [ ] **Step 3: Push both branches**

```bash
git push -u origin feat/single-graph-overlay
git -C apps/pro push -u origin feat/single-graph-overlay
```

- [ ] **Step 4: Open both PRs**

```bash
gh pr create --base main --title "refactor: compose pro at build time in a single module graph" --body "<summary of the architecture, the four-state matrix results, and the suite counts from Step 1>"
cd apps/pro && gh pr create --base main --repo kansoku-trade/kansoku-pro --title "refactor: move pro into build-time overlays" --body "<counterpart summary>"
```

- [ ] **Step 5: Report**

Report to the user: branch names, PR URLs, per-suite test counts, four-state results, and anything deferred.
