# Desktop configurable data root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Packaged Kansoku can bind its project-root data directory to a user-chosen path (e.g. the trade repo), so charts/`app.db`/`stocks` share one tree with server/dev; preference lives in real userData; bad paths degrade safely.

**Architecture:** Host-only feature. Extend `resolveDataRoot` + boot `env.ts` to read `{userData}/data-root.json`. Pure store/validate/resolve modules under `apps/desktop/src/dataRoot/`. Menu + settings UI call the same flow. Kernel still only sees `TRADE_PROJECT_ROOT`.

**Tech Stack:** Electron main, vitest, React settings page, existing onboarding-style file store + `desktop:*` IPC / preload bridge patterns.

**Spec:** `docs/superpowers/specs/2026-07-13-desktop-data-root-design.md`

## Global Constraints

- Data root = **project root** (mirror repo: `journal/`, `stocks/`), never “charts only”
- Preference file **only** at real `app.getPath("userData")/data-root.json`, never inside the data root
- Resolve order (packaged): `TRADE_PROJECT_ROOT` env → usable custom path → `userData`
- Dev (unpackaged): ignore custom preference; root = repo; hide or no-op UI
- Change path: write preference + **restart required**; no migrate; no hot-switch
- Bad custom path at boot: fall back to `userData`, keep preference, expose `degraded`
- Do not modify `@trade/core` path layout or business logic beyond existing `TRADE_PROJECT_ROOT`
- Docs/UI copy: 中文白话; code/identifiers English
- Comments/JSDoc: zero by default (project rule)
- Commits: plain English messages, no AI co-authorship; only commit when task says so
- Scope tests to files you touch (`pnpm -C apps/desktop test`, targeted web tests)

## File map

| Path                                              | Role                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `apps/desktop/src/dataRoot/store.ts`              | Read/write/clear `data-root.json`                 |
| `apps/desktop/src/dataRoot/validate.ts`           | Candidate path validation                         |
| `apps/desktop/src/dataRoot/status.ts`             | Boot-time status object types + helpers           |
| `apps/desktop/src/dataRoot/flow.ts`               | Dialog pick / reset / restart prompt              |
| `apps/desktop/src/boot/paths.ts`                  | Extend `resolveDataRoot`                          |
| `apps/desktop/src/boot/env.ts`                    | Load preference, resolve, scaffold, export status |
| `apps/desktop/src/dataRoot/ipc.ts`                | `desktop:data-root:*` handlers                    |
| `apps/desktop/src/menu/sections/appSection.ts`    | Menu item                                         |
| `apps/desktop/src/menu/types.ts`                  | `selectDataRoot` dep                              |
| `apps/desktop/src/main.ts`                        | Wire menu + register IPC                          |
| `apps/desktop/src/preload.ts`                     | Expose `desktop.dataRoot`                         |
| `apps/desktop/test/dataRoot/*.test.ts`            | Unit tests                                        |
| `apps/desktop/test/boot/paths.test.ts`            | Extended resolve tests                            |
| `apps/web/src/pages/settings/desktopDataRoot.ts`  | Bridge helper                                     |
| `apps/web/src/pages/settings/DataRootSection.tsx` | Settings card                                     |
| `apps/web/src/pages/settings/SettingsPage.tsx`    | Mount section when bridge present                 |
| `apps/desktop/README.md`                          | User-facing docs                                  |

---

### Task 1: Store, validate, resolveDataRoot

**Files:**

- Create: `apps/desktop/src/dataRoot/store.ts`
- Create: `apps/desktop/src/dataRoot/validate.ts`
- Modify: `apps/desktop/src/boot/paths.ts`
- Create: `apps/desktop/test/dataRoot/store.test.ts`
- Create: `apps/desktop/test/dataRoot/validate.test.ts`
- Modify: `apps/desktop/test/boot/paths.test.ts`

**Interfaces:**

- Produces:
  - `DataRootPreference = { path: string | null }`
  - `createDataRootFileStore(filePath: string): { get(): Promise<DataRootPreference>; setPath(path: string): Promise<void>; clear(): Promise<void> }`
  - `CHART_DATA_REL = join("journal","charts","data")` (or export from validate)
  - `DataRootCandidateResult = { ok: true } | { ok: false; reason: "self" | "not-dir" | "not-writable" | "needs-confirm-scaffold" }`
  - `validateDataRootCandidate(path: string, currentRoot: string): DataRootCandidateResult`
  - `DataRootOptions` gains optional `customPath?: string | null` and optional `customPathUsable?: boolean` (or resolve usability inside caller and only pass path when usable)
  - `resolveDataRoot(opts)`: packaged + usable custom → custom; packaged + unusable/missing custom → userData; env always wins; unpackaged → repo

- [ ] **Step 1: Write failing tests** for store (default null, set, clear), validate (self, missing, needs-confirm, ok with journal structure, empty dir ok), resolveDataRoot custom path priority after env.

