# 标的图表加载提速:限流处理 + 缓存池 + 增量/惰性拉取

- 日期:2026-07-25
- 状态:已批准(方案 A)
- 范围:`packages/core`(marketdata / realtime / charts)+ `apps/server` 一个新路由 + `apps/web` NewsTab

## 背景与问题

打开 `/symbol/:sym` 时,骨架屏要等 kernel 完成一次完整 `buildChart` 才收到第一帧,实测冷启动约 2s(端到端 3~3.5s)。分解(SNDK 实测):

| 环节 | 完成时刻 | 说明 |
| --- | --- | --- |
| 证券名 | +126ms | 已有缓存 |
| 事件风险 | +830ms | 财报/宏观日历 |
| 三路 K 线(m5/m15/h1 各 1000 根) | +879ms | ws 全部被 301606 限流拒绝,白等一轮后降级 CLI 子进程 |
| 日 K(60 根) | +1002ms | 喂昨高/昨收/昨低参照线 |
| 新闻 | +1920ms | 最长杆,且只喂侧栏消息 tab |

两个结构性问题:

1. **限流反馈环**:首页资金流轮询 + 每张图每个刷新 tick 打 3 路 K 线,把长桥 ws 行情配额常年吃干(`code=301606 msg=request rate limit`,对应 longbridge/developers#827),导致连冷启动首查都必然失败,再花 ~0.84s/路 降级 CLI。
2. **零复用**:最后一个订阅者离开页面,poller 与 candle state 立即销毁(`poller.ts` 订阅数归零即 `onStop`),重进页面从零全量重建。

## 目标

- 冷启动首帧 ~2s → ~1s(去掉新闻与日线的阻塞)。
- 重进最近看过的标的:秒开(先推缓存帧,后台增量刷新再推新帧)。
- 长桥请求量下降一个数量级,让 ws 快路径恢复可用,301606 自然消退。

## 非目标

- 不新增日 K 周期视图(`TimeframeKey` 仍为 `m5 | m15 | h1`)。
- 不改冻结分析 doc 的持久化语义(分析时点快照不动)。
- 不做跨进程/落盘缓存,仅进程内内存。

## 设计

### ① 限流不降级 CLI(`marketdata/longbridge.ts`、`longbridgeSocket.ts`、`longbridgeProtocol.ts`)

- 正式加入错误 body 解码:非零 status 的响应解出 `{code, msg}` 并拼进错误信息(调查期已验证可行)。
- 新增限流类错误判定:`code=301606`、`msg` 含 `rate limit`、CLI 报文含 `429002` 等。
- `wsFirst` 遇限流类错误:直接抛出,**不降级 CLI**(CLI 撞的是同一账号的配额,降级只会加重限流)。CLI 路径自身遇限流同样直接抛。
- 抛出后由现有 poller degraded 状态机接住:前端显示降级提示,按现有退避自动重试。现有的连接配额 cooldown 逻辑(`isQuotaError`)保持不变。
- preview 的冷启动首建也移入 poller task 内执行(原先在 setup 工厂里):首建撞限流时同样走 degraded + 退避自动重试,成功后推帧自愈,而不是一次性抛给订阅方变成无法恢复的整页错误。附带简化:`previewInitialBuilt` 中转机制删除,首帧统一经 poller 推送。

### ② 缓存池 = 内存 linger + SQLite 缓存表(`realtime/poller.ts`、`realtime/charts.ts`、`realtime/candleCache.ts`、`db/`)

两层:

**热层(内存 linger)**
- 订阅数归零时:停止轮询,但**延迟 30 分钟**再执行 `onStop`(销毁 candle state / 最后一帧)。linger 期间不轮询、不耗配额。
- LRU 上限 12 个标的:超限踢最旧的 linger 项,活跃订阅不受限。
- linger 期间重新订阅:取消延迟销毁,立即推最后一帧(前端秒开),同时立刻触发一次增量刷新 tick,新帧到达后照常推送——即 stale-while-revalidate,"后台失效 + 通知前端"复用现有 ws 推送通道。
- preview 频道(`preview:SYM`)与 chart-id live 频道共用 `getOrCreatePoller`,两边同时生效。

**温层(SQLite 缓存表,重启存活)**
- 复用 kernel 既有的 better-sqlite3 + drizzle(`app.db`),新表 `symbol_candle_cache`:`symbol` 主键、`timeframes`(JSON)、`day_kline`(JSON)、`last_fetch_at`、`updated_at`;migration `0008_symbol_candle_cache`。
- 读:preview 冷启动(内存无 poller)时查表,命中(行龄 ≤ 7 天且三个周期齐全)则以缓存 bars 直接构建首帧——**完全跳过 1000 根冷拉取**,`last_fetch_at` 交给增量逻辑,首个 tick 自动补齐缺口。
- 写:preview 每次成功刷新后节流写入(每标的 ≥ 60s 间隔),进入 linger 时立即写一次。DB 故障只告警不影响图表。
- 淘汰:写入时顺带清理——行龄 > 7 天或超出 30 个标的(按更新时间淘汰最旧)。
- 仅 preview 路径入表;chart-id 分析图的数据本就持久化在 chart doc 里,不重复缓存。

### ③ K 线增量拉取(`realtime/charts.ts` 刷新 task)

- 冷启动首建拉 1000 根;之后每个刷新 tick 只拉尾部小段。
- 根数 = `距上次成功刷新的时间 ÷ 周期长度 + 余量(约 5 根)`,封顶 1000——闲置很久后自动退化为全量,防缺口。
- 合并沿用现有 `mergeFreshBars` + `frozenRanges`,不改合并语义。

### ④ 日线不阻塞首帧(`charts/build.ts`、`realtime/charts.ts` 首建路径)

- 首帧构建时:`dayKlineCache`(现有 10 分钟 TTL)命中就带上;未命中则不等,先出无参照线的图,日线到达后再推一帧补上昨高/昨收/昨低参照线。
- 刷新 tick 维持现状(缓存命中为主)。

### ⑤ 新闻惰性加载(kernel 新端点 + `apps/web` NewsTab)

- preview/live 构建输入去掉 `getNews`:首帧与每个刷新 tick 都不再拉新闻(每帧省 ~1.9s,也是限流压力大头)。
- 新增 `GET /api/symbols/:sym/news`(SymbolsController),内部走 provider `getNews`,配短 TTL 内存缓存。
- 前端"消息"tab 首次激活时才请求,react-query 缓存。
- 冻结分析 doc 中已持久化的 news 照旧显示;live/preview 一律走新端点。

## 参数

| 参数 | 值 | 说明 |
| --- | --- | --- |
| linger 时长 | 30 分钟 | 到期销毁内存 state |
| 内存 LRU 上限 | 12 个标的 | 仅计 linger 项 |
| 增量余量 | 5 根 | 防边界缺口 |
| 增量封顶 | 1000 根 | 与冷启动一致;历史视图取 max(1000, viewCount) |
| news 端点 TTL | 5 分钟 | 内存 Map |
| DB 行龄上限 | 7 天 | 超龄视为 miss 并清理 |
| DB 行数上限 | 30 个标的 | 按 updated_at 淘汰最旧 |
| DB 写节流 | 60 秒/标的 | linger 进入时立即写 |

## 测试

- 单测:poller linger(归零延迟销毁、linger 内重订阅推缓存帧并取消销毁、LRU 淘汰)、增量根数计算(短间隔/长闲置/封顶)、限流错误分类(301606 / rate limit / 429002 不降级)。
- 手动端到端:冷启动首开(~1s、参照线补推)、重进标的(秒开)、切消息 tab(才发新闻请求)、限流注入(degraded 提示 + 退避恢复)。

## 预期效果

- 首开 ~1s;重进秒开;新闻/日线不再阻塞任何一帧。
- 每 tick 请求从「3×1000 根 K 线 + 新闻 + 日线」降为「3×~5 根 K 线」,配额压力大幅缓解。
