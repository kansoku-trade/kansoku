# 研究库收纳画布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画布事后只在研究库第三档找回；拆掉独立 `/canvases` 家；外壳按钮改用现有控件。

**Architecture:** `journal/canvases/*.canvas.tsx` 仍只由 canvas store 写入。`research.list` / `get` 多一个 `kind: 'canvas'` 只读目录。研究库中间栏用 slug 再调 `canvas.get` 渲染 `CanvasFrame`。对话分栏不动。

**Tech Stack:** TypeScript, vitest, 现有 research HTTP/IPC 合同, React Testing Library, Vite 文件路由。

**Spec:** `docs/superpowers/specs/2026-08-28-research-library-canvas-design.md`

## Global Constraints

- 只改公共 `kansoku`。不要把画布并进 `ChartDoc` / `/api/charts`。
- 写入仍只走 `save_canvas` / `canvas.save`。`ResearchDocument.markdown` 对画布永远是 `''`。
- 研究库 AI 侧栏这轮不接画布。pro 的 getChat / refresh / edit 靠 UI 不渲染；`writeResearchDocumentAtomic` 必须拒画布 path。
- 路径公约：`journal/canvases/<kebab-slug>.canvas.tsx`。slug 与 canvas store 相同：`^[a-z0-9]+(?:-[a-z0-9]+)*$`。
- Docs 中文白话。Code、comments、commits 英文。没有隐藏不变量就不要写 comment。
- Tests first。先看红再写实现。
- 用户没要求就不要 commit。下面的 Commit 步在用户要求之前跳过。

---

## File map

- Modify: `packages/core/src/contract/research.ts` — `ResearchKind` / `ResearchDocumentType` + path helpers
- Modify: `packages/core/src/research/research.service.ts` — list/get/resolve/sort + 拒写
- Modify: `packages/core/src/ai/agents/researchLibraryTools.ts` — 读画布不吐 TSX
- Modify: `apps/server/src/modules/research/research.controller.ts` — `parseKind` 认 canvas
- Modify: `apps/web/src/features/research/researchModel.ts` — 第三档
- Modify: `apps/web/src/features/research/ResearchPage.tsx` — 三档 UI、藏新建、藏侧栏、中间栏渲染画布
- Modify: `apps/web/src/pages/canvases/index.sync.tsx`、`[slug].sync.tsx` — 重定向
- Delete: `apps/web/src/features/canvas/CanvasListPage.tsx`、`CanvasViewerPage.tsx`
- Modify: `apps/web/src/features/home/QuickBar.tsx`、`palette/commands.ts`
- Modify: `apps/web/src/features/canvas/CanvasCard.tsx`、`CanvasPane.tsx`
- Modify: `packages/canvas-sdk/src/theme.ts` — accent `#ffb000`
- Modify: `apps/web/src/styles.css` — 三列 switch；卡片动作不再依赖裸 button 默认样式
- Test: `packages/core/test/researchService.test.ts`、`createResearch.test.ts`
- Test: `packages/core/test/researchLibraryTools.test.ts`（新建）
- Test: `apps/server/test/research-browse.test.ts`
- Test: `apps/web/src/features/research/researchModel.test.ts`、`ResearchPage.test.tsx`
- Test: `apps/web/src/routes.test.tsx`、`QuickBar.test.tsx`、`palette/commands.test.ts`
- Test: `apps/web/src/features/canvas/CanvasCard.test.tsx`、`CanvasPane.test.tsx`（新建）

`ResearchIpc` 把 `list` input 原样转给 service，不用改。`CreateResearchDialog` 的选项仍只有 stock/journal。落地站 replica 不动。

---

### Task 1: 合同与研究库只读目录

**Files:**
- Modify: `packages/core/src/contract/research.ts`
- Modify: `packages/core/src/research/research.service.ts`
- Test: `packages/core/test/researchService.test.ts`

