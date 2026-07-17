# 图表应用（app/）

本地图表应用，取代了原来嵌在 Python 字符串里的 HTML 模板渲染。pnpm workspace，三个包：

- `shared/` — 跨包类型定义（`ChartDoc` / `IntradayBuilt` / `SepaBuilt` / `CockpitFlow` / 等）与时间工具函数，server 和 web 共同引用。
- `server/` — Tsuki（Hono + NestJS 风格模块/DI）+ TypeScript。调 longbridge CLI 拉数据、算指标、提供 REST API 和 WS 实时流。核心是一个不自己 listen 的 kernel（`bootstrap.ts`），可以被不同「宿主」绑定端口/传输——目前有生产用的 node 宿主（`main.node.ts`，`@hono/node-server`）和开发用的 Vite 宿主（web 那边的 Vite dev server 把请求代理过来），未来还会加 Electron 宿主。
- `web/` — Vite + React + TypeScript。五种渲染组件 + 个股仪表盘。

## 启动

```bash
pnpm install        # 首次（从 workspace root）
pnpm start          # http://localhost:5199
```

`pnpm start` 起 node 宿主单进程：kernel 绑在 5199 端口，同时托管 REST API、WS（`/api/ws`）和已构建好的前端静态资源（`web/dist`，没 build 过会提示先跑 `pnpm --filter @kansoku/web build`）。

开发态是两个进程，`pnpm dev` 用 `concurrently` 并行拉起：web 起 Vite dev server（监听 5199，把 `/api`、`/legacy` 代理到 kernel）负责前端热更新；server 用 `vite-node --watch` 跑 kernel 本体（监听 `KERNEL_PORT`，默认 5200），改 server 代码自动重启，不需要单独的 build 步骤。

## 页面路由

| 路由 | 功能 |
|---|---|
| `/` | 首页 —— 盘中看盘 + 持仓 + 跨标的图表（flow / cohort），盘后自动切到复盘视图；`?date=YYYY-MM-DD` 定位到某天的跨标的图 |
| `/symbol/:sym` | 个股仪表盘（Cockpit）—— 六个标签页：预测、环境（含资金流/持仓对照）、消息（有新闻才显示）、复盘（历史分析/日志/笔记）、AI 点评；`?analysis=<id>` 把页面钉在某一次具体的 sepa / intraday 分析上，不带参数时跟随最新分析，`?view=live` 则进入不落盘、持续更新的实时视图 |
| `/overview`、`/charts` | 旧路由，自动跳回首页 `/` |
| `/charts/:id` | 旧的单图详情页路由，已下线；前端查出该图表的 `type` 后自动跳转到新位置——sepa / intraday 图 → `/symbol/:sym?analysis=:id`，flow / cohort 图 → `/?date=YYYY-MM-DD`；查不到该图表则跳回首页并提示 |

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

### 实时流（WS）

单条 WebSocket 连接 `/api/ws`，多路复用所有实时频道——前端每订阅一路发一条 `{op: "sub", key, kind, ...}`，收到的每条消息都带 `{key, payload}` 好路由回对应订阅方；`{op: "unsub", key}` 退订。频道（`kind`）：

| kind | 参数 | 内容 |
|---|---|---|
| `quotes` | `extra?` | 行情快照。标的 = 长桥 watchlist ∪ 持仓 ∪ `extra` 里额外传的，自动识别盘前/盘后/隔夜时段 |
| `chart` | `id`、`count?` | 图表数据流。flow / intraday 图被打开时定期重拉数据、重算指标、推新数据（sepa 是收盘级研判工具，不参与实时） |
| `board` | — | 首页跨标的看板（`/api/overview` 的实时版） |
| `comments` | `symbol` | 点评流（点评员/分析员产出的中文点评 + 提醒） |
| `analyses` | `symbol` | 历史分析结果追踪的实时更新 |
| `position` | `symbol` | 该标的持仓快照 |
| `benchmark` | `symbol` | 持仓 vs SMH / QQQ 基准归一化对照 |
| `chat` | `id` | 个股仪表盘里 AI 追问对话的流式回复 |

服务端连不上数据源时推 `{type: "status", degraded: true, error}`，前端亮黄点提示；断线由前端自动重连。开发态下 `/api/ws` 由 web 的 Vite dev server 代理到 kernel。

## 图表类型

四种，统一走 `POST /api/charts` 创建：

