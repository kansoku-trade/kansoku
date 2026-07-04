# trade

> 个人美股交易日志，外加一套 Agent Skill（pi / Claude Code 通用）和一个本地图表应用。

这是**交易日志仓库**，不是对外发布的软件产品。它做三件事：

1. **留下可查的记录**：所有札记都是纯 markdown，按日期放在 `journal/`，按个股放在 `stocks/`，图表数据 JSON 放在 `journal/charts/data/`。没有数据库。
2. **提供一套调研工具**：`~agents/skills/` 和 `~claude/skills/` 下的 Skill 调用券商、政府、新闻接口，把零散数据拼成一份能落档的研究稿，同时从第三方 skill 生态引入估值、财报分析、期权、相关性分析等能力。
3. **本地渲染图表**：`app/`（Fastify + TypeScript 服务端内嵌 Vite middleware，React 前端）在 `http://localhost:5199` 渲染全部图表——K 线、资金流、SEPA 仪表盘、短线多周期预测面板，指标全部服务端实算，并带实时行情推送。

> [!NOTE]
> 这套工具针对**美股**。Skill 内置的 cohort、宏观系列、新闻流都默认美股口径。

## 三层结构

仓库按层分工，每一层只做一件事。

### 第一层 · 数据源（原始检索）

| 来源 | 接入方式 | 覆盖范围 |
|---|---|---|
| **Longbridge 长桥** | `longbridge ...` CLI / `longbridge-*` skill | 实时报价、K 线、基本面、资金流、技术指标、新闻 |
| **FRED** | `fred` skill（免费 API key） | 美国/全球宏观时间序列（CPI、GDP、联邦利率、收益率、M2、美元指数） |
| **SEC EDGAR** | `sec-edgar` skill（UA header） | 10-K/10-Q/8-K/S-1 原文，Form 4 内部人交易解析 |
| **GDELT 2.0** | `gdelt` skill（5 秒限流） | 全球多语种新闻流，含情绪打分 |
| **Trump Truth Social** | `trump-truth-monitor` skill（RSS 镜像） | Trump 帖子归档、分类与市场影响分级 |
| **Yahoo Finance** | `yfinance-data` + 衍生 skill | 估值数据、财报前瞻/复盘、分析师预期、链上 ETF 溢价、流动性指标 |

Longbridge 覆盖价格与基本面；自研的四个 custom skill 补的是盲区（宏观、监管原文、世界新闻、政策口风）；Yahoo Finance 衍生 skill 接管了估值和财报分析方向。

### 第二层 · 编排工作流（真正的价值）

这一层不引入新数据源，只把第一层的调用按规矩排好顺序，并执行一系列防错纪律：

- **`stock-deep-dive`**：第一次看一只新票时用。一次性跑业务/基本面/技术面/催化剂/上下游/自审六个维度。
- **`capital-rotation`**：盘后一次性扫指数/半导体/软件云/大科技/应用端几个固定 cohort 的资金净流入，定一个轮动叙事，写入 `journal/YYYY-MM-DD-flow.md`。
- **`market-session-tracker`**：盘前到收盘期间盯一份观察清单，识别突破、派发、回调档位，按时间戳更新判断。
- **`company-valuation`**：DCF + 相对估值（multiples）+ 分部估值（SOTP）三法并算，给出隐含股价区间和不含偏见的公允价值判断。
- **`earnings-preview` / `earnings-recap` / `estimate-analysis`**：财报前瞻（一致预期 vs 历史 beat/miss 记录）、日志（结果复盘）、预估分析（修订趋势与分布区间）。
- **`etf-premium`**：ETF 溢价/折价分解——哪些是 NAV 驱动、哪些是结构性的（伽马挤压、做市商对冲、AP 套利堵塞）。
- **`sepa-strategy`**：Mark Minervini SEPA 方法——趋势模板检查、VCP 收缩识别、杯柄/旗形/高紧旗形态、突破确认与仓位计算。
- **`stock-correlation`**：股票间相关性与配对分析（滚动相关系数、beta、同行对标、供应链联动）。
- **`stock-liquidity`**：流动性评分——买卖价差、ADTV、市场冲击估算、Amihud 非流动性指标。
- **`serenity-skill`**：供应链瓶颈挖掘法——从产业链卡点倒推投资机会，适合独立深度调研。
- **`options-payoff`**：交互式期权盈亏曲线——多腿组合的 P&L 可视化与盈亏平衡点分析。
- **更多**：`startup-analysis`（风投/求职/创始人三维评价）、`hormuz-strait`（霍尔木兹海峡实时状态）、`saas-valuation-compression`（SaaS 多轮估值压缩分析）、`yc-reader`、`twitter-reader` 等。

