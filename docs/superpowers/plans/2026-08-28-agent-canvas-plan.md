# Agent Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let in-app agents write a named `.canvas.tsx` file that the app compiles in a sandbox and opens beside chat.

**Architecture:** A canvas is a file under `journal/canvases/<slug>.canvas.tsx`. Agents write it through `save_canvas` / `read_canvas` / `list_canvases` after a static check. The host compiles with sucrase, injects `@kansoku/canvas`, and renders inside an iframe. Presentation (split pane vs card) is host UI; the file does not belong to a session.

**Tech Stack:** TypeScript, vitest, TypeBox agent tools, sucrase, React, Recharts, Lightweight Charts, existing IPC/HTTP contract.

**Spec:** `docs/superpowers/specs/2026-08-28-agent-canvas-design.md`

## Global Constraints

- Public `kansoku` only for this feature. Tools, store, SDK, and UI live in open core. Pro research chat reuses the same tools; do not add a paid gate.
- Never mix this into `ChartDoc` / `ALL_TYPES` / `/api/charts`.
- Canvas source must import only `@kansoku/canvas`. No `fetch`, timers, `document.`, `window.`, relative imports, or `node:`.
- Data is embedded in the TSX. No live hooks in this version.
- `CANVAS_DIR = join(PROJECT_ROOT, 'journal', 'canvases')`. Title and last check live in `journal/canvases/.meta.json` so listing can still scan files for mtime.
- Source size cap is 64 KB (`CANVAS_MAX_SOURCE_BYTES = 65536`).
- Slug is kebab-case `[a-z0-9]+(?:-[a-z0-9]+)*`. Reject `/`, `\`, `..`.
- Docs in 中文白话. Code, comments, commits in English. No comments unless they record a hidden invariant.
- Tests first. Watch each new test fail before writing production code.
- Do not commit unless the user asks.

---

## File map

**Phase 1 — store, check, tools**

- Create: `packages/core/src/canvas/check.ts` — `checkCanvasSource(source): string[]`
- Create: `packages/core/src/canvas/store.ts` — save / load / list / recordCheck
- Create: `packages/core/src/canvas/tools.ts` — three agent tools
- Create: `packages/core/src/contract/canvas.ts` — `CanvasApi` + routes
- Create: `packages/core/src/canvas/canvas.service.ts` — service implementing `CanvasApi`
- Modify: `packages/core/src/platform/env.ts` — export `CANVAS_DIR`
- Modify: `packages/core/src/contract/index.ts` — register `canvas`
- Modify: `packages/core/src/ai/assistant/assistantChat.ts` — attach canvas tools
- Modify: `packages/core/src/ai/chat/chat.ts` — attach canvas tools
- Test: `packages/core/test/canvasCheck.test.ts`
- Test: `packages/core/test/canvasStore.test.ts`
- Test: `packages/core/test/canvasTools.test.ts`

**Phase 2 — compile + iframe + min SDK**

- Create: `packages/canvas-sdk/` (`@kansoku/canvas`) — layout, Text, Stat, Table, useState, useMemo
- Create: `packages/core/src/canvas/compile.ts` — sucrase + import rewrite
- Create: `apps/web/src/features/canvas/CanvasFrame.tsx` — iframe host
- Create: `apps/web/src/features/canvas/canvasRuntime.ts` — compile + inject
- Test: `packages/core/test/canvasCompile.test.ts`

**Phase 3 — analysis charts**

- Modify: `packages/canvas-sdk` — LineChart, BarChart, AreaChart, PieChart, Callout, Pill

**Phase 4 — CandleChart**

- Create: `packages/canvas-sdk/src/CandleChart.tsx` wrapping extracted primitives

**Phase 5 — surfaces**

- Modify: assistant page, ChatDock, research panel, nav
- Create: canvas list page, entry card

**Phase 6 — skill**

- Create: `.claude/skills/canvas/SKILL.md`

---

### Task 0: Branch

**Files:**
- Move existing untracked spec onto the branch.

**Interfaces:**
- Produces: `feat/agent-canvas` on `repos/kansoku`.

- [ ] **Step 1: Create the branch from current kansoku main**

```bash
git -C repos/kansoku switch -c feat/agent-canvas
```

Expected: on `feat/agent-canvas`. The spec file stays untracked until the user asks to commit.

---

### Task 1: Static check

**Files:**
- Create: `packages/core/src/canvas/check.ts`
- Test: `packages/core/test/canvasCheck.test.ts`

**Interfaces:**
- Produces: `export const CANVAS_MAX_SOURCE_BYTES = 65536`
- Produces: `export function checkCanvasSource(source: string): string[]`

A valid source (issues = `[]`):

```tsx
import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { CANVAS_MAX_SOURCE_BYTES, checkCanvasSource } from '../src/canvas/check.js';

