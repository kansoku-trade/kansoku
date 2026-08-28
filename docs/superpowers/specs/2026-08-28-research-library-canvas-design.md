# 研究库收纳画布 + 外壳控件

日期：2026-08-28
范围：研究库第三档「画布」、`research.list` / `get` 对 `journal/canvases/*.canvas.tsx` 的只读目录、拆掉独立 `/canvases` 家、对话卡片与分栏外壳改用现有控件。取代 [agent-canvas-design](./2026-08-28-agent-canvas-design.md) 的 §7.4。画布写入、编译、沙箱、对话分栏的模型不变。

## 背景与问题

画布已经落在 `journal/canvases/<slug>.canvas.tsx`，是 journal 下的耐久记录。研究库只扫 `.md`，所以生成完之后在研究库里找不到。独立 `/canvases` 页成了第二个家，和「研究库是耐久记录浏览器」打架。

同一轮做出来的外壳（对话卡片「打开 / 源码」、分栏顶上「画面 / 源码」、`/canvases` 列表行）用了没重置的 `<button>`，在 Electron 里是系统默认按钮。SDK 强调色写成 `#facc15`，应用是 `#ffb000`。

已确认的方向：研究库顶上加第三档「画布」；事后找回只走研究库；对话分栏仍是现场打开；写入仍只走 `save_canvas`；研究库 AI 侧栏这轮不接画布。

## 设计

### 1. 第三档

`ResearchView` 变成 `'stocks' | 'journal' | 'canvases'`。`parseResearchView('canvases')` 才进画布档，其余未知值仍回落 `journal`。

对应 `ResearchKind` 增加 `'canvas'`。`kindForView('canvases') → 'canvas'`，`viewForKind('canvas') → 'canvases'`。

研究库顶上的 segmented 从两列改成三列，样式还是现在的 `.research-view-switch`（透明底、选中 `--accent`）。标签：股票档案 / 研究日志 / 画布。副标题：`N 篇股票档案 · N 篇研究日志 · N 份画布`。左边列表头在画布档写「画布」。搜索框占位：`搜索标题或标的`。

画布档不渲染「新建」。`CreateResearchDialog` 的 kind 选项仍只有 stock / journal，不出现 canvas。

### 2. 目录，不是第二份正文

文件位置、`.meta.json`、`canvas.save` / `save_canvas` 不动。研究库只做只读目录。

`research.list`：

- HTTP `parseKind`、`research.service` 对 kind 的校验、以及 `list` 缺省 kind 列表，都要把 `canvas` 算进去。只扩类型、控制器仍只认 stock/journal，第三档会空。
- `kind === 'canvas'`：只扫 `CANVAS_DIR` 下的 `*.canvas.tsx`，跳过 `.meta.json`。
- `kind` 缺省：stock + journal + canvas 都带上，给关联资料用。
- 画布 meta 的 `path` 固定为 `journal/canvases/<slug>.canvas.tsx`，`type` 为 `'canvas'`（类型文案「画布」），`title` 来自 canvas store 的 meta，`date` 为 `null`，`excerpt` 用标题，`symbols` 从标题词和 slug 段抽取（复用现有 `addSymbol` / 停用词，不读 TSX 正文，避免源码里的假标的）。
- 排序：stock 先于 journal 先于 canvas；canvas 档内按 `mtime` 降序。

`research.get`：

- path 是画布时回这条 meta，`markdown` 为 `''`，`revision` 为源码的 sha256（get 时读一次文件只为算 revision，不把源码放进 markdown）。
- 中间栏用 slug 再调 `client.canvas.get` 渲染 `CanvasFrame`。源码的唯一来源仍是 canvas API。

`resolveResearchDocumentPath`：`.md` 规则不变。画布只接受 `journal/canvases/<kebab-slug>.canvas.tsx`，出这个目录、扩展名不对、slug 不合法，一律当无效 path（现有 `ClientError`）。

下列 API 碰到画布 path 直接拒，不写、不改稿、不刷新、不开研究对话：`research.create`、`getChat` / `postMessage` / `abortChat`、`startRefresh` / `abortRefresh`、`applyEdit` / `rejectEdit` / `undoEdit`。

### 3. 助手工具

`search_research_documents` 走 `list({ query })`，因此能搜到画布。这是「在研究库里找到」的同一条索引。

`read_research_document` 读到画布 path 不返回 TSX。返回一句说明：这份是画布，用 `read_canvas`。改画布仍只准 `save_canvas`。

### 4. 研究库中间栏和右侧栏

选中画布时：

- 中间栏：沿用研究库 reader 的头（Badge「画布」、标题、path、更新时间），正文是 `CanvasFrame`，不要 Markdown。编译/运行错误用现有画布错误态。
- 右侧整列 `research-context`（研究库 AI + 关联资料）不渲染，宽度给画面。

从股票档案或日志的「关联资料」点进画布：`navigate` 到 `view=canvases` 且 `path` 为该画布 path。关联算法不变，只靠 `symbols` 交集；画布出现在 `list({})` 里就会被带上。

### 5. 拆掉独立的家

- `/canvases` → `/research?view=canvases`
- `/canvases/:slug` → `/research?view=canvases&path=journal/canvases/<slug>.canvas.tsx`
- QuickBar 去掉单独的「画布」图标；「研究库」仍进研究库（默认 journal 档即可）。
- 命令面板「打开画布」改到 `/research?view=canvases`。
- `CanvasListPage` / `CanvasViewerPage` 不再作为产品页。对话里的 `CanvasCard` + `CanvasSplit` / `CanvasPane` 留下，那是现场打开。

落地站的研究库 replica 不动。

### 6. 外壳和颜色

不新发明控件。

- `CanvasCard` 底部动作改成 `.link-button`（「新窗口」仍 disabled）。
- `CanvasPane` 的「画面 / 源码」改成和 `.research-view-switch` 同一套 segmented；「关闭」继续用 `Button`。
- `@kansoku/canvas` 的 `theme.accent` 改成 `#ffb000`，与 `apps/web/src/styles.css` 的 `--accent` 一致。

## 不做

- 研究库 AI 侧栏对画布调 `save_canvas`、在画布上改稿/刷新。
- 把 TSX 塞进 `ResearchDocument.markdown`，或把 canvas 写入并进 `research.create`。
- 画布进图表列表 / `/api/charts`。
- 给画布档加「新建」。
- 常驻工作台、活行情、原生新窗口（卡片上的位仍留着）。

## 验证

1. 研究库第三档能列出刚 `canvas.save` 进去的画布，标题和 slug 对得上。
2. 点开中间栏渲染出画面，不是空白、不是 markdown 源码。
3. 打开 MU 档案时，关联资料里能出现标题/slug 带 MU 的画布；点过去切到画布档。
4. `/canvases` 和 `/canvases/<slug>` 落到研究库对应档。QuickBar 没有单独画布入口。
5. 画布档没有「新建」；研究库 AI 侧栏在画布上看不见。
6. 对话卡片和分栏顶上的按钮是应用控件，不是系统默认按钮；画面里的强调色是 `#ffb000`。
7. `read_research_document` 对画布 path 不返回源码；`research.create` 等写接口拒画布 path。
