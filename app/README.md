# 图表应用（app/）

本地图表应用，取代了原来嵌在 Python 字符串里的 HTML 模板渲染。pnpm workspace，三个包：

- `shared/` — 跨包类型定义（`ChartDoc` / `IntradayBuilt` / `SepaBuilt` / `CockpitFlow` / 等）与时间工具函数，server 和 web 共同引用。
- `server/` — Fastify + TypeScript。调 longbridge CLI 拉数据、算指标、提供 REST API 和 SSE 实时流，并以 middleware mode 内嵌 Vite dev server 直接托管前端源码（无打包环节）。
- `web/` — Vite + React + TypeScript。五种渲染组件 + 个股仪表盘。

## 启动

```bash
pnpm install        # 首次（从 workspace root）
pnpm start          # http://localhost:5199
```

单进程：server 内嵌 Vite dev server，前端改动即时热更新，不需要 build。改 server 代码用 `pnpm dev`（tsx watch，后端文件变了自动重启，Vite 随进程一起重启）。

## 页面路由

| 路由 | 功能 |
|---|---|
| `#/` | 图表列表页 —— 按类型过滤、按日期搜索、查看元数据与 stale 状态 |
| `#/overview` | 盘中总览 —— 今天所有 intraday 标的一页看完（方向、现价、离止损/目标距离、最新点评、警报数），下方带预测战绩统计和当日 AI 花费 |
| `#/charts/:id` | 单图详情页 —— 根据 `type`（flow / cohort / sepa / intraday）加载对应渲染组件，右侧显示侧边栏（技术指标、新闻、持仓、context） |
| `#/symbol/:sym` | 个股仪表盘（Cockpit）—— 四个标签页：环境对照、资金流、实时持仓、历史分析 |

## REST API

### 图表 CRUD

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/charts` | 列举图表。支持参数 `?type=sepa` / `?symbol=NVDA.US` / `?limit=20` / `?stale=true` |
| `POST` | `/api/charts` | 创建图表。body: `{type, symbol, ...}` → 返回 `{id, url, type, title, technicals?}` |
| `GET` | `/api/charts/:id` | 加载单份图表完整文档 |
| `PATCH` | `/api/charts/:id` | 更新图表。prediction 字段用 `{prediction: {...}}` 补充，`{refresh: true}` 触发数据重拉 |
| `DELETE` | `/api/charts/:id` | 删除图表 |
| `GET` | `/api/charts/:id/built` | 以更大 `?count=` 重新拉历史 K 线并重算指标（仅 intraday），不改落盘文档 |

### 个股数据

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/symbols/:sym/flow` | 当日资金流曲线（累计净流入） + 大/中/小单分布 |
| `GET` | `/api/symbols/:sym/latest` | 最新的 intraday 分析文档 + 持仓对照 + 目标/止损距离 |
| `GET` | `/api/symbols/:sym/positions` | 长桥实时持仓快照 |
| `GET` | `/api/symbols/:sym/analysis` | 历史 intraday 分析列表 + 结果追踪（到目标/到止损/进行中） |
| `GET` | `/api/symbols/:sym/relvol` | 相对量能：今天到此刻的累计成交量 ÷ 前 5 个交易日同时段均值（只算正常盘 15 分钟 K，避开日 K 含盘前盘后的坑） |

### 总览与统计

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/overview` | 今日盘中看板：每个今天有 intraday 分析的标的一行（方向、现价、离止损/目标百分比、最新点评、警报数、预测是否过期） |
| `GET` | `/api/overview/stats` | 全部历史预测的战绩汇总：总命中率、做多/做空分开、AI 生成 vs 手动分析分开（AI 落的图带 `origin: "analyst"` 标记） |
| `GET` | `/api/overview/usage` | 当日 AI 花费汇总（`?date=YYYY-MM-DD` 可查历史），按点评员/分析员分层 |

### 实时流（SSE）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/stream/quotes?extra=SYM1,SYM2` | 行情快照流。标的 = 长桥 watchlist ∪ 持仓 ∪ extra 参数，10 秒一轮，自动识别盘前/盘后/隔夜时段 |
| `GET` | `/api/stream/charts/:id?count=N` | 图表数据流。flow / intraday 图被打开时每 60 秒重拉数据、重算指标、推新数据（sepa 是收盘级研判工具，不参与实时）。数据指纹去重，连续 5 次失败退避到 5 分钟并亮黄点 |

**SSE 协议**：`event: message` + `data: {ok: true, data: {...}}`；每 15 秒 `event: ping` 保活。前端收到后原地更新，不重置缩放。

## 图表类型

四种，统一走 `POST /api/charts` 创建：

