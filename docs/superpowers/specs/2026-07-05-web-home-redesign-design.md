# Web 首页重设计

日期：2026-07-05
状态：已与用户逐段确认

## 背景与目标

现在 web 端首页（`#/`）只是图表归档列表，真正像首页的"盘中总览"（`#/overview`）藏在二级入口。用户的使用场景分时段：盘中要看盘（跟踪标的 + AI 提醒），盘后要复盘（结算 + 战绩 + AI 活动），找图表全天都有。

新首页要做到：

1. 按市场时段自动变形：盘中看盘优先，盘后复盘优先
2. 承载持仓与账户盈亏（次要位置）
3. 快速入口：标的直达搜索、关注捷径、AI 重新分析、最近看过的图表
4. 图表归档入口常驻
5. 宽屏两栏布局，窄窗口退化为单列

## 路由变化

| 路由                            | 变化                        |
| ------------------------------- | --------------------------- |
| `#/`                            | 新的 `Home.tsx`             |
| `#/charts`                      | 现在的 ChartList 原样迁移   |
| `#/overview`                    | 页面删除，路由重定向到 `#/` |
| `#/symbol/:sym`、`#/charts/:id` | 不动                        |

## 前端结构

`Home.tsx` 只负责拼装与排序，板块组件放 `apps/web/src/pages/home/`：

- `QuickBar` — 快速入口条
- `WatchBoard` — 看盘区（原 Overview 标的卡片 + reassess 按钮）
- `PositionsCard` — 持仓区
- `RecapBoard` — 复盘区（今日结算 + 历史战绩 + AI 活动）
- `TodayCharts` — 今日图表横排

### 时段驱动排序

服务器 `GET /api/overview` 返回体新增 `session` 字段（`pre` / `regular` / `post` / `closed`，复用 session.ts 的判定）。前端据此排板块：

- **盘前/盘中**（pre + regular）：QuickBar → 主栏 WatchBoard + TodayCharts，侧栏 PositionsCard + RecapBoard（折叠）
- **盘后/休市**（post + closed）：QuickBar → 主栏 RecapBoard（展开），侧栏 WatchBoard（定格小条）+ PositionsCard + TodayCharts

QuoteBar 报价条与 QuickBar 永远横贯顶部。

### 宽屏布局

- 首页容器上限约 1400px 居中，不用现有 `.page` 窄栏样式
- 主栏约 2/3、侧栏约 1/3；宽屏下 WatchBoard 卡片一行两三张自动换行
- 窗口宽度不足时（media query）退化为单列。单列顺序：盘前/盘中为 WatchBoard → PositionsCard → TodayCharts → RecapBoard（折叠）；盘后/休市为 RecapBoard → WatchBoard（定格）→ PositionsCard → TodayCharts

## 服务器接口

### 新增

**`GET /api/positions`**
调 longbridge 拿持仓与账户余额。返回：每只持仓的代码、数量、成本、现价、浮动盈亏（金额 + 百分比）；账户整体（总市值、今日盈亏、总盈亏、可用现金）。服务器端缓存 30 秒。longbridge 调用失败返回明确错误，前端板块显示"持仓拉取失败"。

**`GET /api/overview/recap`**
今日复盘数据：

- 今日结算：今天有 intraday 分析的每个标的的最终涨跌 %、预测方向、结局（打到目标 / 打到止损 / 未了结），复用现有 outcome 判定逻辑（outcomeCache）
- AI 活动：今天 alert 级评论列表（时间 + 标的 + 内容）+ 当日花费汇总（复用 usage 数据）

### 复用不改

- `GET /api/overview` — 仅加 `session` 字段
- `GET /api/overview/stats` — 历史战绩
- `GET /api/charts` — 今日图表由前端按日期过滤
- reassess 接口（已存在，cockpit 在用）— WatchBoard 卡片按钮直接调用

### 不走服务器

- 最近看过的图表：前端 localStorage 记最近 5 张，打开图表详情页时写入
- 关注捷径：`/api/overview` 标的行 + 持仓列表合并去重，不需手动配置

## 各板块细节

**QuickBar**：搜索框敲代码回车直达 `#/symbol/XXX`（自动补 `.US`）；关注捷径小按钮一排；"最近看过"下拉（localStorage 最近 5 张图）；常驻"全部图表 →"链接去 `#/charts`。

**WatchBoard**：原 Overview 卡片原样迁移（方向徽章、止损/目标距离、最新 AI 评论、过期红点、未读数），每张卡加"重新分析"按钮调 reassess，点击后按钮转圈、完成后卡片刷新。30 秒自动刷新。盘后形态收缩为定格小条（代码 + 方向 + 最终涨跌）。

**PositionsCard**：顶部一行账户整体（今日盈亏、总盈亏、总市值、可用现金），下面每只持仓一行（代码、数量、成本 → 现价、浮盈红绿）。60 秒刷新。持仓标的若也在 WatchBoard 里，行首加小圆点表示"分析中"。

**RecapBoard**：三小节 — ① 今日结算表（标的、方向、最终涨跌、结局徽章）；② 历史战绩（现有 StatsBlock 迁移）；③ AI 活动（alert 时间线 + 当日花费一行）。盘中折叠为一行标题可点开，盘后自动展开进主栏。

**TodayCharts**：今天生成的图表横排小卡（类型徽章 + 标题），点击进详情；无则整块不显示。

## 错误与空态

每个板块独立拉数据、独立报错，一个板块失败不影响其他板块。空态文案沿用现有风格（如"今天还没有 intraday 分析"）。

## 测试

- `/api/positions`：单测，mock longbridge
- `/api/overview/recap`：单测，用现有测试的 store fixture 方式
- `session` 字段：在现有 overview 测试里补断言
- 前端沿用现状（无组件测试，手动验证）