**Interfaces:**
- Consumes: `listCanvases` / `loadCanvas` from `packages/core/src/canvas/store.ts`；slug 规则与 store 相同
- Produces:
  - `ResearchKind = 'stock' | 'journal' | 'canvas'`
  - `ResearchDocumentType` 增加 `'canvas'`
  - `researchCanvasPath(slug: string): string` → `journal/canvases/${slug}.canvas.tsx`
  - `canvasSlugFromResearchPath(path: string): string | null`
  - `research.list({ kind: 'canvas' | undefined })` 含画布 meta
  - `research.get({ path })` 对画布：`markdown: ''`，`revision` 为源码 sha256

- [ ] **Step 1: 把 path helpers 和类型写进合同（先写测试会用到的名字）**

在 `packages/core/src/contract/research.ts` 里，`ResearchKind` / `ResearchDocumentType` 加上 `'canvas'`，并导出：

```ts
export const RESEARCH_CANVAS_DIR = 'journal/canvases';

export function researchCanvasPath(slug: string): string {
  return `${RESEARCH_CANVAS_DIR}/${slug}.canvas.tsx`;
}

export function canvasSlugFromResearchPath(path: string): string | null {
  const match = /^journal\/canvases\/([a-z0-9]+(?:-[a-z0-9]+)*)\.canvas\.tsx$/.exec(path);
  return match?.[1] ?? null;
}
```

从 `packages/core/src/contract/index.ts` 再导出这两个函数（若该文件已 `export *` 则不用动）。

- [ ] **Step 2: 写失败测试**

在 `packages/core/test/researchService.test.ts` 追加。先 `import { saveCanvas } from '../src/canvas/store.js'` 和 `import { researchCanvasPath } from '../src/contract/research.js'`。

```ts
const CANVAS_SOURCE = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="MU 验收面板"><Text>ok</Text></Canvas>;
}
`;

