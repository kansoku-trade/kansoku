# Agent 自定义画布（Canvas）—— 设计

> 2026-08-28 · 新能力
>
> 参照物：Cursor 的 Canvas（Agent 现场写一份组件源码，旁边开一块实时画面，可以继续让它改同一份）
>
> 相关现状：`.claude/skills/chart/SKILL.md`（四种写死的图表类型）、`packages/core/src/charts/build.ts`、`apps/web/src/features/cockpit/chat/ChatDock.tsx`

## 1. 背景与问题

现在 AI 想「出个图」只有一条路：`POST /api/charts`，四种类型写死在 `ALL_TYPES`（`packages/core/src/charts/build.ts:15`）——`flow`、`cohort`、`sepa`、`intraday`。服务端把指标算完，冻结成一份 JSON，前端按 `type` 分发到对应的 React 组件。

这套东西在它覆盖的场景里很好用，问题是**它只覆盖那四件事**。想看「MU 的多周期结构旁边并排存储链净流对比，再加一段结论」这种一次性的东西，只有两个出口：

- 改 `build.ts` 加一种新类型 —— 每来一个新问法就要改一次代码、加一次前端组件、发一次版。
- 让 AI 在对话里贴 markdown 表格 —— 数字堆在气泡里，看不出结构。

真实需求是「各种各样的图表或面板，按当下的问题现场拼」。这件事的形状不是「再加一种类型」，而是**让 Agent 自己写渲染代码**，这也正是 Cursor Canvas 的做法。

## 2. 目标与非目标

**目标**

1. 在 App 的对话里说「画一张…／做一个面板…」，Agent 现场拼出一份独立产物，旁边打开，可以继续让它改同一份。
2. 产物是一份**具名、可改、可重开**的文件，不是一条会被对话流冲走的消息。
3. Agent 拼不出会崩的东西，也拼不出破坏 App 视觉语言的东西。
4. 三种对话载体（研究助手整页、驾驶舱追问浮窗、研究库 AI 侧面板）都能产出，呈现方式各自适配空间。

**非目标（本版明确不做，理由见 §8）**

- 常驻可拖拽工作台。
- 画布自己拉活行情。
- 把现有驾驶舱拆成积木让 Agent 重排。
- 在 Claude Code 里直接往仓库写画布文件。

## 3. 总体模型：画布是一份具名文件

一份画布 = 数据根下的一份 TSX 源码，文件名就是身份。

```
journal/canvases/<slug>.canvas.tsx
```

挂法与 `CHART_DATA_DIR` 一致：`packages/core/src/platform/env.ts` 新增 `CANVAS_DIR = join(PROJECT_ROOT, 'journal', 'canvases')`，桌面版照旧经 `TRADE_PROJECT_ROOT` 落到用户数据根。

规则：

- `slug` 为 kebab-case，同名再写即改同一份，不产生第二份。
- 文件里只有 TSX 源码。**不存编译产物**，每次打开重新编译。
- 列表靠扫目录（文件名 + mtime）。本版不建数据库索引，不写 sidecar JSON。
- 一份画布**不属于任何会话**。对话只是产出它的地方之一。

### 3.1 为什么不塞进 `/api/charts`

考虑过给 `ChartDoc` 加一个 `type: "canvas"` 复用现成的列表、链接和 deep link，结论是不划算：

现有图表是**服务端算完的冻结 JSON**，有 `schema_version` 迁移、有 `PATCH` 重建、有 SSE 60s 实时重算、有 `validatePrediction` 硬闸。画布是**可编辑的源码**，这几条一条都不适用。混进去等于在 `build.ts`、`charts.service.ts`、staleness 判断、SSE 广播里到处开 `if (type === 'canvas') return`。

两条独立的路更清楚：图表是「服务端算好的固定分析」，画布是「Agent 现场拼的一次性产物」。

## 4. Agent 侧：工具与静态检查

不给 bash 往磁盘扔文件的口子，走专用工具，形态跟 `analyst` 的 `write_journal`（`packages/core/src/ai/personas/analyst/tools.ts:53`）一致。

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `save_canvas` | `slug`、`title`、`source` | 写入或覆盖 |
| `read_canvas` | `slug` | 读出源码 + 上次的检查结果 |
| `list_canvases` | — | 列出已有画布（slug、title、mtime） |

改画布前必须先 `read_canvas`，避免凭记忆重写一遍把上次的东西写丢。

### 4.1 写入时的静态检查

`save_canvas` 在落盘前逐条查，不过就返回 `ok: false` + 逐条问题，让 Agent 自己改完重交（和 `submit_prediction` 的硬闸同一个套路）：

1. 必须有且只有一个 `export default` 组件。
2. `import` 只允许 `@kansoku/canvas` 一个来源。相对路径、裸包名、`node:` 前缀全部拒绝。
3. 源码里不得出现 `fetch(`、`XMLHttpRequest`、`import(`、`require(`、`setInterval`、`setTimeout`、`document.`、`window.`。
4. 源码体积上限（初值 64 KB），防止把整份 K 线数据往里灌到卡死编译。