- [ ] **Step 2: Run** `pnpm -C apps/desktop test test/dataRoot test/boot/paths.test.ts` — expect FAIL (missing modules / old resolve).

- [ ] **Step 3: Implement store** — mirror `onboarding/store.ts`: JSON file, mode `0o600`, parse tolerant, invalid JSON → `{ path: null }`. `setPath` writes absolute path string; `clear` writes `{ "path": null }` or deletes file (prefer write null for explicitness).

- [ ] **Step 4: Implement validate** — sync fs:
  - realpath equality with currentRoot → `self`
  - !exists or !stat.isDirectory → `not-dir`
  - if `journal/charts/data` exists → `ok`
  - if dir empty (no entries) → `ok`
  - else try `access` writable or create+remove probe under path; fail → `not-writable`
  - non-empty without chart data dir → `needs-confirm-scaffold`
  - Use `realpathSync` with fallback like `dataImport/manifest.ts` `realpathOrSelf` if needed (copy small helper or export shared).

- [ ] **Step 5: Extend `resolveDataRoot`**:

```ts
export interface DataRootOptions {
  isPackaged: boolean;
  envOverride: string | undefined;
  userDataPath: string;
  customPath?: string | null;
  customPathUsable?: boolean;
}

export function resolveDataRoot(opts: DataRootOptions): string {
  if (opts.envOverride) return opts.envOverride;
  if (!opts.isPackaged) return resolveRepoRoot();
  if (opts.customPath && opts.customPathUsable) return opts.customPath;
  return opts.userDataPath;
}
```

- [ ] **Step 6: Run tests** — expect PASS.

- [ ] **Step 7: Commit** `feat(desktop): data root store, validate, resolve priority`

---

### Task 2: Boot integration + status export

**Files:**

- Create: `apps/desktop/src/dataRoot/status.ts`
- Create: `apps/desktop/src/dataRoot/usability.ts` (or inline in env) — `isDataRootUsable(path: string): boolean`
- Modify: `apps/desktop/src/boot/env.ts`
- Create: `apps/desktop/test/dataRoot/usability.test.ts` and/or boot unit test with injectables if possible

**Interfaces:**

- Produces:
  - `DataRootMode = "default" | "custom" | "env" | "dev-repo"`
  - `DataRootStatus = { effectivePath, configuredPath, mode, degraded, degradedReason?: string }`
  - `export let dataRootStatus: DataRootStatus` (or getter) from `boot/env.ts` alongside `dataRoot`
  - Boot sequence: read preference from `join(userData, "data-root.json")` **only when packaged**; compute usable; resolve; if configured but not usable → degraded; scaffold effective root; set `TRADE_PROJECT_ROOT`

- [ ] **Step 1: Write tests** for usability (missing path false, existing writable dir true) and for resolve+degraded mode labeling helper pure function if extracted:

```ts
export function buildDataRootStatus(input: {
  isPackaged: boolean;
  envOverride?: string;
  userDataPath: string;
  configuredPath: string | null;
  effectivePath: string;
  customPathUsable: boolean;
}): DataRootStatus;
```

- [ ] **Step 2: Implement `isDataRootUsable`**: exists, isDirectory, can mkdir `journal/charts/data` under it (or access W_OK).

- [ ] **Step 3: Wire `env.ts`** carefully — keep `app.setName("Kansoku")` first; resolve userData; if packaged load preference synchronously if possible (use `readFileSync` in boot path to avoid async before TRADE_PROJECT_ROOT — **boot must stay sync before any core import**). Prefer sync read in env.ts for preference only:

```ts
// sync read preference so TRADE_PROJECT_ROOT is set before dynamic imports
function readConfiguredPath(userDataPath: string): string | null { ... }
```

Store can keep async API for runtime IPC; boot uses sync read of same file format.

- [ ] **Step 4: Export `dataRoot` + `dataRootStatus`**. When `process.env.TRADE_PROJECT_ROOT` was already set **before** env module runs, mode is `env` and custom preference is ignored for effective path (still report configuredPath from file).

- [ ] **Step 5: Tests pass.** Commit `feat(desktop): boot data root preference and degraded fallback`

**Critical ordering note:** `main.ts` imports `./boot/env.js` first. Preference sync read must happen inside env.ts before `process.env.TRADE_PROJECT_ROOT = dataRoot`. Do not async-await preference at top level.

---

### Task 3: Flow, menu, IPC

**Files:**

- Create: `apps/desktop/src/dataRoot/flow.ts`
- Create: `apps/desktop/src/dataRoot/ipc.ts`
- Modify: `apps/desktop/src/menu/types.ts`
- Modify: `apps/desktop/src/menu/sections/appSection.ts`
- Modify: `apps/desktop/src/main.ts`
- Create: `apps/desktop/test/dataRoot/flow.test.ts` for pure helpers if any; dialog-heavy flow may stay thin

