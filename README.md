# trade-skills

> 个人美股交易日志，外加一套自用的 Claude Code 行情研究技能（skill）和一个本地图表应用。

这是一个**交易日志仓库**，不是对外发布的软件产品。它做三件事：

1. **留下可查的记录**：所有札记都是纯 markdown，按日期放在 `journal/`，按个股放在 `stocks/`。没有数据库。
2. **提供一套调研工具**：`.claude/skills/` 下的自定义 skill 调用券商、政府、新闻接口，把零散数据拼成一份能落档的研究稿。
3. **本地渲染图表**：`app/`（Hono + React）在 `http://localhost:5199` 渲染全部图表——K 线、资金流、SEPA 仪表盘、短线多周期预测面板，指标全部服务端实算，并带实时行情推送。

公开仓库地址：[Innei/trade-skills](https://github.com/Innei/trade-skills)。`journal/` 与 `stocks/` 在 `.gitignore` 中，仅本地保留，不会推送。

> [!NOTE]
> 这套工具针对**美股**。技能内置的 cohort、宏观系列、新闻流都默认美股口径。

## 三层结构

仓库按层分工，每一层只做一件事。

### 第一层 · 数据源

| 来源 | 用什么调 | 覆盖范围 |
| --- | --- | --- |
| Longbridge 长桥 | 插件 `longbridge` CLI / `longbridge-*` skill | 实时报价、K 线、基本面、资金流、技术指标、新闻 |
| FRED | `fred` skill | 美国 / 全球宏观时间序列（CPI、GDP、联邦利率、收益率、M2、美元指数） |
| SEC EDGAR | `sec-edgar` skill | 10-K / 10-Q / 8-K / S-1 原文，Form 4 内部人交易 |
| GDELT 2.0 | `gdelt` skill | 全球多语种新闻流，含情绪打分 |
| Truth Social | `trump-truth-monitor` skill | Trump 帖子归档，按市场影响分级 |

四个自定义 skill 补的是 Longbridge 不覆盖的盲区——宏观、监管原文、世界新闻、政策口风。

### 第二层 · 编排工作流

这一层不引入新数据源，只把第一层的调用按规矩排好顺序：

- **`stock-deep-dive`**：第一次看一只新票时用。一次性跑业务、基本面、技术面、催化剂、上下游、自审六个角度。
- **`capital-rotation`**：盘后一次性扫指数 / 半导体 / 软件云 / 大科技几条赛道的资金净流入，定一个轮动叙事，写入 `journal/YYYY-MM-DD-flow.md`。
- **`market-session-tracker`**：盘前到收盘期间盯一份观察清单，识别突破、派发、回调档位，按时间戳更新判断。
- **`intraday-signal`**：单票短线钻取。5 分钟 / 15 分钟 / 1 小时三周期读 MACD 与波段结构（1 小时定趋势、15 分钟定入场、5 分钟做触发），产出带锚点的方向判断、三情景推演、双向打法和入场 / 止损 / 目标计划，最后渲染成预测面板。
- **`chart`**：通过 `app/` 的 API 出图（POST `/api/charts`），五种图型：flow / kline / cohort / sepa / intraday。服务端自己拉数据、算指标、自动标注（MACD 结构信号、14 种经典 K 线形态、背离 / 背驰、盘前盘后夜盘时段覆盖层）。

> [!TIP]
> 几个工作流互有重叠。**单票第一次研究**用 `stock-deep-dive`；**盘后看大盘资金去哪了**用 `capital-rotation`；**盘中实时盯盘**用 `market-session-tracker`；**单票短线找入场**用 `intraday-signal`；**只看一个维度**（比如只查个报价）就跳过工作流，直接调 `longbridge-*`。

### 第三层 · 落档

每个工作流最后都要写入 markdown，这一步不能省。

- `journal/YYYY-MM-DD-flow.md` —— 资金轮动快照
- `journal/YYYY-MM-DD-<theme>.md` —— 盯盘报告
- `journal/trump-feed/YYYY-MM-DD.md` —— Trump 帖子档案
- `stocks/{SYMBOL}.md` —— 个股六维笔记，**增量更新**，不重写
- `stocks/_chain-ai-stack.md` —— AI 资本支出产业链的跨股映射图

## 跑数据脚本

所有自定义 skill 都是 stdlib-only 的 Python 3（`/usr/bin/python3`），从仓库根目录调用。每个脚本都有 `--help` 和 `--smoke`（自检）。

```bash
# 自检某个数据源是否可达
python3 .claude/skills/<source>/scripts/<cmd>.py --smoke

# 真实调用示例
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --quiet
```

**输出统一约定**：成功打 `{"ok": true, "data": ..., "meta": ...}` 到 stdout、exit 0；失败打 `{"ok": false, "error": ..., "hint": ...}` 到 stdout、非零退出，详细日志走 stderr。

**通用参数**：`--help`、`--smoke`、`--verbose`；数据脚本另外支持 `--fresh`（绕过缓存）、`--json`。

**凭证管理**：`.claude/skills/_shared/env.py` 在 import 时自动读取仓库根的 `.env`（`FRED_API_KEY`、`SEC_USER_AGENT="Name <email>"`），不需要手动 `source`。`.env` 已 git-ignore。

**缓存与限流**：`.claude/skills/_shared/client.py` 在 `~/.cache/market-intel/` 下缓存，并按数据源自动节流——SEC 10 req/s、FRED 120 req/min、**GDELT ≥ 5 秒一次请求**。

## 图表应用

```bash
cd app && pnpm install && pnpm build   # 首次
cd app && pnpm start                   # http://localhost:5199
cd app && pnpm test                    # 金标测试（与原 Python 实现逐数对齐）
```

服务端自己调 longbridge CLI 拉数据并用 TypeScript 计算全部指标；图表数据以 JSON 落在 `journal/charts/data/`（gitignored），前端永远用最新代码渲染历史数据。页面打开期间有实时行情推送（10 秒报价流 + 60 秒图表重建，识别盘前 / 盘后 / 夜盘时段）。细节见 [`app/README.md`](./app/README.md)。

## 安装

```bash
git clone https://github.com/Innei/trade-skills.git ~/git/trade
cd ~/git/trade
pnpm install   # 会触发 prepare 钩子，自动恢复第三方 skill
```

`pnpm install` 会调 `skills experimental_install` 按 `skills-lock.json` 把第三方 skill 拉到 `.agents/`，并在 `.claude/skills/` 下建好符号链接。第三方 skill 不进仓库本体，避免重复占用。

要更新 skill 锁定版本：

```bash
pnpm skills:update
```

可选的环境变量放在仓库根的 `.env`：

```bash
FRED_API_KEY=...                  # FRED 免费申请
SEC_USER_AGENT="Your Name <you@example.com>"  # SEC EDGAR 要求带身份
```

## 仓库布局

```text
.
├── .claude/skills/        # 自定义 skill 源码（仅自有，第三方走符号链接）
│   ├── _shared/           # 公共 env / 缓存客户端
│   ├── capital-rotation/  # 资金轮动扫描
│   ├── chart/             # 图表应用的调用规范
│   ├── fred/              # FRED 宏观数据
│   ├── gdelt/             # 全球新闻流
│   ├── intraday-signal/   # 单票短线多周期钻取
│   ├── market-session-tracker/
│   ├── sec-edgar/         # SEC 文件
│   ├── stock-deep-dive/   # 单票六维研究
│   └── trump-truth-monitor/
├── .agents/               # pnpm 还原的第三方 skill（gitignored）
├── app/                   # 图表应用（server: Hono + TS / web: Vite + React）
├── docs/                  # 设计文档
├── journal/               # 每日札记（gitignored）
├── stocks/                # 个股笔记（gitignored）
├── CLAUDE.md              # 给 Claude Code 的项目说明
└── skills-lock.json       # 第三方 skill 版本锁
```

## 几条贯穿全局的纪律

这些都是反复踩过坑后写进 skill 里的硬性约束，独立调用脚本时也建议保留：

- **数字溯源**：业绩数据以新闻稿 / 8-K / 真实 OHLCV 为准。Longbridge 的社区帖、被截断的 `…` 标题，不能当作公司口径引用。
- **区分 GAAP 与 non-GAAP**：`longbridge financial-report --kind IS` 给的是 GAAP 稀释 EPS；卖方、一致预期用的是 non-GAAP。两者数字差距大时，多半是混了口径。
- **YoY 必带 QoQ**：基数抬高时 YoY 百分比会失真，必须同时看环比。
- **不模糊描述**：不写"市场分化 / 偏弱 / 偏强"，要用明确档位——派发 / 主力散户背离 / 全档抛压 / 主力吸筹 / 全档吸金；回调分 1 震荡 → 4 风险传染四档。
- **不附和方向**：用户说"突破 / 冲高 / 回调"时，必须重新拉报价，把现货高点与盘前高点对照后再回应。数据矛盾就直说。
- **只给情景，不给点位预测**：前瞻判断用 Bull / Base / Bear 三档，概率合计 100%，附触发条件，按时间戳修订。

## 已知数据坑

> [!WARNING]
> - **资金流单位不一致**：`capital-rotation` 把 `longbridge capital` 的输出当作**万美元**，盯盘模板默认推断为**千美元 / $k**。Longbridge 本身不标单位，记录时一定要把原始数字和你推断的单位都写下来，不要默默换算。
> - `.SOX.US` 在 Longbridge 上拉不到，用 `SMH` / `SOXX` ETF 代理。
> - 文件名日期是**美股交易日**，不是亚洲本地日期。同一天再跑会**追加**带时间戳的小节，不会覆盖。
> - GDELT 只滚动近期窗口，不是历史档案。Trump 的 RSS 镜像只露最近约 5 天（约 100 条），更早的帖子只有靠 `archive.py` 持续抓取才会留存。

## 致谢

第三方 skill 来自 [himself65/finance-skills](https://github.com/himself65/finance-skills) 与 [muxuuu/serenity-skill](https://github.com/muxuuu/serenity-skill)。具体清单见 [`skills-lock.json`](./skills-lock.json)。