### 4.2 报错回流 —— 这条是关键

Cursor 在每次画布编辑的工具结果里回一行 `Canvas TypeScript check`，Agent 交完立刻知道自己写崩了。照抄这个机制：

- 静态检查的问题在 `save_canvas` 返回值里逐条给出。
- 编译错误与首次渲染的运行时错误由前端经现有 IPC/HTTP 回写到画布的检查记录里。
- `read_canvas` 一并返回这份记录。

没有这一环，用户就得充当人肉报错转述器。

### 4.3 哪些载体挂这些工具

- **研究助手**（`packages/core/src/ai/assistant/assistantChat.ts`）—— 主入口。
- **驾驶舱追问**（`packages/core/src/ai/chat/chat.ts`）—— 挂上，方便「顺便画一张对比」。
- **研究库 AI**（`apps/web/src/features/research/researchAssistantPanel.pro.tsx`，pro 面）—— 挂上，机制与免费面完全一致。

工具本体和 SDK 都在 `packages/core` / 公共包里，属**开源核心**；pro 只是复用，不新增付费边界。

`analyst` / `commentator` 本版不加 —— 它们的产物是有硬校验的预测和点评，不该混入自由拼图。

### 4.4 新增产品 skill

`.claude/skills/canvas/SKILL.md`：什么时候该出画布、先用哪些工具取数再内嵌、组件怎么拼、常见反例。Agent 经 `read_skill` 加载，与现有 `chart` skill 同一套路。

## 5. SDK：`@kansoku/canvas`

Agent 只能从这一个包 import。原则是**积木自带取值和排版**，Agent 只给数据和标题——它拼不出难看的东西。

**布局与文字**：`Canvas`（根容器，管主题与滚动）、`Section`、`Grid`、`Row`、`Stack`、`Card`、`H1/H2/H3`、`Text`、`Pill`、`Divider`、`Callout`。

**分析图**（Recharts，`apps/web/src/features/cockpit/FlowTab.tsx` 已在用）：`LineChart`、`BarChart`（支持有符号正负分色）、`AreaChart`、`PieChart`、`Table`、`Stat`。数据一律 `{ x, y }` 或行数组；坐标轴、图例、单位由 props 声明。

**交易图**（Lightweight Charts）：一块 `CandleChart`，把现有驾驶舱的能力做成 props 而不是一堆新组件：

```tsx
<CandleChart
  bars={bars}                     // OHLCV
  volume                          // 成交量副窗
  macd                            // MACD 副窗
  ema={[9, 21, 55]}
  priceLines={[{ price: 61.1, label: '入场' }]}
  zones={[{ low: 60.9, high: 61.35, kind: 'resistance', label: '压力带' }]}
  markers={[{ time, price, bias: 'bearish', label: 'SB · H2' }]}
  sessions                        // 盘前/盘后底色
/>
```

底层复用 `apps/web/src/features/charts/intraday/` 下现成的 primitive（`orderZonePrimitive`、`sessionPrimitive`、`anchorPrimitive` 等），不重写。本版只支持单标的单周期一张图 —— 多周期就是 Agent 并排放三个 `CandleChart`。

**这是本版最重的一块**：现有能力和 `IntradayBuilt` 这个结构绑得很紧，散在 `useIntradayCharts.ts` 和一堆 primitive 里，要抽出一层干净的 props。抽不干净，后面 Agent 画交易图会到处踩坑。

### 5.1 指标不在前端算

MACD、EMA、背离、形态照旧由服务端算好。Agent 先用现有工具（`read_data_pack`、`fetch_kline`、bash 跑 `longbridge`）拿到数，再把数组写进 TSX。`CandleChart` 只画，不算。

这跟仓库现有分工一致（服务端算指标、前端 primitive 渲染），也让产物真的是**分析当时的快照**。

### 5.2 明确不给的东西

没有 `useEffect`、`fetch`、定时器、原生 `<canvas>` / `<script>`。交互只限 SDK 自带的（表格排序、`Toggle`/`Select` 切显示）。SDK 只导出 `useState` 和 `useMemo`。

想要活行情是下一版的白名单 hooks（`useQuote` 这类），不是现在留个逃生口。

## 6. 编译与沙箱

**编译**：不引打包器。用 sucrase（纯 JS、小、离线可用）把 JSX/TS 剥成普通 JS，再把那句 `import { ... } from '@kansoku/canvas'` 改写成从注入对象取值，整份代码包成函数执行。SDK 是**传进去的**，不是让它自己解析模块——它也就没法 import 到别的东西。

**沙箱**：画布跑在 iframe 里，不直接塞进页面。两个理由：画布样式不会漏到 App；画布死循环或崩溃只白掉这一块，不会带走驾驶舱。iframe 内装 React + SDK 的运行时，与外层经 `postMessage` 通信。桌面版走 `app://` 内部协议，不额外开端口。