| type | 渲染库 | 内容 |
|---|---|---|
| `flow` | Recharts | 单标的资金流累计曲线（日内逐 tick 净流入） |
| `cohort` | Recharts | 跨标的 signed-bar 对比（各标的净流入/流出） |
| `sepa` | TradingView Lightweight Charts | SEPA 策略仪表盘——52 周高低、三均线（50/150/200）、RS 曲线（21/63/126 天）、成交分布、支撑/阻力区、入场计划，附带侧边栏：趋势模板 8 条检查、阶段判断、持仓对照、相关新闻 |
| `intraday` | TradingView Lightweight Charts | 短线多周期预测面板——5 分钟 / 15 分钟 / 1 小时三周期 K 线 + MACD + 均线，附带侧边栏：技术指标摘要（含结构信号）、入场计划、三情景推演、新闻、市场 context |

## 个体仪表盘（Cockpit）

访问 `http://localhost:5199/#/symbol/NVDA.US` 进入个股追踪面板，四个标签页：

- **环境（Environment）**：多头寸 vs SMH / QQQ 基准的归一化走势对照，持仓快照（成本、盈亏、目标/止损距离）
- **资金流（Flow）**：日内资金流曲线 + 大/中/小单分布柱状图，实时刷新
- **持仓（Position）**：从长桥拉取的该标的实时头寸详情
- **历史分析（History）**：过往 intraday 分析的完整列表，每条显示创建时间、方向判断（多/空/中性）、锚点价、结果追踪（✅ 到目标 / ⛔ 到止损 / ⏳ 进行中）和累计盈亏百分比，点击可回看对应图表

## intraday 面板的自动标注

不依赖 `prediction`，每次渲染都由 server 自动检测并画上（tooltip 带含义解释）：

- **MACD 结构信号**：每个 DIF/DEA 交叉按零轴位置分类（零上/零下金叉、零上/零下死叉），识别结构组合——二次金叉（零下双金叉且低点抬高 = 底部确认）、空中加油（零上二次金叉 = 强势延续）、二次死叉、DIF 上穿/下穿零轴（最新 1-2 根标 `?` 待确认）、零轴缠绕检测（震荡市警示）。
- **1-2-3 形态**：看涨/看跌 1-2-3 反转形态检测，区分 forming / confirmed 状态、止损位与突破触发价。
- **背离与背驰**：顶/底背离（价格 vs MACD 动能）和顶/底背驰（推动力衰减），均以带时间戳的线段在主图与 MACD 图之间交叉标注。
- **14 种经典 K 线形态**：单根（锤子线/上吊线/倒锤子/射击之星）、双根（看涨/看跌吞没、乌云盖顶、刺透、看涨/看跌孕线）、三根（启明星/黄昏星/红三兵/三只乌鸦）。带趋势背景过滤和实体大小过滤，同一根只标最强的一个。
- **时段覆盖层**：盘前/盘后浅蓝、夜盘深蓝的整高背景（主图与 MACD 副图同步），正常盘 = 09:30-16:00 ET，纽约时区实算，夏令时自动正确。
- **交互**：主图与 MACD 副图之间有拖拽分隔条（MACD 高度 100-340px，记忆在浏览器本地）；成交量柱半透明且与 K 线纵向分区，互不遮挡。

## AI 实时分析

驾驶舱（Cockpit）在盘中会自动跑一套 AI 分析，产物和你手动写的日内多周期结论（`intraday-signal`）同一格式，直接落进点评流。分两层：

- **点评员（commentator）**：轻量、频繁。server 每 60 秒扫一遍当天有 intraday 分析的标的，检测到触发信号或每 5 分钟心跳一次，就拿实时快照（报价 + 5 分钟 K 线 MACD + 资金流 + 昨日高低点/盘前区间/开盘区间 + 相对量能 + 已归档预测）让点评员写一两句中文白话点评。判断和已归档预测明显相反、或价格触及止损/目标时，会升级（escalate）。
- **分析员（analyst）**：重量、少跑。被点评员升级触发（同一标的 30 分钟冷却）或手动点按钮时才启动，做完整的多周期重估，最后落一张新的 intraday 图（带 `origin: "analyst"` 标记，用于战绩统计分组）并写点评。

**触发信号**：MACD 交叉、突破入场/止损/目标价、资金流翻向、放量（3 倍于 20 根均量）、进出预测里画的支撑/阻力区间（zone_break）、突破昨日高低点/盘前高低点/开盘半小时区间（day_level_break）。

