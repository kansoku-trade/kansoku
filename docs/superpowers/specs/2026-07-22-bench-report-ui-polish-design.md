# bench-report-ui 暗色重做设计（base-ui 底座）

日期：2026-07-22
范围：`packages/bench-report-ui`

## 1. 背景

`@kansoku/bench-report-ui` 生成两份单文件 HTML 报表（episode 和 leaderboard），由 `@kansoku/bench` 的 `report/uiAssets.ts` 读取 `dist/*.js` 与 `dist/*.css` 内联进 `report.html`。技术栈是 React 19 + vanilla-extract，构建成 IIFE。

现状问题：

- 没有组件库。筛选器是原生 `<select>`，时间周期切换是手搓的 `<button>` 组（挂了 `role="tablist"` 但没有键盘导航），折叠面板是 `<details>`。
- 视觉语言和产品端 `apps/web` 完全脱节：报表是浅色（`#f5f5f5` 底、白面板、蓝色主色），app 是暗色终端（`#0a0a0a` 底、琥珀主色）。
- 两个 entry 各有一份 `theme.css.ts`，变量名和值都不一样，另有 61 处硬编码色值散落在其余样式文件里。
- 详情区密度过头：决策链卡片正文 8px 且右侧被容器直接裁掉、无滚动提示；侧栏交易明细是整团 9–10px 彩色文本，逐字读不动。
- leaderboard 有两块假 UI：`FilterBar` 的按钮不接任何状态、搜索框写死 `disabled`；`TopBar` 的 nav 是 5 个 `href="#"`，其中 4 个标着「即将上线」。

## 2. 已定决策

| # | 议题 | 决定 |
|---|---|---|
| 1 | 工作性质 | 换组件底座 **+** 视觉重做；不补新功能 |
| 2 | 视觉方向 | 直接对齐 `apps/web` 的暗色终端 token |
| 3 | base-ui 接入方式 | `bench-report-ui` 包内直接依赖，token 值照抄；不抽共享包，不碰 `apps/web` |
| 4 | 报表范围 | episode 和 leaderboard 两份全做 |
| 5 | 密度 | 分层：概览区保持密，详情区放松 |
| 6 | 新增交互 | 只加术语悬浮解释；不做表格排序和粘性表头 |
| 7 | 打印 | 不管；删掉现有 `@media print` 规则 |

排除项及理由：

- 抽 `packages/ui` 共享组件包 —— 需要拆 `apps/web/src/styles.css` 那 7039 行全局裸类名样式表，风险外溢到整个 app，与本次目标无关。
- 双主题（浅色 + 暗色切换）—— 每条样式要过双色，工作量翻倍；报表是内联单文件，主题偏好无处持久化。
- 把假 FilterBar / TopBar nav 做成真的 —— 属于新功能，与决策 6 冲突。

## 3. 架构与 token 层

### 3.1 依赖

`packages/bench-report-ui/package.json` 的 `dependencies` 加 `@base-ui/react: ^1.6.0`。这个版本 `apps/web` 已在用，pnpm store 里现成。

`packages/bench` 侧零改动：`uiAssets.ts` 只按路径读 dist 文件；`src/types.ts` 是与 `@kansoku/bench` 的视图数据契约，一行不动。

### 3.2 合并 theme

现在两份 theme 的契约完全不同：

- `src/episode/styles/theme.css.ts`：`bg / panel / line / lineStrong / text / muted / green / red / blue / soft / mono`
- `src/leaderboard/styles/theme.css.ts`：`bg / panel / ink / ink2 / ink3 / ink4 / line / line2 / hover / sel / accent / pos / neg / mono`

合并成一份 `src/styles/theme.css.ts`，变量名和值照抄 `apps/web/src/styles.css` 的 `:root`：

```
bgCanvas #0a0a0a   bgSurface #141414   bgElement #1e1e1e   bgHover #262626
border #262626     borderStrong #3a3a3a
textPrimary #e8e8e8   textSecondary #9a9a9a   textMuted #5c5c5c
accent #ffb000
up #26a69a   down #ef5350   ok #34c759
focusBorder #7a7a7a   focusRing   focusOutline
fontUi   fontMono
fsXs 10px  fsSm 11px  fsBase 12px  fsMd 13px  fsLg 15px  fsXl 20px
radius 2px  radiusMd 6px  radiusLg 10px  radiusFull 999px
controlH 28px
```

