# 研究工作台：skill 工具链

Kansoku 应用之外，本仓库还是一个 Claude Code 研究工作台。应用负责「看」，skill 负责「查」，日志负责「记」。

> **权威纪律源头在 [`.claude/skills/trading-discipline/SKILL.md`](../.claude/skills/trading-discipline/SKILL.md)，本文仅为概览。** 领域 skill 只引用规则 ID，不复制规则正文——复制必然漂移。

## 三层分工

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
- **`trade-gate`**：买入/卖出/加仓/减仓前的决策关卡，打分判定并记录违规账单。
- **`company-valuation` / `earnings-preview` / `earnings-recap` / `estimate-analysis`**：估值三法并算、财报前瞻与复盘、预估修订趋势。
- **`sepa-strategy` / `stock-correlation` / `stock-liquidity` / `etf-premium` / `options-payoff`**：SEPA 方法、相关性配对、流动性评分、ETF 溢价分解、期权盈亏曲线。
- **`release`**：桌面版发版入口。

> [!TIP]
> 工作流之间互有重叠。**单票第一次研究**用 `stock-deep-dive`；**盘后看资金去哪了**用 `capital-rotation`；**盘中实时盯盘**用 `market-session-tracker`；**单票找入场**用 `intraday-signal`；**只看一个维度**（比如只查个报价）就直接调 `longbridge-*`。

### 第三层 · 落档

每个工作流最后都写入可审计的文件，这是研究结论的主记录（`journal/` 与 `stocks/` 均 gitignored，不进公开仓库）：

- `journal/YYYY-MM-DD-flow.md` —— 资金轮动快照
- `journal/YYYY-MM-DD-<theme>.md` —— 盯盘报告
- `stocks/{SYMBOL}.md` —— 个股六维笔记，增量更新
- `journal/charts/data/*.json` + `app.db` —— 图表快照与应用运行流水

## 脚本约定

自研 skill 是 stdlib-only 的 Python 3，从仓库根目录调用，统一输出协议与缓存限流（详见 `.claude/skills/_shared/`）：

```bash
python3 .claude/skills/<source>/scripts/<cmd>.py --smoke   # 连通性自检
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
```

- 成功输出 `{"ok": true, "data": ..., "meta": ...}`，失败输出 `{"ok": false, "error": ..., "hint": ...}` 且退出码非零。
- 每个脚本支持 `--help`、`--smoke`、`--verbose`；数据脚本另有 `--fresh`、`--json`。
- 缓存在 `~/.cache/market-intel/`，按来源自动限流（SEC 10 req/s、FRED 120 req/min、GDELT ≥ 5s）。

第三方 skill（估值、财报、期权、流动性方向）放在 `.agents/skills/`，由 [`skills-lock.json`](../skills-lock.json) 锁版本，`pnpm install` 自动还原。来自 [himself65/finance-skills](https://github.com/himself65/finance-skills) 与 [muxuuu/serenity-skill](https://github.com/muxuuu/serenity-skill)。

## 环境变量

放仓库根 `.env`（git-ignored），均为可选：

```bash
FRED_API_KEY=...                               # FRED 免费申请
SEC_USER_AGENT="Your Name <you@example.com>"   # SEC EDGAR 要求带身份
HITHINK_FINANCE_API_KEY=...                    # 同花顺金融数据服务（fuyao.aicubes.cn 签发）
```

AI 模型与 key 不走环境变量，在应用的设置页配置（加密存本地 SQLite）。

## 贯穿全局的纪律（概览）

这些是反复踩坑后写进 skill 的硬性约束，完整版见纪律源头文件：

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
