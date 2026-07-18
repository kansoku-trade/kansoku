# Web 端设计规范（Design System）— 终端风

日期：2026-07-05
状态：已确认（mockup 已过目）
范围：`apps/web/`（Vite + React 前端）

## 背景与问题

现有 `apps/web/src/styles.css`（554 行）演化出严重的样式发散：

- 28 种十六进制颜色，其中灰色 7~8 种（`#949494 / #888 / #777 / #b1b1b1 / #666 / #444 / #ddd`）
- CSS 变量全文件仅 5 处，等于没有 token 层
- 字号 8px~26px 共 12 档，无阶梯
- 同一概念反复发明：卡片 6 种写法、badge 7 种、按钮/chip 4 种、状态圆点 4 种
- 10+ 组件里散落内联 `style={{…}}` 绕过样式表

## 调性决策（已确认）

| 决策点   | 结论                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 视觉调性 | 终端/彭博风：高密度、信息优先、几乎无圆角、无阴影                          |
| 字体策略 | 数字等宽（`tabular-nums`），标签与中文正文用系统字体                       |
| 强调色   | 琥珀 `#ffb000`（彭博终端色），与警示色合并；取消蓝 `#58a6ff`、紫 `#ba68c8` |
| 落地范围 | 全量迁移：token + 组件收敛 + 清理内联 style，一次到位                      |

全站只允许 5 个色相：黑 / 灰 / 绿 / 红 / 琥珀。

## Token 体系

全部定义在 `styles.css` 顶部 `:root`。**此后所有 CSS 只准引用变量，不准写裸色值**（唯一例外：TradingView Lightweight Charts 的 JS 配色选项，无法用 CSS 变量，需从共享常量取值）。

### 背景 — 按界面层级命名

```css
--bg-canvas: #0a0a0a; /* 页面最底层，只有 body 用 */
--bg-surface: #141414; /* 浮在 canvas 上的容器：卡片、面板、侧栏、topbar */
--bg-element: #1e1e1e; /* surface 内的交互件默认态：输入框、按钮、badge 底 */
--bg-hover: #262626; /* 任何可交互元素的 hover 态 */
```

使用规则：**页面 → 容器 → 控件 → hover，一层比一层浅一档，跳层即错。**

### 边框

```css
--border: #262626; /* 默认：分隔线、卡片描边 */
--border-strong: #3a3a3a; /* 更清楚的轮廓：输入框、激活控件 */
```

### 文字 — 按信息优先级命名

```css
--text-primary: #e8e8e8; /* 正文、数据本体 */
--text-secondary: #9a9a9a; /* 标签、meta、说明 */
--text-muted: #5c5c5c; /* 占位符、禁用、失效 */
```

### 功能色 — 按语义命名

```css
--accent: #ffb000; /* 交互与强调：链接、选中、活跃 tab、focus、警示，全部归它 */
--up: #26a69a; /* 涨、多头、成功 */
--down: #ef5350; /* 跌、空头、错误（红兼任错误色，不再有独立 error 红） */
```

### 字体

```css
--font-ui: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
--font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
```

所有数字（价格、百分比、时间、日期、金额）必须用 `--font-mono` + `font-variant-numeric: tabular-nums`，收口为一个 `.num` 工具类。

### 字号 — 12 档收敛为 6 档

```css
--fs-xs: 10px; /* 极小角标 */
--fs-sm: 11px; /* badge、面板标题、meta */
--fs-base: 12px; /* 正文默认 */
--fs-md: 13px; /* 列表主文字 */
--fs-lg: 15px; /* 卡片头部 symbol */
--fs-xl: 20px; /* 页面 h1 */
```

8px、9px 淘汰；17/22/26px 归入 20px 档。

### 间距 / 圆角 / 阴影

- 间距：4px 基数阶梯 `4 / 8 / 12 / 16 / 24 / 32`
- 圆角：全站唯一 `--radius: 2px`。现有 6/8/10/14px 圆角与胶囊形全部压平
- 阴影：**全站禁用**，唯一例外是浮层 tooltip。层次全靠边框 + 背景深浅

## 组件体系

基础组件类负责外观，业务类只负责布局（grid 列宽等）。

### `.card`

容器统一形态：`--bg-surface` 底 + `--border` 描边 + `--radius` + 12px 内边距。
可点击卡片加 `.card--link`：hover 时底色升 `--bg-hover`、边框升 `--border-strong`。
替换现有 6 种卡片：`overview-card` / `chart-card` / `positions-card` / `watch-strip-item` / `recap-settle-row` / `today-chart-chip`。

### `.badge`

唯一 badge：11px 等宽、大写、`letter-spacing: 0.05em`、`--radius`、`--bg-element` 底灰字。
修饰符仅 4 个：

- `.badge--up`（绿字）
- `.badge--down`（红字）
- `.badge--accent`（琥珀字）
- `.badge--solid`（红底黑字，最高警报专用）

**图表类型（sepa / intraday / flow / cohort）不再一类一色**，全部灰 badge 靠文字区分。颜色只表达涨跌/警示，不表达分类。
替换现有 7 种：`badge` / `dir-badge` / `outcome-badge` / `news-badge` / `ai-lv` / `session-tag` / `qc-session`。

### `.btn` / `.chip`

按钮一种：`--bg-element` 底 + `--border-strong` 边框，hover 边框变琥珀。
`.chip` 为小号变体（筛选、快捷入口），`.chip.active` 琥珀字 + 琥珀边框。
加载/完成/失败状态用修饰符（`.btn--busy` / `.btn--done` / `.btn--failed`）统一表达。
替换现有 4 种：`ai-btn` / `reassess-btn` / `filter-chip` / `quickbar-chip`。