另加四个语义色，给现有的 pass / fail 状态块用（app 那边没有对应物），取 `up` 和 `down` 的低透明度叠加：

```
stateOkBg     rgb(38 166 154 / 0.12)    stateOkBorder    rgb(38 166 154 / 0.35)
stateBadBg    rgb(239 83 80 / 0.12)     stateBadBorder   rgb(239 83 80 / 0.35)
```

两个 entry 各自 import 这份共享 theme。因为是两个独立 bundle，不存在变量冲突。

### 3.3 清理硬编码色

`src/**/*.css.ts` 里 theme 之外还有 61 处硬编码 hex（`#a7d8c7`、`#f0fdf8`、`#efb4b4`、`#fafafa`、`#dbeafe` 等）。全部收进 token。不做这一步的话暗色会花掉。

### 3.4 统一 reset

leaderboard 的 theme 带一条 `globalStyle('*', { margin: 0, padding: 0 })`，episode 没有。合并后统一采用这条 reset，episode 的排版需要逐屏对照原报表检查一遍——现有样式基本都显式写了 margin，风险不大，但必须目视确认。

### 3.5 删除 print 样式

移除 `src/episode/styles/reportBase.css.ts` 末尾的四条 `@media print` 规则。

### 3.6 不动的部分

`chart/scene.ts`、`chart/primitives.ts`、`chart/ema.ts`、`chart/ranges.ts` 的几何与计算逻辑（`scene.ts` 的三个颜色常量除外，见第 5 节）；`useCaseFilters.ts` 的过滤逻辑；`src/types.ts` 的全部视图契约；`scripts/build.mjs` 与 `vite.config.ts`。

## 4. 组件替换

### 4.1 episode 报表

| 位置 | 现在 | 换成 |
|---|---|---|
| `CasesTable` 模型 / 模式 / 结果筛选 | 原生 `<select>` ×3 | `@base-ui/react/select` |
| `CasesTable` 搜索框 | `<input type="search">` | `@base-ui/react/input` |
| `ChartPanel` 时间周期切换 | 手搓 `<button>` 组 | `@base-ui/react/toggle-group` |
| `ProcessChain` 的 `.process-rail` | 横向溢出被裁、无滚动提示 | `@base-ui/react/scroll-area` 横向 |
| `ProcessChain` 节点 `title={event.tool}` | 原生浮层 | `@base-ui/react/tooltip` |
| `ProcessChain` 检查项 `title={check.detail}` | 原生浮层 | `tooltip` |
| `Sidebar` 的 `.trade-sidebar-scroll` | 裸 `overflow` | `scroll-area` 纵向 |
| `Sidebar` 的 `.decision-reason` / `.rationale` | 整段直出 | `@base-ui/react/collapsible` 截断 + 展开 |
| `TradeLedger` 每笔的理由段 | 整段直出 | `collapsible` |
| `AuditPanel` | `<details>` / `<summary>` | `collapsible` |

### 4.2 术语悬浮解释（决策 6 的唯一新增）

在 `SummaryPanel` 的 metrics 和各表的表头挂 `tooltip`，覆盖：平均净 R / case、Episode 胜率、交易胜率、方向命中、Profit Factor、参与 / 成交、MFE / MAE、持有 / 回撤、完成率、执行成本、NET R。

文案集中放在 `src/episode/glossary.ts` 导出的 `TERM_GLOSSARY` 常量表，与组件分离，便于统一改口径。文案遵循 TD-LANG-02：不留裸术语，缩写后面直接跟白话解释。

### 4.3 leaderboard 报表

| 位置 | 处理 |
|---|---|
| `FilterBar`（整个文件） | 删除。三组 pill 按钮不接状态、搜索框写死 `disabled`，留着比没有更糟 |
| `TopBar` 的 `<nav>` | 删除。只保留 brand 和 runId |
| `LeaderboardTable` 行选中、`ScatterPanel` 点选联动 | 逻辑保留，只重做样式 |
| `ScatterPanel` 散点 | 加 `tooltip` 显示该模型的分数明细 |
| `DetailCard` | 视觉重做 |