| type | 渲染库 | 内容 |
|---|---|---|
| `flow` | Recharts | 单标的资金流累计曲线（日内逐 tick 净流入） |
| `cohort` | Recharts | 跨标的 signed-bar 对比（各标的净流入/流出） |
| `sepa` | TradingView Lightweight Charts | SEPA 策略仪表盘——52 周高低、三均线（50/150/200）、RS 曲线（21/63/126 天）、成交分布、支撑/阻力区、入场计划，附带侧边栏：趋势模板 8 条检查、阶段判断、持仓对照、相关新闻 |
| `intraday` | TradingView Lightweight Charts | 短线多周期预测面板——5 分钟 / 15 分钟 / 1 小时三周期 K 线 + MACD + 均线，附带侧边栏：技术指标摘要（含结构信号）、入场计划、三情景推演、新闻、市场 context |

## 个体仪表盘（Cockpit）

访问 `http://localhost:5199/symbol/NVDA.US` 进入个股追踪面板，六个标签页：

- **预测（Prediction）**：短线多周期预测面板本体——5 分钟 / 15 分钟 / 1 小时三周期 K 线 + MACD，附带指标摘要、入场计划、三情景推演
- **环境（Environment）**：多头寸 vs SMH / QQQ 基准的归一化走势对照，持仓快照（成本、盈亏、目标/止损距离），以及日内资金流曲线 + 大/中/小单分布柱状图（实时刷新）
- **消息（News）**：仅在有相关新闻时才显示的市场 context 与新闻列表
- **复盘（Review）**：三个子区——历史分析（过往 intraday 分析列表，每条显示创建时间、方向判断、锚点价、结果追踪 ✅到目标/⛔到止损/⏳进行中 和累计盈亏百分比，点击可回看对应图表）、日志（关联的交易日志文件）、笔记（自由记录）
- **AI 点评（AI Comment）**：AI 实时分析产出的点评流，警报/提醒未读数以徽标提示

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

- **点评员（commentator）**：轻量、频繁。server 每 60 秒扫描已明确选择“继续跟进”的标的；新生成的 intraday 分析默认加入跟进，旧分析可在右侧“AI 点评”面板或首页看盘卡片的“AI 跟进”开关中开启或停止。跟进状态写进 SQLite，不依赖图表标签是否打开。重新开启时，若最后一次成功点评已超过 5 分钟或不存在，会立即补一次心跳巡检；未过期则只恢复后台调度。检测到触发信号或每 5 分钟心跳一次时，点评员会读取实时快照（报价 + 5 分钟 K 线 MACD + 资金流 + 昨日高低点/盘前区间/开盘区间 + 相对量能 + 已归档预测），写一两句中文白话点评。判断和已归档预测明显相反、或价格触及止损/目标时，会升级（escalate）。
- **分析员（analyst）**：重量、少跑。被点评员升级触发（同一标的 30 分钟冷却）或手动点按钮时才启动，做完整的多周期重估，最后落一张新的 intraday 图（带 `origin: "analyst"` 标记，用于战绩统计分组）并写点评。

**触发信号**：MACD 交叉、突破入场/止损/目标价、资金流翻向、放量（3 倍于 20 根均量）、进出预测里画的支撑/阻力区间（zone_break）、突破昨日高低点/盘前高低点/开盘半小时区间（day_level_break）。

**分时段行为**：
- 正常盘（09:30–16:00 ET）：上面的完整流程，60 秒一跳。
- 盘前（04:00–09:30 ET）：5 分钟一跳，纯机械不花钱——跳空 ≥2% 时往点评流写一条系统提示（≥3% 用 warn 级），并附上盘前高点方便开盘对照。监控对象与正常盘一致，均为仍处于“继续跟进”状态且已有 intraday 分析的标的。
- 收盘后：自动生成当日小结写进 `journal/YYYY-MM-DD-intraday-recap.md`（每个标的的预测结局、点评统计、警报清单、触发分布、当日 AI 花费），当天已存在就跳过不覆盖。

**推送**：应用根层保持独立的全局通知订阅，不再依赖某张图表的点评订阅。关闭图表标签后，alert 级点评以及分析员重估、深度复盘（deep dive）的完成或失败通知仍会推到浏览器；正在查看同一标的时会抑制重复的系统通知。不再依赖 macOS 系统通知（osascript）。

### 使用方式：server 内置 AI vs agent CLI 调 skill

