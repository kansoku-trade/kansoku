# Longbridge SDK 换血 + 传输收敛 WS 设计

日期:2026-07-06
状态:已确认方向,待实施

## 背景

服务端的行情/账户数据目前走 `longbridge` CLI 子进程(`marketdata/longbridge.ts`,8 个方法),每次调用要起进程 + 走鉴权,单次几百 ms,还带着并发上限 4、失败冷却 120s 这些补丁。行情推送已经在上一轮改成了 longbridge Node SDK 的 QuoteContext WS 推送(`longbridgeStream.ts`)。目标是追求高实时性:数据获取全面换 SDK,前端传输收敛到现有的多路复用 WebSocket,按订阅推送。

已确认的三个决策:

1. K 线走「REST 换血 + 推送订阅」:按需拉取用 SDK 常驻连接,被订阅的 symbol/周期用 SDK 的 candlestick 推送增量更新,poller 降级为兜底。
2. 收敛边界:HTTP 轮询层(`useIntervalFetch` 的四处:持仓卡片、大盘对照、相对成交量、盘面看板)搬进 WS 订阅频道;一次性 HTTP(图表文档、分析列表、journal/笔记、历史点评)保持不动。
3. CLI 只保留 `news` 一个方法(OpenAPI 无新闻接口),其余 7 个方法删除 CLI 实现,SDK 是唯一路径,不留活的后备 provider。

## 设计

### 1. provider 换血(CLI → SDK)

`marketdata/longbridge.ts` 的 8 个方法:

| 方法 | SDK 调用 | 上下文 |
|---|---|---|
| `getKline` | `candlesticks(symbol, period, count, adjust, sessions)`;深历史用 `historyCandlesticksByOffset` | QuoteContext |
| `getQuotes` | `quote(symbols)` | QuoteContext |
| `getFlow` | `capitalFlow(symbol)` | QuoteContext |
| `getCapitalDistribution` | `capitalDistribution(symbol)` | QuoteContext |
| `getWatchlistSymbols` | `watchlist()` | QuoteContext |
| `getPositions` | `stockPositions()` | TradeContext(新增单例) |
| `getPortfolio` | `accountBalance()`(需要时补 `fundPositions`) | TradeContext |
| `getNews` | 保留 CLI(唯一来源) | — |

- QuoteContext / TradeContext 单例同居一个 SDK 模块(现 `longbridgeStream.ts`,可改名 `longbridgeSdk.ts`),复用同一 Config(OAuth 优先、API key 兜底,沿用现有凭据逻辑)。
- provider 接口签名不变,消费方(build.ts、analyst、routes 等)零改动;SDK 返回值在 provider 层映射为现有 Raw* 类型。
- 删除 CLI 的并发闸(MAX_CONCURRENCY)与失败冷却;换一个轻量节流应对 OpenAPI QPS 限制;SDK 错误映射为现有 `ClientError`(502 + hint)。
- `historyCandlesticksByOffset` 顺带解除现在「一次最多拉 count 根」的历史加载限制(图表加载更早历史时按 offset 翻页)。

### 2. K 线推送 + 订阅台账

- SDK 模块新增 candlestick 订阅封装:`subscribeCandlesticks(symbol, period, cb)` → 返回退订函数;内部维护**引用计数台账**(key = symbol+period),计数 0→1 时向 SDK 订阅,归零时退订。
- `realtime/charts.ts` 图表流升级:推送到达时增量更新最后一根 K 线并触发轻量重建(指标重算 + 推给该图表频道的订阅者);poller 保留为兜底(推送断流或非订阅周期时,按现有 session 分档间隔工作)。

### 3. WS 频道扩容(轮询 → 订阅)

现有 multiplex 协议(`routes/ws.ts`,kind: `quotes` / `chart` / `comments` / `analyses`)新增:

| kind | 参数 | 数据 | 实时来源 |
|---|---|---|---|
| `position` | `{ symbol }` | 持仓数量、成本、实时盈亏、相对成交量 | stockPositions 快照(低频)× quote 推送(高频)服务端合成 |
| `benchmark` | `{ symbol }` | SPY/QQQ 对照序列 | 已有 quote 推送,服务端聚合 |
| `board` | 无 | 盘面看板行(watchlist ∪ positions) | quote 推送 + 定期快照合成 |

- 前端四处 `useIntervalFetch` 改为现有 WS hook 订阅对应频道;`useIntervalFetch` 保留给未迁移的边角。
- relvol 不单独开频道,作为 `position` / `board` 的附带字段。
- 每频道首条消息发全量快照(和 `comments` 频道的 `init` 模式一致),之后增量推。

### 4. 边界与降级

- SDK 连接断开:推送频道复用 quotes 频道现有的 `degraded` 状态机制;REST 调用直接报错(`ClientError`)不静默。
- 订阅数上限:K 线订阅只来自打开的图表频道,量级 = 同时在看的图 × 周期,远低于 SDK 上限;台账归零即退订保证不泄漏。
- CLI 仅剩 news:`execLongbridge` 保留最小化版本,失败返回空数组(现状)。
- 美股专用现状不变(US-only)。

### 5. 测试与验证

- provider 改为可注入 SDK client(构造参数或工厂),单测覆盖 SDK 返回 → Raw* 类型映射。
- 订阅台账:计数、去重、归零退订、断线重订的单测。
- 新 WS 频道:订阅收到 init 快照、推送增量、退订停止推送的单测(仿 `analyses` 频道现有测法)。
- `cd app && pnpm test` 全绿;手动验证:开个股页看 K 线随推送跳动、持仓盈亏秒级刷新、拔网线出 degraded。

## 不做的事

- 交易下单、改单、撤单(TradeContext 只读)。
- 深度/经纪队列/逐笔成交推送、期权链。
- 前端 UI 布局与页面结构改动。
- 一次性 HTTP 接口(文档、journal、历史点评)迁移 WS。