> [!TIP]
> 工作流之间互有重叠。**单票第一次研究**用 `stock-deep-dive`；**盘后看大盘资金去哪了**用 `capital-rotation`；**盘中实时盯盘**用 `market-session-tracker`；**单票找入场**用 `intraday-signal`；**看估值**用 `company-valuation`；**准备或回顾财报**用 `earnings-preview` / `earnings-recap`；**只看一个维度**（比如只查个报价）就跳过工作流，直接调 `longbridge-*`。

### 第三层 · 落档（步不能省）

每个工作流最后都要写入 markdown。

- `journal/YYYY-MM-DD-flow.md` —— 资金轮动快照
- `journal/YYYY-MM-DD-<theme>.md` —— 盯盘报告
- `journal/trump-feed/YYYY-MM-DD.md` —— Trump 帖子档案（`archive.py` 幂等追加）
- `stocks/{SYMBOL}.md` —— 个股六维笔记，**增量更新**，不重写
- `stocks/_chain-ai-stack.md` —— AI 资本支出产业链的跨股映射图
- `journal/charts/data/YYYY-MM-DD-<slug>.json` —— 图表数据快照，带 schema version

## 自定义 skill（自研）

项目自有 skill 放在 `.claude/skills/`：

```
.claude/skills/
├── _shared/                # 公共模块（env、缓存客户端、输出协议）
├── capital-rotation/       # 资金轮动扫描
├── chart/                  # 图表应用调用规范（skill 内用 POST /api/charts 出图）
├── fred/                   # FRED 宏观数据
├── gdelt/                  # 全球新闻流
├── intraday-signal/        # 单票短线多周期钻取
├── market-session-tracker/ # 盘中实时盯盘
├── sec-edgar/              # SEC 文件
├── stock-deep-dive/        # 单票六维研究
└── trump-truth-monitor/    # Truth Social 监控与归档
```

自研 skill 是 stdlib-only 的 Python 3（`/usr/bin/python3`），从仓库根目录调用：

```bash
# 自检某个数据源是否可达
python3 .claude/skills/<source>/scripts/<cmd>.py --smoke

# 通用参数：--help、--smoke、--verbose；数据脚本额外支持 --fresh、--json
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --quiet
```

共享约定（由 `_shared/` 统一执行）：
- **输出协议**：成功 → `{"ok": true, "data": ..., "meta": ...}` 到 stdout，exit 0；失败 → `{"ok": false, "error": ..., "hint": ...}`，非零退出，诊断信息走 stderr。
- **凭证**：`_shared/env.py` 在 import 时自动读仓库根 `.env`（`FRED_API_KEY`、`SEC_USER_AGENT`）。`.env` 已 git-ignore。
- **缓存与限流**：`_shared/client.py` 缓存在 `~/.cache/market-intel/`，按数据源自动节流（SEC 10 req/s、FRED 120 req/min、GDELT ≥ 5 秒一次）。

## 第三方 skill（即装即用）

借助 pi 的 skill 机制，项目还集成了一套涵盖估值、财报、期权、流动性、相关性的第三方 skill，放在 `.agents/skills/` 下，由 `skills-lock.json` 管理版本锁。`pnpm install` 自动还原。