两条路径产物同格式（intraday 图 + 点评流），但定位完全不同，不要互相替代：

| | server 内置（点评员/分析员） | agent CLI + skill（`intraday-signal` 等） |
|---|---|---|
| 触发 | 自动：60 秒扫描 + 事件触发 + 升级 | 手动：开会话说一句才跑 |
| 数据 | 代码预打包好喂进去，点评员只能吃这一包（24K 字符上限），分析员多 5 个固定工具 | 全工具可用：longbridge 全套、fred、sec-edgar、gdelt、trump-monitor、journal/stocks 笔记随便查 |
| 模型 | `/settings` 页面配置，通常配便宜快的（一天跑几百次） | 会话模型（更强），无硬性时限 |
| 上下文 | 无状态，只知道当天点评 + 归档预测，不知道持仓故事和长期论点 | 有整个仓库上下文（CLAUDE.md、memory、journal 历史） |
| 产出 | 两行点评 / 一次浅层重估 + 新图 | 完整多周期研判 + 图 + journal + stocks 笔记更新 |
| 成本 | 单次便宜，靠冷却/去重/截断控制总量 | 单次贵，产出厚 |

一句话：**server 版是廉价高频窄视野的哨兵，CLI + skill 是昂贵低频全视野的参谋。**

**最佳实践**：

1. **先用 CLI 落图，再让哨兵接管。** 新建 intraday 分析后会默认持续跟进；不再关注时可在右侧“AI 点评”面板或首页看盘卡片关闭“AI 跟进”。旧分析若要重新纳入监控，重新开启即可，之后可以关闭图表标签。
2. **alert / 分析员通知来了，别只看两行点评。** 那是"有事发生"的信号，不是结论。要重新决策时开 CLI 会话让 skill 做全视野重估（它能查新闻、宏观、笔记，哨兵不能）。
3. **不要指望分析员替代人工研判。** 它的重估只吃固定数据包 + 新闻，不知道持仓计划和长期论点；它落的图带 `origin: "analyst"` 标记，总览页战绩统计里和手动分析分开计，定期看两边命中率对比来校准信任度。
4. **模型配置分层。** 盘中快评配快而便宜的模型（一天几百次调用），升级分析可以配强一档的（升级有 30 分钟冷却，量少）。花费在总览页和 `/api/overview/usage` 可查，异常升高先查触发信号是不是过敏。
5. **改动点评/分析逻辑后跑冒烟脚本验证**（见下），别等盘中才发现配置错了。

**模型与 API key 在哪配**：`/settings` 页面，存 SQLite，key 用 AES-256-GCM 加密（密钥文件 `journal/charts/data/ai-secret.key`，git 已忽略）。四个用途——盘中快评、升级分析、深度研究、追问——各自选 provider、模型、思考档位；追问可以设成跟随升级分析。改设置即时生效，无需重启 server（进行中的一轮用旧配置跑完）。

首次启动时，server 会把旧 `.env` 里的 `AI_*_MODEL` 和对应的 `*_API_KEY` 一次性导入数据库（导入后 `.env` 里这些行可以删掉，留着也不影响，因为已经导入过就不会再导）。

LobeHub Cloud 通过 Device Flow 登录个人账户，不保存 Cloud 密码。Cloud 开发者 Client 就绪后，在 `.env` 配置 `LOBEHUB_OAUTH_CLIENT_ID`；默认连接 `https://app.lobehub.com`，开发环境可用 `LOBEHUB_CLOUD_URL` 覆盖。未配置 Client ID 时，设置页会显示“等待 Client ID”，不会复用 `lobehub-cli` 的 Client ID。

**点评存哪**：SQLite（见下方「数据存哪」），SSE 实时推给打开的驾驶舱页面。

**AI 花费存哪**：每次点评员/分析员跑完，token 用量和成本落一条记录进 SQLite，总览页和 `/api/overview/usage` 读这里。

**冒烟脚本**（真调模型、真拉行情，会往当天点评文件里写真实点评）：

```bash
pnpm -C app/server exec tsx scripts/ai-smoke.ts MRVL.US            # 只跑点评员
pnpm -C app/server exec tsx scripts/ai-smoke.ts MRVL.US --analyst  # 再跑一遍分析员（会落新图）
```