**Interfaces:**

- Produces:
  - `runSelectDataRootFlow(win): Promise<void>`
  - `runResetDataRootFlow(win): Promise<void>`
  - IPC: `desktop:data-root:get` → `DataRootStatus & { restartPending?: boolean }`
  - IPC: `desktop:data-root:pick` → runs flow or returns result for UI-driven pick
  - IPC: `desktop:data-root:reset` → clear preference + restart prompt
  - In-process `restartPending` flag set after successful write until relaunch

**Flow behavior (packaged only):**

1. If `!app.isPackaged`: info dialog「开发模式已使用仓库目录，无需设置。」
2. Else openDirectory dialog
3. validate; if needs-confirm-scaffold → question dialog
4. if not-dir / not-writable / self → warning
5. store.setPath → set restartPending → messageBox 稍后 / 立即重启
6. 立即重启: `app.relaunch(); app.quit();`
7. reset: store.clear → same restart prompt

**Menu:** After「从 repo 导入数据…」add「选择数据目录…」calling `selectDataRoot`. Dev: still callable (shows info).

**IPC get:** return `dataRootStatus` from boot + `restartPending`.

**IPC pick/reset:** call flows with focused window; or implement pick as: main shows dialog (flow owns dialogs) so UI button just invokes pick.

- [ ] **Step 1: Implement flow + ipc + menu + main wire**

- [ ] **Step 2: Add unit tests for any extracted pure parts; smoke-import flow module in test if needed**

- [ ] **Step 3: `pnpm -C apps/desktop test` and `pnpm -C apps/desktop typecheck`**

- [ ] **Step 4: Commit** `feat(desktop): data root pick/reset flow, menu, ipc`

---

### Task 4: Preload + settings UI

**Files:**

- Modify: `apps/desktop/src/preload.ts`
- Create: `apps/web/src/pages/settings/desktopDataRoot.ts`
- Create: `apps/web/src/pages/settings/DataRootSection.tsx`
- Create: `apps/web/src/pages/settings/desktopDataRoot.test.ts` (bridge null/present)
- Modify: `apps/web/src/pages/settings/SettingsPage.tsx`

**Interfaces:**

- Preload (privileged origin only):

```ts
desktopApi.dataRoot = {
  get: () => ipcRenderer.invoke('desktop:data-root:get'),
  pick: () => ipcRenderer.invoke('desktop:data-root:pick'),
  reset: () => ipcRenderer.invoke('desktop:data-root:reset'),
};
```

- Web bridge: `getDesktopDataRootBridge()` like credentials
- `DataRootSection`: only render if bridge non-null
  - Show effective path, mode label (系统默认 / 自定义 / 环境变量 / 开发仓库)
  - If degraded: warning strip with degradedReason
  - If restartPending: note 已保存，重启后生效
  - Buttons: 选择… → pick(); 恢复默认 → reset() (disabled when mode default and not restartPending to custom)
  - If mode === `env`: disable pick/reset, explain 当前由环境变量 TRADE_PROJECT_ROOT 覆盖
  - If mode === `dev-repo`: short note only, disable pick or pick shows main-process info
  - Helper text: 选含 journal 的仓库根；改完需重启；勿与 pnpm start 同时写同一目录

- [ ] **Step 1: Preload + bridge + section + mount in SettingsWorkspace under 连接 card (after Longbridge or new Card「数据」)**

- [ ] **Step 2: Web unit test for bridge helper; optional render test if project has rtl — skip if no rtl pattern**

- [ ] **Step 3: `pnpm -C apps/desktop test` + `pnpm -C apps/web test` (or scoped) + typecheck both if applicable**

- [ ] **Step 4: Commit** `feat(desktop): settings UI for data root binding`

---

### Task 5: README

**Files:**

- Modify: `apps/desktop/README.md`

- [ ] **Step 1: Add section「数据目录」** covering: default location, how to bind trade repo, difference from import, restart, concurrent host warning, env override for power users.

- [ ] **Step 2: Commit** `docs(desktop): document configurable data root`

---

## Spec coverage checklist

| Spec requirement                | Task                 |
| ------------------------------- | -------------------- |
| Project root semantics          | 1, 4 copy            |
| Preference in real userData     | 1, 2                 |
| Resolve env > custom > userData | 1, 2                 |
| Dev ignores custom              | 2, 3, 4              |
| Restart, no migrate             | 3                    |
| Bad path degrade                | 2, 4                 |
| Menu + settings                 | 3, 4                 |
| Import remains separate         | 3 menu order, 5 docs |
| Kernel unchanged                | all (no core edits)  |

## Execution notes for SDD

- Work on a feature branch, not force-push main
- After each task: implementer commits; controller runs task review
- Final: whole-branch review + README spot-check