describe('research library canvases', () => {
  it('lists canvases as a third kind and extracts symbols from title and slug', async () => {
    write('stocks/MU.md', '# MU\n\n档案。\n');
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    expect(saved.ok).toBe(true);

    const all = await createResearchService(root).list({});
    const canvas = all.find((row) => row.kind === 'canvas');
    expect(canvas).toMatchObject({
      path: 'journal/canvases/acceptance-mu-panel.canvas.tsx',
      type: 'canvas',
      title: 'MU 验收面板',
      date: null,
      symbols: ['MU'],
      excerpt: 'MU 验收面板',
    });
    expect(canvas).not.toHaveProperty('markdown');
    expect(all[0].kind).toBe('stock');
    expect(all.at(-1)?.kind).toBe('canvas');

    const only = await createResearchService(root).list({ kind: 'canvas' });
    expect(only).toHaveLength(1);
    expect(only[0].path).toBe(researchCanvasPath('acceptance-mu-panel'));
  });

  it('searches canvas title and slug without returning source as markdown', async () => {
    await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });

    const rows = await createResearchService(root).list({
      kind: 'canvas',
      query: 'acceptance-mu-panel',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('markdown');
  });

  it('gets a canvas as empty markdown with a source revision', async () => {
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    if (!saved.ok) throw new Error('save failed');

    const document = await createResearchService(root).get({
      path: researchCanvasPath('acceptance-mu-panel'),
    });
    expect(document.markdown).toBe('');
    expect(document.title).toBe('MU 验收面板');
    expect(document.kind).toBe('canvas');
    expect(document.revision).toMatch(/^[\da-f]{64}$/);
    expect(document.revision).not.toBe(
      createHash('sha256').update('').digest('hex'),
    );
  });

  it('rejects canvas paths outside journal/canvases or with a bad slug', async () => {
    const service = createResearchService(root);
    await expect(service.get({ path: 'journal/other.canvas.tsx' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.get({ path: 'journal/canvases/Not-Kebab.canvas.tsx' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('skips .meta.json when listing canvases', async () => {
    await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    const rows = await createResearchService(root).list({ kind: 'canvas' });
    expect(rows.every((row) => row.path.endsWith('.canvas.tsx'))).toBe(true);
  });
});
```

顶部补 `import { createHash } from 'node:crypto'`。

- [ ] **Step 3: 跑测试，确认失败**

Run: `cd repos/kansoku && pnpm --filter @kansoku/core test test/researchService.test.ts`

Expected: FAIL。现有 `rejects unknown views` 仍应把非 stock/journal 当 400，新的 `kind: 'canvas'` 用例会先挂在校验上。

- [ ] **Step 4: 实现**

`research.service.ts`：

1. `list` 的合法 kind 改为 `stock | journal | canvas`。缺省 kinds：`['stock', 'journal', 'canvas']`。
2. `kind === 'canvas'` 时不要跑 `listMarkdownFiles`。对 `resolve(rootDir, 'journal', 'canvases')` 调 `listCanvases`，再映射成 `ResearchDocument`（list 再剥掉 markdown）。
3. 映射：`path = researchCanvasPath(slug)`，`type: 'canvas'`，`date: null`，`excerpt = title`，`markdown = ''`（list 用），`symbols` 用现有 `addSymbol` 扫 title 里的词和 slug 的 `-` 分段（不要读 TSX）。
4. `compareDocuments` 用顺序 `stock < journal < canvas`，canvas 档内按 `mtime` 降序。不要沿用 `a.kind === 'stock' ? -1 : 1`，否则 journal 和 canvas 会排反。
5. `resolveResearchDocumentPath`：若 `canvasSlugFromResearchPath(inputPath)` 有值，只允许落在 `journal/canvases/` 下的真实文件，symlink 规则与 markdown 相同，返回 `{ kind: 'canvas' }`。其它非 `.md` 仍 400。
6. `get`：resolved.kind === `'canvas'` 时 `loadCanvas`，读不到 404；`revision = researchDocumentRevision(source)`，`markdown = ''`。

- [ ] **Step 5: 再跑测试**

Run: `cd repos/kansoku && pnpm --filter @kansoku/core test test/researchService.test.ts`

Expected: PASS。原来的 markdown 列表用例路径集合不能多出画布（那些 fixture 没写 canvas 文件）。

- [ ] **Step 6: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku add packages/core/src/contract/research.ts packages/core/src/research/research.service.ts packages/core/test/researchService.test.ts
git -C repos/kansoku commit -m "$(cat <<'EOF'
feat: list canvases as a research library kind

EOF
)"
```

---

### Task 2: 写接口拒画布 + HTTP parseKind

**Files:**
- Modify: `packages/core/src/research/research.service.ts`（`writeResearchDocumentAtomic`）
- Modify: `apps/server/src/modules/research/research.controller.ts`
- Test: `packages/core/test/researchService.test.ts`、`packages/core/test/createResearch.test.ts`
- Test: `apps/server/test/research-browse.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `kind: 'canvas'` 与 `researchCanvasPath`
- Produces: `writeResearchDocumentAtomic` 对 canvas 抛 `ClientError`；`GET /api/research?kind=canvas` 能进 service

- [ ] **Step 1: 写失败测试**

`researchService.test.ts`：

```ts
it('refuses to write a canvas through the markdown document API', async () => {
  await saveCanvas(join(root, 'journal', 'canvases'), {
    slug: 'acceptance-mu-panel',
    title: 'MU 验收面板',
    source: CANVAS_SOURCE,
  });
  const current = await createResearchService(root).get({
    path: researchCanvasPath('acceptance-mu-panel'),
  });
  await expect(
    writeResearchDocumentAtomic({
      rootDir: root,
      path: researchCanvasPath('acceptance-mu-panel'),
      markdown: '# no',
      expectedRevision: current.revision,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
```

记得从 `research.service.js` 一并 import `writeResearchDocumentAtomic`。

`createResearch.test.ts`：

```ts
it('rejects canvas as a create kind', async () => {
  await expect(
    createResearchDocument({ kind: 'canvas' } as ResearchCreateInput, {
      rootDir: root,
      buildSepaChart: vi.fn(),
    }),
  ).rejects.toMatchObject({ status: 400 });
});
```

`research-browse.test.ts` 在「rejects unknown research views」旁加：

```ts
it('forwards the canvas view to the research service', async () => {
  const res = await tsukiRequest('/api/research?kind=canvas');
  expect(res.status).toBe(200);
  expect(service.list).toHaveBeenCalledWith({ kind: 'canvas', query: undefined });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run:

```
cd repos/kansoku && pnpm --filter @kansoku/core test test/researchService.test.ts test/createResearch.test.ts
cd repos/kansoku && pnpm --filter @kansoku/server test test/research-browse.test.ts
```

Expected: write 测试若还没拒会写坏文件或 409/别的错；HTTP `kind=canvas` 现为 400。`create` 这条现在就该过（`createResearchDocument` 已拒非 stock/journal）——若已过，留下当回归。

- [ ] **Step 3: 实现**

`writeResearchDocumentAtomic`：`resolve` 之后若 `kind === 'canvas'`，

```ts
throw new ClientError(
  'cannot write canvas through research document API',
  'use save_canvas',
);
```

`parseKind`：

```ts
if (value === 'stock' || value === 'journal' || value === 'canvas') return value;
throw new ClientError('invalid research kind', 'expected stock, journal, or canvas');
```

- [ ] **Step 4: 再跑测试**

同上两条命令。Expected: PASS。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
fix: reject canvas writes on the research markdown path

EOF
)"
```

---

### Task 3: `read_research_document` 不吐 TSX

**Files:**
- Modify: `packages/core/src/ai/agents/researchLibraryTools.ts`
- Create: `packages/core/test/researchLibraryTools.test.ts`

**Interfaces:**
- Consumes: `canvasSlugFromResearchPath`；`createResearchService(rootDir).get`
- Produces: 画布 path 的 tool 文本含 `read_canvas`，不含 `export default` / `@kansoku/canvas`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildResearchLibraryTools } from '../src/ai/agents/researchLibraryTools.js';
import { saveCanvas } from '../src/canvas/store.js';
import { researchCanvasPath } from '../src/contract/research.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="MU 验收面板"><Text>secret-source</Text></Canvas>;
}
`;

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return (result.content[0] as { text: string }).text;
}

describe('research library tools vs canvases', () => {
  it('can search a canvas and refuses to return its source from read_research_document', async () => {
    const root = mkdtempSync(join(tmpdir(), 'research-library-tools-'));
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source,
    });
    expect(saved.ok).toBe(true);

    const byName = Object.fromEntries(
      buildResearchLibraryTools(root).map((tool) => [tool.name, tool]),
    );
    const found = await byName.search_research_documents.execute('s1', {
      query: '验收面板',
    });
    expect(textOf(found)).toContain('acceptance-mu-panel');

    const read = await byName.read_research_document.execute('s2', {
      path: researchCanvasPath('acceptance-mu-panel'),
    });
    const text = textOf(read);
    expect(text).toMatch(/read_canvas/);
    expect(text).not.toContain('secret-source');
    expect(text).not.toContain('export default');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd repos/kansoku && pnpm --filter @kansoku/core test test/researchLibraryTools.test.ts`

Expected: FAIL。现在 `read` 会返回 `markdown === ''`，不含 `read_canvas`。

- [ ] **Step 3: 实现**

`read_research_document.execute` 开头：

```ts
if (canvasSlugFromResearchPath(params.path)) {
  return textResult('This path is a canvas. Use read_canvas with its slug.');
}
```

不要先 `get` 再判断，避免无意义读盘也可以；先判 path 再 get。

- [ ] **Step 4: 再跑测试**

同上。Expected: PASS。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
fix: keep canvas source off the research document tool

EOF
)"
```

---

### Task 4: 研究库 view 模型

**Files:**
- Modify: `apps/web/src/features/research/researchModel.ts`
- Test: `apps/web/src/features/research/researchModel.test.ts`

**Interfaces:**
- Consumes: `ResearchKind` 已含 `'canvas'`；`researchCanvasPath`
- Produces:
  - `ResearchView = 'stocks' | 'journal' | 'canvases'`
  - `parseResearchView('canvases') === 'canvases'`；未知值仍 `'journal'`
  - `kindForView('canvases') === 'canvas'`
  - `viewForKind('canvas') === 'canvases'`
  - `researchTypeLabel('canvas') === '画布'`
  - `relatedDocuments` 能把带相同 symbols 的 canvas 算进去（现有算法不用改，补一条回归）

- [ ] **Step 1: 写失败测试**

`researchModel.test.ts` 追加：

```ts
it('parses the canvases view and keeps unknown values on the journal timeline', () => {
  expect(parseResearchView('canvases')).toBe('canvases');
  expect(parseResearchView('unknown')).toBe('journal');
});

it('round-trips a canvas path through the research route', () => {
  const route = researchRoute('canvases', 'journal/canvases/acceptance-mu-panel.canvas.tsx');
  const params = new URLSearchParams(route.split('?')[1]);
  expect(params.get('view')).toBe('canvases');
  expect(params.get('path')).toBe('journal/canvases/acceptance-mu-panel.canvas.tsx');
});

it('labels a canvas and links it from a matching stock note', () => {
  expect(researchListSecondary(document({ type: 'canvas', symbols: ['MU'] }))).toBe('画布 · MU');
  const stock = document({
    path: 'stocks/MU.md',
    kind: 'stock',
    type: 'stock',
    symbols: ['MU'],
  });
  const canvas = document({
    path: 'journal/canvases/acceptance-mu-panel.canvas.tsx',
    kind: 'canvas',
    type: 'canvas',
    title: 'MU 验收面板',
    symbols: ['MU'],
  });
  expect(relatedDocuments(stock, [canvas]).map((item) => item.path)).toEqual([
    'journal/canvases/acceptance-mu-panel.canvas.tsx',
  ]);
});
```

`relatedDocuments` 里 `kind === 'stock'` 的排在前面；从 stock 找 canvas 时 canvas 的 kind 不是 stock，会排在后面，只要 path 在结果里即可。上面断言只有一条 canvas，顺序就是它。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd repos/kansoku && pnpm --filter @kansoku/web test src/features/research/researchModel.test.ts`

Expected: FAIL。`parseResearchView('canvases')` 现在回落 journal。

- [ ] **Step 3: 实现**

```ts
export type ResearchView = 'stocks' | 'journal' | 'canvases';

export function parseResearchView(value: string | null): ResearchView {
  if (value === 'stocks') return 'stocks';
  if (value === 'canvases') return 'canvases';
  return 'journal';
}

export function kindForView(view: ResearchView): ResearchKind {
  if (view === 'stocks') return 'stock';
  if (view === 'canvases') return 'canvas';
  return 'journal';
}

export function viewForKind(kind: ResearchKind): ResearchView {
  if (kind === 'stock') return 'stocks';
  if (kind === 'canvas') return 'canvases';
  return 'journal';
}
```

`TYPE_LABELS` 加 `canvas: '画布'`。

- [ ] **Step 4: 再跑测试**

同上。Expected: PASS。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
feat: add the canvases view to the research library model

EOF
)"
```

---

### Task 5: 研究库第三档页面

**Files:**
- Modify: `apps/web/src/features/research/ResearchPage.tsx`
- Modify: `apps/web/src/styles.css`（`.research-view-switch` 三列）
- Test: `apps/web/src/features/research/ResearchPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 view/kind；`client.canvas.get`；`CanvasFrame`
- Produces: 三档 segmented；画布档无「新建」；选中 canvas 不渲染 `research-context`；中间栏是 `CanvasFrame` 不是 Markdown

- [ ] **Step 1: 写失败测试**

`ResearchPage.test.tsx`：给 `client` mock 加上 `canvas: { get: (...args) => canvasGet(...args) }`。新增 fixture：

```ts
const CANVAS_META: ResearchDocumentMeta = {
  path: 'journal/canvases/acceptance-mu-panel.canvas.tsx',
  kind: 'canvas',
  type: 'canvas',
  title: 'MU 验收面板',
  date: null,
  symbols: ['MU'],
  mtime: '2026-08-28T00:00:00.000Z',
  excerpt: 'MU 验收面板',
};
const CANVAS_DOC: ResearchDocument = {
  ...CANVAS_META,
  markdown: '',
  revision: 'r-canvas',
};
```

`vi.mock` CanvasFrame：

```ts
vi.mock('@web/features/canvas/CanvasFrame', () => ({
  CanvasFrame: ({ slug }: { slug?: string }) => <div data-testid="canvas-frame">{slug}</div>,
}));
```

`CanvasFrame` 现有 props 是 `source` + `slug`。测试里 frame 显示 slug 即可。

用例：

```ts
it('shows the canvases shelf without create, renders the frame, and hides the assistant column', async () => {
  const router = memRouter(
    '/research?view=canvases&path=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
  );
  setActiveRouter(router);
  list.mockResolvedValue([CANVAS_META]);
  get.mockResolvedValue(CANVAS_DOC);
  canvasGet.mockResolvedValue({
    slug: 'acceptance-mu-panel',
    title: 'MU 验收面板',
    source: 'export default function App() { return null }',
    mtime: CANVAS_META.mtime,
    check: null,
  });

  renderResearchPage();

  expect(await screen.findByRole('button', { name: '画布' })).toBeTruthy();
  expect(screen.queryByText('新建')).toBeNull();
  expect(await screen.findByTestId('canvas-frame')).toHaveTextContent('acceptance-mu-panel');
  expect(screen.queryByText('AVGO 档案正文')).toBeNull();
  expect(screen.queryByLabelText('关联研究资料')).toBeNull();
});
```

现有 create-flow 用例从 stocks 档点「新建」，不要改坏。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd repos/kansoku && pnpm --filter @kansoku/web test src/features/research/ResearchPage.test.tsx`

Expected: FAIL。没有「画布」按钮，有「新建」，没有 canvas-frame。

- [ ] **Step 3: 实现**

`VIEW_OPTIONS` 加 `{ key: 'canvases', label: '画布' }`。图标用 `LayoutDashboard`。

`.research-view-switch`：`grid-template-columns: 1fr 1fr 1fr`；`min-width` 提到约 `280px`。

`ResearchPage`：

- `canvasCount` 写入副标题：`N 篇股票档案 · N 篇研究日志 · N 份画布`
- `view === 'canvases'` 不渲染「新建」
- explorer 头：`view === 'canvases' ? '画布' : view === 'stocks' ? '股票档案' : '研究时间线'`
- 搜索占位：`view === 'canvases' ? '搜索标题或标的' : …`
- `selected?.kind === 'canvas'` 时不渲染 `<ResearchContext …>`

`ResearchReader`：若 `document.kind === 'canvas'`，头仍用 Badge + 标题 + path + 时间；body 调 `client.canvas.get({ slug: canvasSlugFromResearchPath(document.path)! })`，成功后 `<CanvasFrame source={…} slug={…} />`。不要把空 markdown 丢给 `Markdown`。

- [ ] **Step 4: 再跑测试**

同上。Expected: PASS。顺带再跑一遍 `ResearchPage.test.tsx` 里原来的新建缓存用例。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
feat: open canvases inside the research library shelf

EOF
)"
```

---

### Task 6: 拆掉独立的画布家

**Files:**
- Modify: `apps/web/src/pages/canvases/index.sync.tsx`
- Modify: `apps/web/src/pages/canvases/[slug].sync.tsx`
- Delete: `apps/web/src/features/canvas/CanvasListPage.tsx`
- Delete: `apps/web/src/features/canvas/CanvasViewerPage.tsx`
- Modify: `apps/web/src/features/home/QuickBar.tsx`
- Modify: `apps/web/src/features/palette/commands.ts`
- Test: `apps/web/src/routes.test.tsx`、`QuickBar.test.tsx`、`palette/commands.test.ts`

**Interfaces:**
- Consumes: `researchCanvasPath`；`/research?view=canvases`
- Produces: `/canvases` 与 `/canvases/:slug` 落到研究库；QuickBar 没有「画布」图标；命令面板 `nav:canvases.route === '/research?view=canvases'`

- [ ] **Step 1: 写失败测试**

`routes.test.tsx`：删掉对 `CanvasListPage` / `CanvasViewerPage` 的 mock。把

```ts
it('renders the canvas list for a community build (pro:false)', async () => {
  …
  renderRoute('/canvases');
  expect(await screen.findByTestId('canvas-list')).toBeTruthy();
});
```

改成：

```ts
it('redirects /canvases into the research library shelf', async () => {
  capabilities = { pro: false, licensed: false };
  renderRoute('/canvases');
  expect(await screen.findByTestId('research-page')).toBeTruthy();
});
```

再加：

```ts
it('redirects /canvases/:slug into the research library with the canvas path', async () => {
  capabilities = { pro: false, licensed: false };
  renderRoute('/canvases/acceptance-mu-panel');
  expect(await screen.findByTestId('research-page')).toBeTruthy();
});
```

`createMemoryRouter` 对 `<Navigate>` 会真跳。ResearchPage 仍被 mock 成 `research-page`，所以断言 testid 即可。若要锁 query，读 `router.state.location.search`——`renderRoute` 现在没返回 router。改 `renderRoute` 返回 router：

```ts
function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  setActiveRouter(router);
  render(<RouterProvider router={router} />);
  return router;
}
```

slug 用例：

```ts
const router = renderRoute('/canvases/acceptance-mu-panel');
expect(await screen.findByTestId('research-page')).toBeTruthy();
expect(router.state.location.pathname + router.state.location.search).toBe(
  '/research?view=canvases&path=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
);
```

`QuickBar.test.tsx`：第一条里删掉 `getByLabelText('画布')`，改成 `queryByLabelText('画布')` 为 `null`。研究库 href 仍是 `/research?view=journal`。

`commands.test.ts`：空 query 仍含 `nav:canvases`。另加：

```ts
it('opens canvases inside the research library', () => {
  const command = buildPaletteCommands('画布', []).find((item) => item.id === 'nav:canvases');
  expect(command?.route).toBe('/research?view=canvases');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run:

```
cd repos/kansoku && pnpm --filter @kansoku/web test src/routes.test.tsx src/features/home/QuickBar.test.tsx src/features/palette/commands.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现**

`pages/canvases/index.sync.tsx`：

```tsx
import { Navigate } from 'react-router';

export function Component() {
  return <Navigate to="/research?view=canvases" replace />;
}
```

`pages/canvases/[slug].sync.tsx`：

```tsx
import { Navigate, useParams } from 'react-router';
import { researchCanvasPath } from '@kansoku/core/contract/research';

export function Component() {
  const slug = decodeURIComponent(useParams().slug ?? '');
  const path = slug ? researchCanvasPath(slug) : '';
  const search = new URLSearchParams({ view: 'canvases' });
  if (path) search.set('path', path);
  return <Navigate to={`/research?${search.toString()}`} replace />;
}
```

删 `CanvasListPage.tsx`、`CanvasViewerPage.tsx`。不要删 `useCanvasWorkspace`（对话分栏还在用）。

QuickBar 去掉画布 `<a>` 和 `LayoutDashboard` import。

`commands.ts`：`route: '/research?view=canvases'`。

- [ ] **Step 4: 再跑测试**

同上。Expected: PASS。`generated-routes.ts` 由 vite 插件维护，不要手改；路由 path 仍是 `canvases`，只是 Component 变成 Navigate。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
refactor: fold the canvas home into the research library

EOF
)"
```

---

### Task 7: 外壳控件和强调色

**Files:**
- Modify: `apps/web/src/features/canvas/CanvasCard.tsx`
- Modify: `apps/web/src/features/canvas/CanvasPane.tsx`
- Modify: `apps/web/src/styles.css`（`.canvas-card-actions`、`.canvas-pane-actions`）
- Modify: `packages/canvas-sdk/src/theme.ts`
- Create: `apps/web/src/features/canvas/CanvasCard.test.tsx`
- Create: `apps/web/src/features/canvas/CanvasPane.test.tsx`

**Interfaces:**
- Consumes: 现有 `.link-button`、`.research-view-switch`、`Button`
- Produces: 卡片动作和分栏切换不再是系统默认 button；SDK `theme.accent === '#ffb000'`

- [ ] **Step 1: 写失败测试**

`CanvasCard.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasCard } from './CanvasCard';

afterEach(() => cleanup());

describe('CanvasCard chrome', () => {
  it('uses link-button actions instead of bare system buttons', () => {
    render(
      <CanvasCard slug="acceptance-mu-panel" title="MU 验收面板" onOpen={() => {}} onSource={() => {}} />,
    );
    for (const label of ['打开', '新窗口', '源码']) {
      expect(screen.getByRole('button', { name: label }).className).toContain('link-button');
    }
  });
});
```

`CanvasPane.test.tsx`：mock `client.canvas.get` 成 resolved doc，断言「画面」「源码」的父节点带 `research-view-switch`，「关闭」带 `btn`。

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/lib/client', () => ({
  client: {
    canvas: {
      get: vi.fn().mockResolvedValue({
        slug: 'acceptance-mu-panel',
        title: 'MU 验收面板',
        source: 'export default function App() { return null }',
        mtime: '2026-08-28T00:00:00.000Z',
        check: null,
      }),
    },
  },
}));
vi.mock('./CanvasFrame', () => ({
  CanvasFrame: () => <div data-testid="canvas-frame" />,
}));

const { CanvasPane } = await import('./CanvasPane');

afterEach(() => cleanup());

describe('CanvasPane chrome', () => {
  it('uses the research segmented control and the shared Button', async () => {
    render(
      <CanvasPane slug="acceptance-mu-panel" view="canvas" onClose={() => {}} onViewChange={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('MU 验收面板')).toBeTruthy());
    const switchRoot = screen.getByRole('group', { name: '画布视图' });
    expect(switchRoot.className).toContain('research-view-switch');
    expect(screen.getByRole('button', { name: '关闭' }).className).toContain('btn');
  });
});
```

theme：在 `packages/canvas-sdk` 里已有测试则加一行 `expect(theme.accent).toBe('#ffb000')`。没有就在 `apps/web` 不测文件内容，改完用 grep 确认只剩 `#ffb000`。本任务实现步把 `theme.ts` 的 `accent` 改掉即可；用下面这条命令当断言：

```
rg "facc15" repos/kansoku/packages/canvas-sdk
```

Expected after fix: no matches.

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd repos/kansoku && pnpm --filter @kansoku/web test src/features/canvas/CanvasCard.test.tsx src/features/canvas/CanvasPane.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现**

`CanvasCard` 三个 button 加 `className="link-button"`。

`CanvasPane` 把「画面 / 源码」包进：

```tsx
<div className="research-view-switch" role="group" aria-label="画布视图">
  <button type="button" className={view === 'canvas' ? 'active' : ''} …>画面</button>
  <button type="button" className={view === 'source' ? 'active' : ''} …>源码</button>
</div>
```

「关闭」保持 `<Button>`。

`styles.css`：删掉只改字色、不洗 appearance 的 `.canvas-card-actions button` 规则（改走 `.link-button`）。`.canvas-pane-actions button.is-active` 也可删，改走 `.research-view-switch button.active`。

`packages/canvas-sdk/src/theme.ts`：`accent: '#ffb000'`。

分栏里套 `research-view-switch` 会变成三列 grid 的两颗按钮，仍然可用。不要为两颗再开一套 CSS。

- [ ] **Step 4: 再跑测试**

同上 web 测试。再跑：

```
cd repos/kansoku && pnpm --filter @kansoku/web test src/features/canvas/CanvasFrame.test.tsx
cd repos/kansoku && pnpm --filter @kansoku/core test test/researchService.test.ts test/researchLibraryTools.test.ts
```

Expected: PASS。`rg facc15 packages/canvas-sdk` 无输出。

- [ ] **Step 5: Commit（用户要求之前跳过）**

```bash
git -C repos/kansoku commit -m "$(cat <<'EOF'
fix: use app chrome for canvas actions and accent

EOF
)"
```

---

## Self-review

| Spec | Task |
| --- | --- |
| 第三档 stocks/journal/canvases | 4, 5 |
| list/get 只读目录、symbols、空 markdown、revision | 1 |
| parseKind / 缺省 list 含 canvas | 1, 2 |
| 写 API / create 拒画布 | 2 |
| search 得到画布、read 不吐 TSX | 3 |
| 中间栏 CanvasFrame、无新建、无 AI 侧栏 | 5 |
| 关联资料靠 symbols | 4（算法）+ 1（抽标的） |
| /canvases 重定向、QuickBar、命令面板 | 6 |
| 外壳 link-button / segmented、accent `#ffb000` | 7 |
| 不进图表列表、不给画布档新建、侧栏不接 save_canvas | 全局不做 |

无 TBD。类型名全程 `canvas` / `canvases` / `researchCanvasPath` / `canvasSlugFromResearchPath`。