脚本读 `/settings` 存的模型配置（首次运行会顺带做一次性 `.env` 导入），打印解析到的模型、跑对应层、打印落盘的点评（分析员那趟还打印新图 chartId）。模型未配置时报错并非零退出。不进 CI。

## 研究笔记与 deep-dive

个股仪表盘（Cockpit）多一个「研究笔记」标签页，直接渲染 `stocks/{SYMBOL}.md`——就是平时用 `stock-deep-dive` skill 维护的那份六面笔记。页面上有一个触发按钮，点了以后 server 起一个 AI 研究代理，自己读 skill、跑 longbridge CLI、把更新后的笔记写回去。

**什么时候用**：想在盘中看某个标的的长期论点，或者笔记明显过期又不想开 CLI 会话时。它跑的就是 `stock-deep-dive` 的六面流程，但视野比 CLI + skill 窄（工具只有读 skill、跑命令、读文件、写笔记四个），所以定位和上面的分析员一样——应急刷新用，认真研判还是开 CLI。

**要跑多久、怎么计费**：一次完整跑几分钟（上限 15 分钟，超时自动中断），多轮模型调用，按 `/settings` 里配的深度研究模型计费，花费和点评员/分析员一样落进 SQLite，总览页和 `/api/overview/usage` 可查。全局同一时间只跑一个（再点会返回 409）。跑完发 macOS 通知。

**在哪配模型**：`/settings` 页面的「深度研究」用途。缺失时功能整体停用——按钮触发会返回 503，server 照常启动。

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

## 开源核心与 Pro 插槽（open-core）

这个仓库是免费版（社区构建）：图表、实时行情、journal 全部功能齐全，从源码就能完整跑起来。AI 功能（点评员/分析员/deep-dive/追问/收盘小结/scheduler）是付费能力，代码不在这个公开仓库里——它们活在一个独立的私有仓库 `@kansoku/pro`，通过一个插槽机制接入。

**插槽怎么接**：`app/pro/` 是一个 gitignored 目录，里面放的是 `@kansoku/pro` 这个独立 git 仓库（官方发行版打包时才会拉进来）。`packages/core/src/pro/loader.ts` 在 server（`runtimeInit.ts`）和 desktop（`boot/kernel.ts`）启动早期各自 await 一次动态 import；`app/pro` 不存在或包坏了，import 直接失败被 catch 住，落进免费模式（一行 info 日志，不报错不刷屏）。公开代码永远不会静态 import `@kansoku/pro`——一行都没有，这样社区 clone 下来正常 `pnpm install`/`typecheck`/`build`/`test`/`dev` 全部照常跑通，唯一区别是 AI 入口在 UI 上不出现。

**接口约定**：`packages/pro-api`（`@kansoku/pro-api`，公开、纯类型包）定义了 pro 包要交出什么——`tsukiModules`（server 路由模块）、`ipcServiceClasses`（desktop IPC）、`channels`（realtime 频道注册）、`hooks`（非 AI 代码需要反查的东西，比如宏观事件过滤、跟进状态、点评列表）、`aiSettings`（设置页 AI 分节的委托对象）、`startScheduler`、`initRuntime`。`packages/core/src/pro/registry.ts` 持有当前注册的 pro 模块，`hooks` 每一项都有免费模式下的默认实现（宏观过滤直通、跟进/点评列表返回空、scheduler 空转）——所以就算 pro 缺失，调用这些 hook 的代码也不用到处判空。

**能力广播**：`GET /api/capabilities` 返回 `{ pro, licensed }`（IPC 下同名方法），web 启动时拉一次存进 `capabilitiesStore`，QuickBar、cockpit 的 ChatDock、settings 的 AI 分节等入口都按这个 store 显隐——`pro` 为 false 时整个 AI 相关 UI 都不出现，不会看到一个点了没用的按钮。当前阶段 pro 包加载成功就直接 `{pro: true, licensed: true}`，订阅授权（licensed 的真实语义）是后续阶段的事。

**官方构建怎么把 pro 接进来**：`app/scripts/fetch-pro.sh` 是一个幂等的 clone/pull 脚本，读 `KANSOKU_PRO_REPO_URL` 环境变量决定拉哪个仓库；变量没设时脚本直接退出、留在免费模式（这也是社区贡献者的默认状态）。`desktop-release.yml` 里挂了这一步，但门槛是这个变量——今天还没配置，所以桌面发行版目前也是社区构建。

## 后续规划

多图对比、交互标注、日志浏览。