**分时段行为**：
- 正常盘（09:30–16:00 ET）：上面的完整流程，60 秒一跳。
- 盘前（04:00–09:30 ET）：5 分钟一跳，纯机械不花钱——跳空 ≥2% 时往点评流写一条系统提示（≥3% 用 warn 级），并附上盘前高点方便开盘对照。监控对象是近 3 天有过 intraday 分析的标的。
- 收盘后：自动生成当日小结写进 `journal/YYYY-MM-DD-intraday-recap.md`（每个标的的预测结局、点评统计、警报清单、触发分布、当日 AI 花费），当天已存在就跳过不覆盖。

**推送**：alert 级点评和分析员完成重估时发 macOS 系统通知（osascript），不用盯着页面。只在 macOS 生效，`AI_NOTIFY=off` 关闭。

### 使用方式：server 内置 AI vs agent CLI 调 skill

两条路径产物同格式（intraday 图 + 点评流），但定位完全不同，不要互相替代：

| | server 内置（点评员/分析员） | agent CLI + skill（`intraday-signal` 等） |
|---|---|---|
| 触发 | 自动：60 秒扫描 + 事件触发 + 升级 | 手动：开会话说一句才跑 |
| 数据 | 代码预打包好喂进去，点评员只能吃这一包（24K 字符上限），分析员多 5 个固定工具 | 全工具可用：longbridge 全套、fred、sec-edgar、gdelt、trump-monitor、journal/stocks 笔记随便查 |
| 模型 | 环境变量指定，通常配便宜快的（一天跑几百次） | 会话模型（更强），无硬性时限 |
| 上下文 | 无状态，只知道当天点评 + 归档预测，不知道持仓故事和长期论点 | 有整个仓库上下文（CLAUDE.md、memory、journal 历史） |
| 产出 | 两行点评 / 一次浅层重估 + 新图 | 完整多周期研判 + 图 + journal + stocks 笔记更新 |
| 成本 | 单次便宜，靠冷却/去重/截断控制总量 | 单次贵，产出厚 |

一句话：**server 版是廉价高频窄视野的哨兵，CLI + skill 是昂贵低频全视野的参谋。**

**最佳实践**：

1. **先用 CLI 落图，再让哨兵接管。** server 只监控当天有 intraday 分析的标的——盘前或开盘时用 `intraday-signal` 对关注的标的做一次完整研判落图，之后盘中交给点评员盯，人可以离开。
2. **alert / 分析员通知来了，别只看两行点评。** 那是"有事发生"的信号，不是结论。要重新决策时开 CLI 会话让 skill 做全视野重估（它能查新闻、宏观、笔记，哨兵不能）。
3. **不要指望分析员替代人工研判。** 它的重估只吃固定数据包 + 新闻，不知道持仓计划和长期论点；它落的图带 `origin: "analyst"` 标记，总览页战绩统计里和手动分析分开计，定期看两边命中率对比来校准信任度。
4. **模型配置分层。** `AI_COMMENT_MODEL` 配快而便宜的（一天几百次调用），`AI_ANALYST_MODEL` 可以配强一档的（升级有 30 分钟冷却，量少）。花费在总览页和 `/api/overview/usage` 可查，异常升高先查触发信号是不是过敏。
5. **改动点评/分析逻辑后跑冒烟脚本验证**（见下），别等盘中才发现配置错了。

**环境变量**（模型串格式 `provider/id`，如 `anthropic/claude-haiku-4-5`）：

- `AI_COMMENT_MODEL` — 点评员用的模型。缺失则整个点评层停用，server 照常启动。
- `AI_ANALYST_MODEL` — 分析员用的模型。缺失则升级时不跑分析员。

**点评存哪**：SQLite（见下方「数据存哪」），SSE 实时推给打开的驾驶舱页面。

**AI 花费存哪**：每次点评员/分析员跑完，token 用量和成本落一条记录进 SQLite，总览页和 `/api/overview/usage` 读这里。

**冒烟脚本**（真调模型、真拉行情，会往当天点评文件里写真实点评）：

```bash
pnpm -C app/server exec tsx scripts/ai-smoke.ts MRVL.US            # 只跑点评员
pnpm -C app/server exec tsx scripts/ai-smoke.ts MRVL.US --analyst  # 再跑一遍分析员（会落新图）
```

脚本自动读仓库根目录 `.env` 里的模型配置，打印解析到的模型、跑对应层、打印落盘的点评（分析员那趟还打印新图 chartId）。模型环境变量缺失时报错并非零退出。不进 CI。

## 研究笔记与 deep-dive

个股仪表盘（Cockpit）多一个「研究笔记」标签页，直接渲染 `stocks/{SYMBOL}.md`——就是平时用 `stock-deep-dive` skill 维护的那份六面笔记。页面上有一个触发按钮，点了以后 server 起一个 AI 研究代理，自己读 skill、跑 longbridge CLI、把更新后的笔记写回去。