### `.input`

输入框/下拉统一：`--bg-element` 底 + `--border-strong` 边框，focus 时边框琥珀。

### `.dot`

状态圆点一种（7px 圆），颜色靠修饰符（`--accent` / `--up` / `--down`），脉冲动画统一。
替换现有 4 种：`degraded-dot` / `stale-dot` / `watch-dot` / `ai-badge .dot`。

### `.section-title`

终端风标志元素：11px 大写 + `letter-spacing: 0.08em` + `--text-secondary`。
用于所有面板标题与图表角标（现 `chart-label` 并入）。

## UI Kit（React 基础组件层）

位置 `apps/web/src/ui/`，一件一文件，统一从 `ui/index.ts` 出口。全部是薄壳：外观由 CSS 基础类承载，组件只把 props 翻译成 class，零业务逻辑、零数据请求。

| 组件               | API                                                      | 对应 CSS 类 / 替代对象                        |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| `Card`             | `link?: boolean`，link 时渲染 `<a>`                      | `.card` / `.card--link`                       |
| `Badge`            | `tone?: 'up' \| 'down' \| 'accent' \| 'solid'`           | `.badge` 及修饰符                             |
| `Button`           | `accent?: boolean; state?: 'busy' \| 'done' \| 'failed'` | `.btn`；替代 `ai-btn` / `reassess-btn`        |
| `Chip`             | `active?: boolean`                                       | `.chip`；替代 `filter-chip` / `quickbar-chip` |
| `Input` / `Select` | 原生属性透传                                             | `.input`                                      |
| `Dot`              | `tone?: 'accent' \| 'up' \| 'down'; pulse?: boolean`     | `.dot`；替代 4 种圆点                         |
| `SectionTitle`     | children                                                 | `.section-title`                              |
| `Num`              | `value: number; diff?: boolean`                          | `.num`；diff 模式按正负着色并带 +/- 号        |
| `Spinner`          | —                                                        | 替代 `ai-spin`                                |
| `Empty`            | children                                                 | 替代 `.empty`                                 |
| `ErrorBox`         | children                                                 | 替代 `.error-box`                             |

硬规则：

- **业务组件不准直接写 `.card` / `.badge` 等基础类名**，必须经 UI Kit 使用——样式变更只动一层
- 所有组件透传 `className` 与原生属性；布局微调在外层包元素解决，不往 Kit 加布局 props
- `Num` 收口全站涨跌数字：着色、正负号、`tabular-nums` 全部归它，消灭手写 `className={pct >= 0 ? 'up' : 'down'}`
- 不新增"以后可能用得上"的组件，清单以现有界面形态为准

## 图标

- 图标库：`lucide-react`，全站唯一图标来源
- 不再用 ASCII/Unicode 字符当图标（`→` `←` `▲` `▼` 等一律换成对应 lucide 图标）；纯数据符号（正负号、百分号）不算图标，保留
- 尺寸对齐字号：行内图标 12–14px，与相邻文字基线对齐（`vertical-align` 或 flex 对齐）；`stroke-width` 统一 2
- 颜色一律 `currentColor` 继承文字色，不单独给图标上色

## 交互约定

- 链接默认 `--text-primary` 或 `--text-secondary`，hover 变琥珀；不用下划线做默认态
- `:focus-visible` 统一琥珀描边
- 动画只保留脉冲（状态点）与 spinner，全部尊重 `prefers-reduced-motion`
- hover 反馈两种且只有两种：背景升一档（面/行），或边框/文字变琥珀（控件/链接）

## 图表专项约定

- K 线图不画网格线（grid 全透明），层次靠时段底色与价格线表达
- 盘前/盘后/夜盘的时段背景只用中性灰阶（淡灰白纱 / 更暗一档），禁止黄色系大面积铺底——琥珀只做强调，不做底色

## 迁移方案（全量，一次到位）

1. `styles.css` 顶部写入 `:root` token 块与基础组件类（`.card` / `.badge` / `.btn` / `.chip` / `.input` / `.dot` / `.section-title` / `.num`）
2. 建 `apps/web/src/ui/` UI Kit（上表 11 件 + `index.ts`）
3. 业务组件换装：逐页把旧类名与手写元素替换为 UI Kit 组件；同时清理内联 `style={{…}}`（10+ 文件，含 `charts/intraday/*`、`charts/sepa/*`、`pages/cockpit/*`、`pages/home/*`）——外观类内联样式改为 class，纯布局微调（如动态宽度百分比）可保留
4. 逐段重写 `styles.css` 剩余部分：裸色值 → 变量；6 种卡片、7 种 badge、4 种按钮、4 种圆点的旧类删除；业务类仅保留布局属性
5. TradingView / Recharts 图表的 JS 配色抽成共享常量模块（如 `web/src/theme.ts`），与 CSS token 数值保持一致：涨跌色、网格线、文字色、琥珀强调
6. 蓝 `#58a6ff` 全部替换：链接/hover/focus/激活态 → 琥珀；紫 `#ba68c8` badge → 灰；独立错误红 `#f85149` → `--down`
7. 验收：`grep -E '#[0-9a-fA-F]{3,8}'` 在 `styles.css` 中除 `:root` 块外为零命中；`grep -rE 'className="[^"]*\b(card|badge|btn|chip)\b'` 在 `pages/` `charts/` 下无直接使用基础类的业务代码；浏览器过一遍 Home / ChartList / ChartDetail / SymbolCockpit 四个页面

## 不做的事

- 不引入 Tailwind / CSS-in-JS / 组件库，维持单 `styles.css` + 原生 CSS 变量
- 不做浅色主题
- 不改任何业务逻辑、路由、数据流；本次纯样式层