`LeaderboardReport.tsx` 相应移除 `FilterBar` 的引用与 `styles/topbar.css.ts` 中对应的 `.fbar` / `.nav` 规则。

## 5. 图表重绘

`useEpisodeChart.ts` 现在把浅色主题写死在 `createChart` 选项里。图表跑在 canvas 上读不到 CSS 变量，所以照 `apps/web/src/lib/theme.ts` 的做法，在包内建一份 JS 侧 token（`src/styles/chartTheme.ts`），值与 CSS token 保持一致。

| 项 | 现在 | 换成 |
|---|---|---|
| `layout.background` | `#ffffff` | `#141414` |
| `layout.textColor` | `#737373` | `#9a9a9a` |
| `grid.vertLines` / `horzLines` | `#f5f5f5` | `#1d1d1d` |
| `rightPriceScale.borderColor` | `#e5e5e5` | `#262626` |
| `timeScale.borderColor` | `#e5e5e5` | `#262626` |
| `panes.separatorColor` / `separatorHoverColor` | `#e5e5e5` / `#d4d4d4` | `#262626` / `#3a3a3a` |
| 蜡烛 `upColor` / `wickUpColor` | `#0e9f6e` | `#26a69a` |
| 蜡烛 `downColor` / `wickDownColor` | `#e02424` | `#ef5350` |
| EMA20 | `#f59e0b` | `#facc15` |

`chart/scene.ts` 的三条价格线同样换掉：成交 `#2563eb` → `textPrimary`，止损 `#dc2626` → `down`，止盈 `#059669` → `up`。这是本节唯一触碰 `scene.ts` 的地方，只改颜色常量，不动几何。

注意 `apps/web` 自身有个不一致：CSS `--accent` 是 `#ffb000`，JS `theme.accent` 是 `#facc15`。本次按原样各自沿用（CSS 侧用 `#ffb000`，图表侧用 `#facc15`），不去统一——那属于 app 的问题。

## 6. 密度分层

### 6.1 概览区（保持密）

覆盖 `Header`、`SummaryPanel` 的 metrics 与 config-strip、`ReasonTable`、`ModelTable`、`CasesTable`。

- 最小字号从 9px 抬到 `fsXs`（10px）。
- padding 统一到 4 的倍数。
- 所有数字加 `font-variant-numeric: tabular-nums`。
- `.compact-table` 补 hover 与选中态（暗色下现有的 `#fafafa` hover 完全失效）。
- metrics 六列从硬等分改为按内容自适应——现在 1440px 下每格很宽而内容很短。

### 6.2 详情区（放松）

覆盖 `ChartPanel` 工具条、`ProcessChain`、`Sidebar`（含 `TradeLedger`、`ActionsList`）。

- 决策链卡片正文 8px → 11px，卡片宽度放宽，外层套横向 `scroll-area`。
- `Sidebar` 的 `Facts`（`dl` / `dt` / `dd`）改成明确的两栏对齐，行距放开。
- `TradeLedger` 每笔从一团彩色文本改成三层结构：标题行（`T1 · 做多 · −1.605 R`）、mono 对齐的 E·S·T 事实行、可折叠的理由段。
- 侧栏四段（首次计划 / Episode 结果 / 交易明细 / 决策动作）之间加 sticky 小标题。

## 7. 验证

`cli report --run-id <id>` 会自动识别 run 目录下的 `episodes.jsonl` 并重出 episode 报表，所以可以拿 `packages/bench/results/` 里现存的 13 份 run 直接重新渲染，不消耗任何 API token。

流程：

```bash
pnpm --filter @kansoku/bench-report-ui build
pnpm --filter @kansoku/bench-report-ui test
pnpm --filter @kansoku/bench-report-ui typecheck
# 244KB，快速回路
pnpm --filter @kansoku/bench cli report --run-id run-20260721-55-a001-newschema --format html
# 12MB，压力样本
pnpm --filter @kansoku/bench cli report --run-id run-20260721-clean-baseline-blind --format html
```