**什么时候用**：想在盘中看某个标的的长期论点，或者笔记明显过期又不想开 CLI 会话时。它跑的就是 `stock-deep-dive` 的六面流程，但视野比 CLI + skill 窄（工具只有读 skill、跑命令、读文件、写笔记四个），所以定位和上面的分析员一样——应急刷新用，认真研判还是开 CLI。

**要跑多久、怎么计费**：一次完整跑几分钟（上限 15 分钟，超时自动中断），多轮模型调用，按 `AI_DEEPDIVE_MODEL` 配的模型计费，花费和点评员/分析员一样落进 SQLite，总览页和 `/api/overview/usage` 可查。全局同一时间只跑一个（再点会返回 409）。跑完发 macOS 通知。

**环境变量**：`AI_DEEPDIVE_MODEL`（格式 `provider/id`，配在仓库根目录 `.env`）。缺失时功能整体停用——按钮触发会返回 503，server 照常启动。

**写入安全**：代理写文件的唯一通道是 `write_note` 工具，它只会写 `stocks/{SYMBOL}.md` 这一个文件（目标路径写死，代理传不了路径参数，空内容拒收）；bash 工具拒绝一切写文件命令（重定向、`tee`、`rm`、`mv`、`cp`），`read_file` 只能读仓库内的文件。另有 git 兜底检查：跑之前和跑完各拍一次 `git status`（只看 `stocks/`），如果出现了目标笔记以外的意外改动，结果会带 `dirtyWarning` 标记，通知里也会提醒。

**相关 API**：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/symbols/:sym/note` | 读 `stocks/{SYMBOL}.md` 原文 + 修改时间（不存在返回 `markdown: null`） |
| `POST` | `/api/symbols/:sym/deep-dive` | 触发一次 deep-dive（202 = 已启动，409 = 有一个在跑，503 = 未配模型） |
| `GET` | `/api/symbols/:sym/deep-dive/status` | 当前运行状态 + 上次结果 |

**冒烟脚本**（真调模型、真花钱，顶部会打警告）：

```bash
pnpm -C app/server exec vite-node scripts/deep-dive-smoke.ts NVDA.US          # 便宜模式
pnpm -C app/server exec vite-node scripts/deep-dive-smoke.ts NVDA.US --full   # 完整模式，慎用
```

- 默认（便宜）模式：验证 skill 索引加载、`stock-deep-dive` 可读、模型可解析，然后用真模型跑一个三步小任务（读 skill → `echo smoke-ok` → 写一行笔记），笔记写进临时目录，**不碰真的 `stocks/`**。打印观察到的工具调用顺序、token 花费和耗时。
- `--full` 模式：跑真的生产 deep-dive，写真的 `stocks/{SYMBOL}.md`，几分钟、真实成本。只给人手动验收用，改完代码先跑默认模式。

## 数据存哪

分两层：**图表文档留文件，运行流水进 SQLite**。

- 每张图一个 JSON：`journal/charts/data/YYYY-MM-DD-<slug>.json`（带 `schema_version`，跟着 journal 一起被 gitignore）。前端永远用最新代码渲染旧数据，改组件不影响历史图表。
- SQLite 库在 `journal/charts/data/app.db`（drizzle 定义 schema，迁移文件提交在 `server/drizzle/`，server 启动时自动建表），四张表：
  - `comments` — 盘中点评流水（替代原来按天按标的拆的 JSON 文件）
  - `ai_usage` — AI 花费流水（替代 `ai-usage/*.json`）
  - `chart_meta` — 图表索引（替代 `index.json`；表为空时自动扫文件目录重建，图表文档本体仍是文件）
  - `outcomes` — 预测结局缓存，**只存已了结的**（到目标/到止损是不可变事实）；战绩统计、历史列表、收盘小结先查缓存，没了结的才现拉 K 线判定，判出结果就写回
- 切库前的旧 `comments/*.json`、`ai-usage/*.json` 保留在原地但不再被读取。
- 旧的单文件 HTML 存档还在 `journal/charts/*.html`，server 在 `/legacy/` 下原样托管。
- **实时数据不落盘**：`journal/charts/data/` 里的文档永远是"研判那一刻的快照"，只有 POST / PATCH 才写盘。

## 测试

从 Python 迁移过来的计算逻辑由金标测试锁定——用原 Python 实现对真实行情数据算出的结果做基准，TS 版必须逐数对上（误差 < 1e-8）：

```bash
pnpm test           # vitest（server 包）
pnpm typecheck      # 两个包的 tsc
```

基准数据在 `server/test/fixtures/`。改指标算法前先想清楚：测试挂了说明和 Python 版行为不一致，要么是 bug，要么就该同步更新基准并在提交信息里说明。

## 后续规划

多图对比、交互标注、日志浏览。