const valid = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;

describe('checkCanvasSource', () => {
  it('accepts a default-exported canvas that only imports @kansoku/canvas', () => {
    expect(checkCanvasSource(valid)).toEqual([]);
  });

  it('rejects source without a default export', () => {
    const issues = checkCanvasSource(`import { Text } from '@kansoku/canvas';
export function App() { return <Text>x</Text>; }
`);
    expect(issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });

  it('rejects a second default export', () => {
    const issues = checkCanvasSource(`${valid}\nexport default function Other() { return null; }\n`);
    expect(issues.some((issue) => /only one|exactly one/i.test(issue))).toBe(true);
  });

  it('rejects imports that are not @kansoku/canvas', () => {
    const issues = checkCanvasSource(`import x from 'react';
${valid}`);
    expect(issues.some((issue) => /@kansoku\/canvas/.test(issue))).toBe(true);
  });

  it('rejects relative imports', () => {
    const issues = checkCanvasSource(`import x from './other';
${valid}`);
    expect(issues.some((issue) => /relative/i.test(issue))).toBe(true);
  });

  it('rejects node: imports', () => {
    const issues = checkCanvasSource(`import fs from 'node:fs';
${valid}`);
    expect(issues.some((issue) => /node:/.test(issue))).toBe(true);
  });

  it('rejects fetch, timers, and host globals', () => {
    for (const banned of [
      'fetch(',
      'XMLHttpRequest',
      'import(',
      'require(',
      'setInterval',
      'setTimeout',
      'document.',
      'window.',
    ]) {
      const issues = checkCanvasSource(`${valid}\nvoid ${banned}\n`);
      expect(issues.length, banned).toBeGreaterThan(0);
    }
  });

  it('rejects source over 64 KB', () => {
    const issues = checkCanvasSource(`${valid}\n${'x'.repeat(CANVAS_MAX_SOURCE_BYTES)}\n`);
    expect(issues.some((issue) => /64/.test(issue))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm --filter @kansoku/core test test/canvasCheck.test.ts
```

Expected: FAIL because `../src/canvas/check.js` does not exist.

- [ ] **Step 3: Implement `checkCanvasSource`**

Count `export default` with `/\bexport\s+default\b/g`. Find imports with `/import\s+(?:[^'"\n]+from\s+)?['"]([^'"]+)['"]/g` and `import\s*\(`. Reject `require(`. Reject the banned substrings. Reject `source.length > CANVAS_MAX_SOURCE_BYTES`.

- [ ] **Step 4: Re-run tests until they pass**

---

### Task 2: File store

**Files:**
- Modify: `packages/core/src/platform/env.ts` — add `CANVAS_DIR`
- Create: `packages/core/src/canvas/store.ts`
- Test: `packages/core/test/canvasStore.test.ts`

**Interfaces:**
- Consumes: `checkCanvasSource`
- Produces:

```ts
export interface CanvasMeta {
  slug: string;
  title: string;
  mtime: string; // ISO
}

export interface CanvasCheckRecord {
  issues: string[];
  stage: 'static' | 'compile' | 'runtime';
  updatedAt: string;
}

export interface CanvasDoc {
  slug: string;
  title: string;
  source: string;
  mtime: string;
  check: CanvasCheckRecord | null;
}

export function canvasPath(dir: string, slug: string): string
export async function saveCanvas(dir: string, input: { slug: string; title: string; source: string; now?: () => Date }): Promise<{ ok: true; doc: CanvasDoc } | { ok: false; issues: string[] }>
export async function loadCanvas(dir: string, slug: string): Promise<CanvasDoc | null>
export async function listCanvases(dir: string): Promise<CanvasMeta[]>
export async function recordCanvasCheck(dir: string, slug: string, check: Omit<CanvasCheckRecord, 'updatedAt'>, now?: () => Date): Promise<void>
```

Slug that fails kebab-case returns `{ ok: false, issues: ['slug must be kebab-case'] }` and writes nothing.

- [ ] **Step 1: Write failing store tests** using `mkdtempSync`. Cover: valid save writes `<slug>.canvas.tsx` and `.meta.json`; same slug overwrites; invalid slug / failed check writes nothing; list sorts by mtime descending; `recordCanvasCheck` is visible on `loadCanvas`.

- [ ] **Step 2: Watch tests fail**

```bash
pnpm --filter @kansoku/core test test/canvasStore.test.ts
```

- [ ] **Step 3: Implement store + `CANVAS_DIR`**

`CANVAS_DIR = join(PROJECT_ROOT, 'journal', 'canvases')`.

`.meta.json` shape: `{ [slug]: { title: string; check: CanvasCheckRecord | null } }`.

`mtime` comes from `fs.stat` of the `.canvas.tsx` file.

- [ ] **Step 4: Re-run until green**

---

### Task 3: Agent tools

**Files:**
- Create: `packages/core/src/canvas/tools.ts`
- Test: `packages/core/test/canvasTools.test.ts`

**Interfaces:**
- Consumes: `saveCanvas`, `loadCanvas`, `listCanvases`
- Produces: `export function buildCanvasTools(dir: string, now?: () => Date): AgentTool[]`

Tool names: `save_canvas`, `read_canvas`, `list_canvases`.

`save_canvas` params: `{ slug, title, source }`. On reject, `textResult` starts with `rejected:` and lists issues, one per line. On accept: `saved slug=<slug> title=<title>`.

`read_canvas` params: `{ slug }`. Missing → `rejected: canvas not found: <slug>`. Found → JSON `{ slug, title, source, mtime, check }`.

`list_canvases` params: `{}`. Return JSON array of `{ slug, title, mtime }`.

- [ ] **Step 1: Write failing tool tests** that call `execute` on the three tools against a temp dir.

- [ ] **Step 2: Watch fail, implement, re-run until green**

---

### Task 4: Contract + service + wire into chats

**Files:**
- Create: `packages/core/src/contract/canvas.ts`
- Create: `packages/core/src/canvas/canvas.service.ts`
- Modify: `packages/core/src/contract/index.ts`
- Modify: `packages/core/src/ai/assistant/assistantChat.ts`
- Modify: `packages/core/src/ai/chat/chat.ts`
- Modify: `apps/server/src/modules/` (new canvas controller, register module)
- Modify: `apps/desktop/src/kernel/ipc/` (new `canvasIpc.ts`, register)
- Test: extend `packages/core/test/canvasTools.test.ts` or add `canvasService.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CanvasApi {
  list(): Promise<CanvasMeta[]>;
  get(input: { slug: string }): Promise<CanvasDoc>;
  save(input: { slug: string; title: string; source: string }): Promise<CanvasDoc>;
  recordCheck(input: { slug: string; issues: string[]; stage: 'compile' | 'runtime' }): Promise<CanvasDoc>;
}
```

Routes: `GET /`, `GET /:slug`, `PUT /:slug`, `POST /:slug/check`.

Service uses `CANVAS_DIR`. Missing canvas throws `ClientError` 404.

Attach `buildCanvasTools(CANVAS_DIR)` next to `researchTools` in assistant and chart chat. Do not attach to analyst.

- [ ] **Step 1: Failing service test** — `save` then `get` then `recordCheck` then `get` shows compile issues.
- [ ] **Step 2: Implement contract, service, HTTP, IPC, tool wiring**
- [ ] **Step 3: Run `@kansoku/core` canvas tests + typecheck**

---

### Task 5: Compile

**Files:**
- Create: `packages/core/src/canvas/compile.ts`
- Test: `packages/core/test/canvasCompile.test.ts`
- Add dep: `sucrase` on `@kansoku/core`

**Interfaces:**
- Produces:

```ts
export function compileCanvasSource(source: string):
  | { ok: true; code: string }
  | { ok: false; issues: string[] }
```

Rewrite `from '@kansoku/canvas'` to `from '__kansoku_canvas__'`. Wrap compiled body so the host can `new Function('__kansoku_canvas__', 'React', code)`.

- [ ] **Step 1: Failing test** — valid source compiles; body mentions `__kansoku_canvas__`; a source that already failed `checkCanvasSource` is not compiled.
- [ ] **Step 2: Implement with sucrase `transforms: ['typescript', 'jsx']`**
- [ ] **Step 3: Green**

---

### Task 6: Minimum SDK + iframe

**Files:**
- Create workspace package `@kansoku/canvas` under `packages/canvas-sdk`
- Create `apps/web/src/features/canvas/CanvasFrame.tsx`
- Create `apps/web/src/features/canvas/canvasRuntime.ts`
- Wire package into `apps/web` and `pnpm-workspace.yaml`

SDK exports this version: `Canvas`, `Section`, `Grid`, `Row`, `Stack`, `Card`, `H1`, `H2`, `H3`, `Text`, `Stat`, `Table`, `useState`, `useMemo`. Colors from `apps/web/src/lib/theme.ts` tokens copied into the SDK (do not import `@web`).

`Canvas` props: `{ title: string; caption?: string; children }`.

Iframe: `sandbox="allow-scripts"`. Host posts `{ type: 'source', source }`. Guest compiles, renders, posts `{ type: 'runtime-error' | 'ok', issues?: string[] }`. Host calls `canvas.recordCheck`.

- [ ] **Step 1: SDK render tests** (vitest + happy-dom or the web test setup already in apps/web)
- [ ] **Step 2: Implement SDK + iframe**
- [ ] **Step 3: Manual: open a saved canvas in `/chat` split — next task**

---

### Task 7: Analysis charts

Add `LineChart`, `BarChart` (signed colors), `AreaChart`, `PieChart`, `Callout`, `Pill`, `Divider`, `Toggle`, `Select` to `@kansoku/canvas`. Recharts is a dependency of the SDK, not of agent source.

Each chart requires `title` and axis unit props. Missing title is a visible fallback "Untitled" — skill will forbid it later; do not crash.

---

### Task 8: CandleChart

Extract a props-only wrapper around existing Lightweight Charts primitives. Props match the spec. Indicators are passed in, never computed. One symbol, one timeframe per instance.

Do not import `IntradayDashboard`. New file in the SDK. Share primitive code by moving the needed primitives to a place both web cockpit and SDK can import, or copy the minimum paint path if a move is too large — prefer a move into `packages/chart-kit` only if the existing files cannot be imported from the SDK without pulling the whole cockpit.

---

### Task 9: Surfaces

- `/chat`: `ResizablePanel` — conversation | `CanvasFrame`
- ChatDock `full`: same split; card in the transcript opens it; Esc returns to float
- Research panel: same card → fullscreen split
- Shared `CanvasCard` in the transcript: thumbnail, title, `slug · relative time`, actions 打开 / 新窗口 (hidden this version) / 源码
- Same slug updates the existing card in that session
- Nav item + `/canvases` list + `/canvases/:slug` viewer

---

### Task 10: canvas skill

Write `.claude/skills/canvas/SKILL.md` after the SDK surface is real. Cover when to use a canvas vs `chart` skill, fetch-then-embed, component list, and the static-check bans.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| §3 file + CANVAS_DIR | 2 |
| §3.1 not in /api/charts | 4 (separate contract) |
| §4 tools + static check | 1, 3 |
| §4.2 check write-back | 2 `recordCanvasCheck`, 4 `recordCheck`, 6 iframe |
| §4.3 assistant + chart chat | 4 |
| §4.3 research pro reuse | 9 (same tools) |
| §4.4 skill | 10 |
| §5 min SDK | 6 |
| §5 analysis charts | 7 |
| §5 CandleChart | 8 |
| §6 compile + iframe | 5, 6 |
| §7 UI | 9 |
| §8 YAGNI | no tasks |

## Type names

Use `CanvasMeta`, `CanvasDoc`, `CanvasCheckRecord`, `CanvasApi`, `checkCanvasSource`, `saveCanvas`, `loadCanvas`, `listCanvases`, `recordCanvasCheck`, `compileCanvasSource`, `buildCanvasTools` exactly as above in every later task.