**错误边界**：编译失败显示错误文本 + 「让 AI 修」按钮；运行时错误由 iframe 内的 error boundary 兜住并回传，进 §4.2 的检查记录。

## 7. UI 与呈现

### 7.1 视觉基调

完全继承 `apps/web/src/lib/theme.ts`：`bgCanvas #0a0a0a`、`bgSurface #141414`、`border #262626`、`accent #facc15`、`up #26a69a`、`down #ef5350`、数字用 `fontMono` 且 `tabular-nums`。

密度与现有驾驶舱同档：信息密但留呼吸。画布应当看着像产品的一部分，不像外挂。

每份画布顶部固定带标题 + 一行 caption（数据截止时间、来源、周期）。每张图必须有标题、带单位的轴标签、多序列时的图例 —— 这几条写进 skill 作为硬要求。

### 7.2 入口卡片（三种载体共用）

对话流里出现一张卡片：缩略图、标题、`slug · 更新时间`，底部三个动作「打开 / 新窗口 / 源码」。

改同一份画布时**卡片原地更新**，不在对话里堆第二张 —— 这是「一份可改的文件」这个模型的直接体现。

### 7.3 三种载体的呈现分档

产出统一，呈现按空间分档：

| 载体 | 空间 | 呈现 |
| --- | --- | --- |
| 研究助手 `/chat` | 整页最宽 | 左右分栏：对话 \| 画布，可拖宽窄（复用 `apps/web/src/ui/ResizablePanel.tsx`） |
| 驾驶舱追问浮窗 | 几百像素宽 | 先给卡片；点「打开」把浮窗提成 `full` 态并在内部分栏，Esc 退回浮窗，驾驶舱留在原处 |
| 研究库 AI 侧面板 | 窄且旁边占着文档 | 同上：卡片 → 提成全屏分栏 |

驾驶舱那条几乎不用新东西：`ChatDock` 已有 `dock` / `float` / `full` 三态和 Esc 退回（`ChatDock.tsx:31`、`:54-61`），`.chat-shell--full` 已经是覆盖 layout 的绝对定位（`styles.css:5104`）。接上分栏即可。

**新增载体不必再动画布那一套** —— 这是产出与呈现解耦的收益。

### 7.4 画布列表

**已取代。** 独立 `/canvases` 列表不做了。事后找回走研究库第三档，见 [research-library-canvas-design](./2026-08-28-research-library-canvas-design.md)。对话分栏（§7.3）仍是现场打开，两件事不互相替代。

## 8. 不做（YAGNI）

- **常驻可拖拽工作台** —— 先验证「现场拼一次性产物」这件事成不成立。
- **活行情 hooks** —— 快照产物先跑一版；真的需要再给 SDK 加白名单 hooks，这一步只动 SDK，不动存储。
- **把驾驶舱拆成积木** —— Agent 是「用积木重拼」，不是「把现有页面拆开重排」。
- **原生新窗口** —— 卡片上留「新窗口」按钮位，桌面版才显示，本版可不实现。
- **画布进现有图表列表 / deep link** —— 两条路各自独立（§3.1）。
- **分享、导出、多用户** —— 本地单用户 App，没有这个问题。
- **Claude Code 在仓库里直接写画布** —— 那是产品外的另一条路，与本设计无关。

## 9. 落地顺序

这份设计不小，按能独立验证的顺序切：

1. **存储 + 工具 + 静态检查**（§3、§4）—— 此时还没有渲染，用单测和文件系统验证。
2. **编译 + 沙箱 + 最小 SDK**（§6，SDK 只含布局、`Text`、`Stat`、`Table`）—— 第一次能在屏幕上看到画布。
3. **分析图**（`LineChart` / `BarChart` / `AreaChart` / `PieChart` / `Callout` / `Pill`）。
4. **`CandleChart`**（§5 最重的一块，单独一步）。
5. **三载体呈现 + 入口卡片 + 画布列表**（§7）。
6. **canvas skill**（§4.4）—— 前面都通了再写，否则会写一份和实现不符的说明书。

## 10. 验证

1. **静态检查** —— 单测覆盖 §4.1 每一条：缺 `export default`、import 越界、出现 `fetch`、超体积，各自返回可读的拒收理由。
2. **编译与注入** —— 单测：一份只用 SDK 的画布能编出可执行函数；import 别的东西编译前就被拦。
3. **报错回流** —— 单测：编译错误与运行时错误进得了检查记录，`read_canvas` 读得到。
4. **端到端** —— 在 `/chat` 里让 Agent 画一份含 `CandleChart` + `Table` + `Callout` 的画布，确认落盘、分栏打开、再让它改一次同一份 slug 后卡片原地更新。
5. **窄载体** —— 驾驶舱浮窗里产出画布，点「打开」提成全屏分栏，Esc 退回后驾驶舱状态未丢。
6. **免费版可用** —— 不装 `apps/pro` 的纯免费组合下，研究助手照样能产出画布。