leaderboard 报表没有现存样本可复用——`results/` 里 13 份全是 episode。验证走 `test/LeaderboardReport.test.tsx` 的 fixture 加一次手工渲染。

再把产出的 `report.html` 在浏览器里逐屏目视确认。

### 会红的测试

- `test/EpisodeReport.test.tsx` —— 用 `fireEvent` 直接操作原生 `<select>`，换成 base-ui Select 后要改成「点开 popup → 选中选项」。
- `test/LeaderboardReport.test.tsx` —— 凡断言到 `FilterBar` / `TopBar` nav 文本的用例删除。

### 不受影响

`test/distInline.test.ts`、`test/bundleRuntime.test.ts`（只验证产物自包含）、`test/ema.test.ts`、`test/scene.test.ts`（纯计算）。

## 8. 风险

- **体积**：base-ui 的 select / tooltip / scroll-area / collapsible / toggle-group / input 加上内置 floating-ui，预计给 `episode.js` 增加 50–90KB（未压缩，当前 382KB）。报表整体在 244KB–12MB 之间，图表数据占绝对大头，这个增量吃得下。若实测超出 120KB，回头收窄组件用量（优先砍 scroll-area，退回原生 `overflow`）。
- **浮层 portal**：base-ui 的浮层默认 portal 到 `document.body`。样式是 `globalStyle` 裸类名的全局表，portal 出去的内容照样命中，无需额外处理。
- **键盘手感**：原生 `<select>` 的「打字跳选项」由浏览器实现，换成 base-ui Select 后改由库实现，行为会有细微差异。
- **reset 合并**：见 3.4，episode 排版需逐屏目视确认。

## 9. 实施偏差（实现后回填）

设计里说错或没料到的四处，以实际实现为准：

1. **`packages/bench` 并非零改动**（推翻 3.1）。单文件 HTML 的外壳在 `packages/bench` 里，`<meta name="color-scheme" content="light"/>` 会让浏览器按浅色渲染滚动条和表单控件，必须改成 `dark`（episode 在 `src/episode/report.ts`，leaderboard 在 `src/report/renderHtml.ts` 里新增）。另外 K 线上的**计划线和成交标记颜色是 bench 烤进 payload 的**，不在 UI 包里，所以 `src/episode/chartPayload.ts` 的 5 处颜色也跟着换了。favicon 顺手从蓝色底白字改成琥珀底黑字。
2. **体积超预算**。`episode.js` 从 382KB 涨到 572KB，+190KB，超过设计里写的 50–90KB 预估和 120KB 回退阈值。拆解：leaderboard 只用了 Tooltip 就从 193KB 涨到 283KB，说明 **+90KB 是 base-ui 内置 floating-ui 的固定成本**，只要用到任何浮层就躲不掉；episode 在此之上再叠 select / toggle-group / scroll-area / collapsible / input 又多 100KB。砍 scroll-area 之类的单个组件收不回多少。gzip 后 episode.js 是 186KB。
3. **base-ui ScrollArea 的 Root 带行内 `position: relative`**，样式表里的 `position: absolute` 一律打不过。侧栏原本靠 `absolute; inset: 0` 把自己关进 grid 行高里，所以改成外层套一个绝对定位的 `.trade-sidebar-scroll` 包裹层，ScrollArea 自己 `height: 100%`。没有用 `!important`。
4. **修掉一个既有 bug**。`.tbl thead th` 是 `position: sticky; top: 53px`，但它外面的 `.tblwrap` 有 `overflow-x: auto`——这会让 sticky 的参照系变成 `.tblwrap` 而不是视口，于是表头在不滚动时就被往下推 53px，正好压住第一行数据。改成 `top: 0`。`.plotwrap` 的 `top` 也从 66px 调到 51px，因为顶栏删掉 nav 后只剩 41px 高。

## 10. 不在本次范围

表格排序、粘性表头、把假 FilterBar / TopBar nav 做成真功能、双主题切换、打印样式、抽共享 UI 包、修改 `apps/web`、改动 `src/types.ts` 视图契约。