来自 [himself65/finance-skills](https://github.com/himself65/finance-skills) 与 [muxuuu/serenity-skill](https://github.com/muxuuu/serenity-skill)，具体清单见 [`skills-lock.json`](./skills-lock.json)。

## 图表应用

```bash
cd app && pnpm install     # 首次
cd app && pnpm start       # http://localhost:5199
cd app && pnpm test        # 金标测试（与原 Python 实现逐数对齐）
```

单进程运行——server（Fastify + TypeScript）以内嵌 middleware 模式挂载 Vite dev server，前端源码直接热更新，无打包环节。服务端自己调 longbridge CLI 拉数据并用 TypeScript 计算全部指标（均线、MACD、RS、趋势模板、成交分布、14 种 K 线形态、背离检测、时段分类）；图表数据以 JSON 落在 `journal/charts/data/`（gitignored），前端永远用最新代码渲染历史数据，改组件不影响旧图。

**实时层**：页面打开期间走 SSE 推送——
- `GET /api/stream/quotes`：10 秒轮询行情（watchlist ∪ 持仓），自动识别盘前/盘后/隔夜时段；
- `GET /api/stream/charts/:id`：每 60 秒重建 flow / kline / intraday 图表数据并推送，不重置缩放。

详情见 [`app/README.md`](./app/README.md)。

## 安装

```bash
git clone https://github.com/Innei/trade.git ~/git/trade
cd ~/git/trade
pnpm install   # 会触发 prepare 钩子，自动还原第三方 skill
```

`pnpm install` 自动调 `skills experimental_install` 按 `skills-lock.json` 把第三方 skill 拉到 `.agents/`。第三方 skill 不进仓库本体。

要更新 skill 锁定版本：

```bash
pnpm skills:update
```

可选的环境变量放在仓库根的 `.env`：

```bash
FRED_API_KEY=...                           # FRED 免费申请
SEC_USER_AGENT="Your Name <you@example.com>"  # SEC EDGAR 要求带身份
```

## 仓库布局

```text
.
├── .agents/skills/         # 第三方 skill（pnpm 按 skills-lock.json 自动还原，gitignored）
├── .claude/skills/         # 自研 skill 源码
│   ├── _shared/            # 公共 env / 缓存客户端
│   ├── capital-rotation/   # 资金轮动扫描
│   ├── chart/              # 图表调用规范
│   ├── fred/               # FRED 宏观数据
│   ├── gdelt/              # 全球新闻流
│   ├── intraday-signal/    # 单票短线多周期
│   ├── market-session-tracker/
│   ├── sec-edgar/          # SEC 文件
│   ├── stock-deep-dive/    # 单票六维研究
│   └── trump-truth-monitor/
├── app/                    # 图表应用
│   ├── server/             # Fastify + TypeScript（指标实算 + API + SSE）
│   ├── web/                # Vite + React（渲染组件 + 实时数据订阅）
│   └── README.md
├── docs/                   # 设计文档
├── journal/                # 每日札记（gitignored）
├── stocks/                 # 个股笔记（gitignored）
├── CLAUDE.md               # 给 Claude Code 的项目说明（中文白话）
├── package.json            # pnpm workspace root
└── skills-lock.json        # 第三方 skill 版本锁
```

## 贯穿全局的纪律

这些都是反复踩过坑后写进 skill 里的硬性约束，独立调用脚本时也建议保留：

- **数字溯源**：业绩数据以新闻稿/8-K/真实 OHLCV 为准。Longbridge 的社区帖、被截断的 `…` 标题，不能当作公司口径引用。
- **区分 GAAP 与 non-GAAP**：`longbridge financial-report --kind IS` 给的是 GAAP 稀释 EPS；卖方、一致预期用的是 non-GAAP。两者数字差距大时，多半是混了口径。
- **YoY 必带 QoQ**：基数抬高时 YoY 百分比会失真，必须同时看环比。
- **不模糊描述**：不写"市场分化/偏弱/偏强"，要用明确档位——机构派发/主力散户背离/全档抛压/主力吸筹/全档吸金；回调分 1 震荡 → 4 风险传染四档。
- **不附和方向**：用户说"突破/冲高/回调"时，必须重新拉报价，把现货高点与盘前高点对照后再回应。数据矛盾就直说。
- **只给情景，不给点位预测**：前瞻判断用 Bull/Base/Bear 三档，概率合计 100%，附触发条件，按时间戳修订。

## 已知数据坑

> [!WARNING]
> - **资金流单位不一致**：`capital-rotation` 把 `longbridge capital` 的输出当作**万美元**，盯盘模板默认推断为**千美元/$k**。Longbridge 本身不标单位，记录时一定要把原始数字和你推断的单位都写下来，不要默默换算。
> - `.SOX.US` 在 Longbridge 上拉不到，用 `SMH`/`SOXX` ETF 代理。
> - 文件名日期是**美股交易日**，不是亚洲本地日期。同一天再跑会**追加**带时间戳的小节，不会覆盖。
> - GDELT 只滚动近期窗口，不是历史档案。Trump 的 RSS 镜像只露最近约 5 天（约 100 条），更早的帖子只有靠 `archive.py` 持续抓取才会留存。

## 致谢

第三方 skill 来自 [himself65/finance-skills](https://github.com/himself65/finance-skills) 与 [muxuuu/serenity-skill](https://github.com/muxuuu/serenity-skill)。具体清单见 [`skills-lock.json`](./skills-lock.json)。
