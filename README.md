<p align="center">
  <img src="./app/web/public/brand/kansoku-lockup.svg" alt="Kansoku" width="560">
</p>

# Kansoku

> 本地优先的看盘桌面应用（美股为主，港股 / A 股行情已接入）：实时行情、多周期 K 线、图表画线、研究库与 AI 助手——数据和 AI key 都留在你自己的机器上。

**Kansoku（観測）** 是一个 macOS 桌面应用，把「看盘 → 分析 → 研究 → 复盘」做成一条本地闭环：行情从你自己的长桥账户拉，指标全部本地实算，AI 点评用你自己配置的模型，研究结论落成本地 markdown 和 JSON。它背后还有一套 Claude Code skill 工具链，覆盖宏观、监管文件、新闻流和资金轮动——应用负责「看」，skill 负责「查」，日志负责「记」。

![Kansoku 个股驾驶舱](https://github.com/Innei/kansoku/releases/download/web-preview/app-cockpit.png)

## 下载安装

去 [Releases](https://github.com/Innei/kansoku/releases) 下载最新 `desktop-v*` 版本的 `Kansoku-x.y.z-arm64.dmg`（macOS · Apple Silicon），拖进「应用程序」即可。应用内置 Sparkle 自动更新（EdDSA 签名 + 增量包），装一次就不用再回来手动下载。

前置依赖：本机安装并登录 [longbridge CLI](https://open.longbridge.com/docs/cli/install)（行情和账户数据都走它）。应用当前没有付费开发者签名，首次打开需要右键 →「打开」，详见 [`app/desktop/README.md`](./app/desktop/README.md)。

首次启动有引导：连上长桥数据，再选一个 AI 接入方式（本机 codex 登录态 / LobeHub Cloud / 自带 API key），也可以先跳过。

<img src="https://github.com/Innei/kansoku/releases/download/web-preview/app-onboarding.png" alt="首次启动引导" width="100%">

## 能做什么

**个股驾驶舱** —— 一屏看完一只票：多周期 K 线（5m/15m/1h）打开时跟着行情实时刷新；叠加均线、MACD、形态标注和入场/止损/目标价位线。左侧画线工具支持趋势线、多段线、水平线、矩形、斐波那契，可改颜色/粗细/虚线/箭头；样式预设画之前先调好，之后每条线自动带上。右栏是财报与宏观事件日历、短线方向判断和 Bull/Base/Bear 三档情景推演（概率合计 100%，附触发条件），页签在预测、环境、消息、复盘和 AI 点评之间切换。AI 点评可按股票持续跟进：关掉图表后仍在后台巡检并通知。

**追着分析问下去** —— 每份分析都能就地追问「凭什么」。面板浮在图上，可拖走、可缩放、可全屏。AI 会先读你的画线再结合实时行情回答；让它标关键价位时会直接画到图上（紫色虚线，悬停看说明），工具条可一键只清 AI 画的线。查了什么数据全程留痕，点开就是工具调用详情；答歪了随时停止，半截回答不会丢；空面板会先替你想好三个最该问的问题。已归档的预测是冻结记录，追问只解释、不改写。

![追着分析问下去](https://github.com/Innei/kansoku/releases/download/web-preview/app-chat.png)

**研究库** —— 在应用里直接翻看和搜索仓库中的股票档案（`stocks/`）与研究日志（`journal/`），左侧列表、中间正文、右侧 AI 助手三栏布局，列表与正文分栏可拖动。文档内可对话提问；助手能提议改稿（采纳 / 拒绝 / 撤销），也能按信源刷新研究内容（制定计划 → 核查文档 → 检查市场 → 综合证据 → 生成提案），刷新结果、改稿提议、关联资料和历史记录都在同一条对话时间线里。

![研究库](https://github.com/Innei/kansoku/releases/download/web-preview/app-research.png)

**SEPA 策略仪表盘** —— Minervini 趋势模板 8 条逐项打钩，长期均线价值区、成交密集区、52 周高低距离、RS 相对强弱（vs SPY）、量能比一屏呈现，自动给出 Buy / Watch List / Avoid 结论。

![SEPA 策略仪表盘](https://github.com/Innei/kansoku/releases/download/web-preview/app-sepa.png)

**盘面与复盘** —— 盘中看板和历史复盘随时段自动切换：顶部是可点的交易日时间线，翻历史日期更直观。跟踪中标的的判断与结果（命中目标/止损/无法判定）、历史预测命中率（做多/做空/观望、AI 生成 vs 手动分析分开算）、当日资金流向图表和 AI 花费流水。看盘卡片上也能一键开关 AI 跟进、重新分析。

![盘面复盘](https://github.com/Innei/kansoku/releases/download/web-preview/app-home.png)

**AI 按用途分配模型** —— 盘中快评、升级分析、深度研究、追问四个用途各自选模型：跟随主模型、单独指定或停用。Provider 支持本机 codex 登录态（不额外收费）、LobeHub Cloud（登录即用）和自带 API key（openai / anthropic / google / deepseek），key 加密存本地 SQLite，不出你的机器。设置里还可切换「美东时间 / 本地时间」。

![设置页](https://github.com/Innei/kansoku/releases/download/web-preview/app-settings.png)

**桌面原生体验** —— 内嵌标题栏 + 应用内标签页（⌘T 新开、右键批量关闭）、⌘K 命令面板快速跳转到股票或页面、系统菜单、窗口状态记忆、实时行情推送（盘前/盘后/夜盘都覆盖）。有更新时标题栏右侧出现升级图标，点一下直接下载安装。

> [!NOTE]
> 这套工具以**美股**为主战场，从 2026-07 起开始扩展多市场：应用的行情图表（K 线、实时推送、SEPA、短线多周期）已支持**港股**（`700.HK`）和 **A 股**（`600519.SH` / `000001.SZ`），交易时段、午休断档、时区显示（美东/香港/北京时间）都按各自市场处理；数据仍走长桥同一账户。美股专属能力（财报日历、期权档位、SPY/QQQ 基准对比）在非美股代号上自动隐藏。skill 工具链侧由 `hithink-a-share`（同花顺官方 API）补上 A 股特色数据。内置的 cohort、宏观系列、新闻流仍默认美股口径。

## 架构

`app/` 是 pnpm workspace，内核与宿主分离：

```text
app/
├── packages/core/   # @kansoku/core 内核：调 longbridge CLI 拉数据，TypeScript 实算全部指标
├── server/          # 薄 HTTP 宿主（Tsuki 控制器 + WebSocket），浏览器模式用
├── desktop/         # Electron 壳：内嵌同一个内核，走类型化 IPC，Sparkle 自动更新
└── web/             # Vite + React 前端，按运行环境自动选 HTTP 或 IPC 传输
```

指标全部内核实算：均线、MACD、RS、趋势模板、成交分布、14 种 K 线形态、1-2-3 反转、背离/背驰、FVG 缺口、盘前/盘后时段覆盖层等。图表文档以 JSON 落在 `journal/charts/data/`（gitignored），前端永远用最新代码渲染历史数据。实时层是单条 WebSocket / IPC 通道，推送行情（自选 ∪ 持仓）和图表重算；已落盘的图表 JSON 保持为研判当时的快照。

```bash
cd app && pnpm install       # 首次
cd app && pnpm dev           # 浏览器模式：web + server，http://localhost:5199
cd app && pnpm dev:desktop   # 桌面模式：web + Electron，不起 server 进程
cd app && pnpm test          # 全 workspace 测试
cd app && pnpm typecheck     # 全 workspace 类型检查
```

## 发版流程

发版全链路自动化，人工只有两步——发起和合并：

```
/release（Claude Code skill，写更新说明 + 升版本 + 开 PR）
  → ci.yml 检查通过，合并 PR
  → desktop-tag.yml 自动打 desktop-vX.Y.Z 并调起构建
  → desktop-release.yml 构建、签名、生成 appcast，直接发布 Release
  → 已装用户收到应用内更新提示
```

- 更新说明写在 `app/desktop/CHANGELOG.md`，CI 提取对应版本段落作为 Release 正文；段落缺失会让发版直接失败。
- 日常 CI（`.github/workflows/ci.yml`）在改到 `app/**` 的 PR / push 上跑 typecheck + 全部测试。
- 手动兜底：直接推 `desktop-v*` tag，或在 Actions 页面 dispatch `desktop-release.yml`。

## 研究工作台：skill 工具链

应用之外，仓库还是一个 Claude Code 研究工作台，按三层分工：

### 第一层 · 数据源（原始检索）

| 来源 | 接入方式 | 覆盖范围 |
|---|---|---|
| **Longbridge 长桥** | `longbridge ...` CLI / `longbridge-*` skill | 实时报价、K 线、基本面、资金流、技术指标、新闻（美股 / 港股 / A 股） |
| **同花顺 HiThink** | `hithink-a-share` skill（官方 API key） | A 股特色数据：涨停池（带原因）、连板天梯、龙虎榜、异动、热榜、官方口径财报三表、交易日历 |
| **FRED** | `fred` skill（免费 API key） | 美国/全球宏观时间序列（CPI、GDP、联邦利率、收益率、M2、美元指数） |
| **SEC EDGAR** | `sec-edgar` skill（UA header） | 10-K/10-Q/8-K/S-1 原文，Form 4 内部人交易解析 |
| **GDELT 2.0** | `gdelt` skill（5 秒限流） | 全球多语种新闻流，含情绪打分 |
| **Trump Truth Social** | `trump-truth-monitor` skill（RSS 镜像） | Trump 帖子归档、分类与市场影响分级 |
| **Yahoo Finance** | `yfinance-data` + 衍生 skill | 估值数据、财报前瞻/复盘、分析师预期、ETF 溢价、流动性指标 |

### 第二层 · 编排工作流

这一层不引入新数据源，只把第一层的调用按规矩排好顺序，并执行防错纪律：

- **`stock-deep-dive`**：第一次看一只新票。一次性跑业务/基本面/技术面/催化剂/上下游/自审六个维度。
- **`capital-rotation`**：盘后扫指数/半导体/软件云/大科技几个固定 cohort 的资金净流入，定一个轮动叙事。
- **`market-session-tracker`**：盘前到收盘盯一份观察清单，识别突破、派发、回调档位，按时间戳更新判断。
- **`intraday-signal`**：单票短线多周期钻取，出入场判断。
- **`company-valuation` / `earnings-preview` / `earnings-recap` / `estimate-analysis`**：估值三法并算、财报前瞻与复盘、预估修订趋势。
- **`sepa-strategy` / `stock-correlation` / `stock-liquidity` / `etf-premium` / `options-payoff`**：SEPA 方法、相关性配对、流动性评分、ETF 溢价分解、期权盈亏曲线。
- **`release`**：桌面版发版入口（见上文发版流程）。

> [!TIP]
> 工作流之间互有重叠。**单票第一次研究**用 `stock-deep-dive`；**盘后看资金去哪了**用 `capital-rotation`；**盘中实时盯盘**用 `market-session-tracker`；**单票找入场**用 `intraday-signal`；**只看一个维度**（比如只查个报价）就直接调 `longbridge-*`。

### 第三层 · 落档

每个工作流最后都写入可审计的文件，这是研究结论的主记录（`journal/` 与 `stocks/` 均 gitignored，不进公开仓库）：

- `journal/YYYY-MM-DD-flow.md` —— 资金轮动快照
- `journal/YYYY-MM-DD-<theme>.md` —— 盯盘报告
- `stocks/{SYMBOL}.md` —— 个股六维笔记，增量更新
- `journal/charts/data/*.json` + `app.db` —— 图表快照与应用运行流水

自研 skill 是 stdlib-only 的 Python 3，从仓库根目录调用，统一输出协议与缓存限流（详见 `.claude/skills/_shared/`）：

```bash
python3 .claude/skills/<source>/scripts/<cmd>.py --smoke   # 连通性自检
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
```

第三方 skill（估值、财报、期权、流动性方向）放在 `.agents/skills/`，由 [`skills-lock.json`](./skills-lock.json) 锁版本，`pnpm install` 自动还原。来自 [himself65/finance-skills](https://github.com/himself65/finance-skills) 与 [muxuuu/serenity-skill](https://github.com/muxuuu/serenity-skill)。

## 仓库布局

```text
.
├── .agents/skills/         # 第三方 skill（按 skills-lock.json 自动还原，gitignored）
├── .claude/skills/         # 自研 skill：数据源 + 工作流 + release 发版入口
├── .github/workflows/      # ci / desktop-tag / desktop-release
├── app/                    # Kansoku 应用（core / server / desktop / web）
├── docs/                   # 设计文档
├── journal/                # 每日札记（gitignored）
├── stocks/                 # 个股笔记（gitignored）
├── CLAUDE.md               # 给 Claude Code 的项目说明
└── skills-lock.json        # 第三方 skill 版本锁
```

环境变量（可选，放仓库根 `.env`，git-ignored）：

```bash
FRED_API_KEY=...                               # FRED 免费申请
SEC_USER_AGENT="Your Name <you@example.com>"   # SEC EDGAR 要求带身份
HITHINK_FINANCE_API_KEY=...                    # 同花顺金融数据服务（fuyao.aicubes.cn 签发）
```

AI 模型与 key 不走环境变量，在应用的设置页配置（加密存本地 SQLite）。

## 贯穿全局的纪律

这些是反复踩坑后写进 skill 的硬性约束，独立调用脚本时也建议保留：

- **数字溯源**：业绩数据以新闻稿/8-K/真实 OHLCV 为准。社区帖、被截断的标题不能当公司口径引用。
- **区分 GAAP 与 non-GAAP**：长桥财报接口给的是 GAAP 稀释 EPS；卖方一致预期用 non-GAAP。数字差距大时多半是混了口径。
- **YoY 必带 QoQ**：基数抬高时 YoY 百分比会失真，必须同时看环比。
- **不模糊描述**：不写「市场分化/偏弱」，用明确档位——机构派发/主力散户背离/全档抛压/主力吸筹/全档吸金；回调分 1 震荡 → 4 风险传染四档。
- **不附和方向**：用户说「突破/冲高/回调」时，重新拉报价、对照盘前高点后再回应。数据矛盾就直说。
- **只给情景，不给点位预测**：前瞻判断用 Bull/Base/Bear 三档，概率合计 100%，附触发条件，按时间戳修订。

## 已知数据坑

> [!WARNING]
> - **资金流单位不一致**：长桥 `capital` 输出不标单位，不同模板推断口径不同（万美元 vs 千美元）。记录时把原始数字和推断单位都写下来，不要默默换算。
> - `.SOX.US` 在长桥上拉不到，用 `SMH`/`SOXX` ETF 代理。
> - 文件名日期是**美股交易日**，不是亚洲本地日期。同一天再跑会**追加**带时间戳的小节，不覆盖。
> - GDELT 只滚动近期窗口，不是历史档案。Trump 的 RSS 镜像只露最近约 5 天，更早的帖子靠 `archive.py` 持续抓取留存。
