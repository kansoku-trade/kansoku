# 预测流 v2：不可变预测版本与可审计结算设计

| 项目 | 内容                                                    |
| ---- | ------------------------------------------------------- |
| 日期 | 2026-07-10                                              |
| 状态 | 设计已由用户确认，等待书面复核                          |
| 范围 | `intraday` 短线预测、修订、机械结算、统计、journal 闭环 |

## 1. 背景

当前短线预测的分析纪律已经比较完整：日线定背景、1 小时定方向、15 分钟定结构、5 分钟定触发；同时纳入消息、事件、大盘、板块、相对成交量、期权关键价位、结构止损、仓位上限和多情景推演。

问题主要在预测写入之后：

- 人工流程会 PATCH 同一份图表，旧预测和旧锚点被覆盖；应用内 analyst 则创建新图表，两条路径的版本语义不同。
- 结算从 AI 提交的 `anchor.time` 开始，没有以服务端实际收到预测的时刻作为因果边界。
- 方向计划没有先判断入场是否成交，便直接扫描止损和 T1。
- 方向计划没有固定结束期限；neutral 用自然时间 6.5 小时，而不是有效交易 K 线根数。
- 结局只在页面读取时临时计算，且只缓存已结算结果。未结算预测可能在 300 根 K 线窗口滚动后永久变成无法判断。
- 结局缓存以 `chartId` 为唯一键，预测被覆盖后旧结局可能套用到新计划。
- 情景概率只有展示，没有固定期限和可机械判断的结果边界，无法做概率校准。
- 当前统计把市场方向、交易计划和 neutral 混成一个“命中率”，且没有完整展示无法判断、重复和顺序不明样本。

因此，v2 的目标不是增加更多指标，而是让每一次预测都满足三个基本条件：**当时可知、不可改写、可以复算**。

## 2. 范围决定

### 2.1 一期定位

一期建设“预测研究账本”：

- 保存市场判断和模拟交易计划；
- 使用真实市场 K 线进行机械结算；
- 允许读取长桥账户快照用于仓位建议；
- 不把模拟结果称为真实交易收益；
- 不读取真实委托、成交、费用和滑点作为一期必需输入。

真实成交账本留到后续阶段，届时必须与模拟结果分栏，禁止混算。

### 2.2 不做的事

- 不重写 MACD、K 线形态、123 结构等指标算法。
- 不把应用改造成自动下单系统。
- 不对 v1 历史预测进行猜测式补全或重新包装成 v2 样本。
- 不在一期建立复杂的逐笔成交回放系统。
- 不把 SQLite 变成唯一持久层；JSON 仍是可以重建索引的持久记录。

## 3. 核心原则

1. **服务端决策时间是唯一计分起点。** AI 只能选择分析周期，不能自行指定可用于计分的历史时间和价格。
2. **预测定稿后不可修改。** 修订必须创建新版本，旧版本始终可查看、可复算。
3. **市场判断和交易计划分开结算。** 看多不等于必须买入；已有相关持仓时可以“方向看多、行动回避”。
4. **固定期限后再谈正确率。** 每个预测必须在提交时确定观察周期，禁止无限期等待目标价。
5. **未成交不是亏损。** 交易计划必须先成交，之后止损和目标才生效。
6. **所有样本都有去向。** 未成交、时间退出、数据缺口、同柱顺序不明和旧版数据都必须显式计数。
7. **结果不依赖页面访问。** 后台任务主动结算，查询接口只读持久结果。
8. **同一口径贯穿生成、显示和结算。** `regular` 与 `all` 交易时段不能在链路中途变化。
9. **重复提交不重复计数。** AI 因超时或网络重试再次提交同一个请求时，只生成一份预测版本。

## 4. 架构

```text
人工 intraday-signal ─┐
                      ├─> 统一 finalize / revise API
应用内 analyst ───────┘           │
                                  ▼
                         服务端生成决策时间、价格
                                  │
                                  ▼
                        不可变 ChartDoc 预测版本
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             预测结算任务                  驾驶舱历史展示
                    │
                    ▼
       终局不可变 outcome JSON + SQLite 索引
                    │
                    ▼
             v2 统计 / recap / journal
```

### 4.1 持久化边界

- 已定稿的 `ChartDoc` JSON 是预测版本的持久记录。
- `journal/charts/data/outcomes/<chart-id>/<evaluator-version>/outcome.json` 是结局的持久记录；路径包含 evaluator 版本，允许未来并列复算而不覆盖旧口径。文件内同时冻结实际消费的规范化 K 线证据，避免原始行情窗口滚动或供应商修订后无法复算。
- `journal/charts/data/submission-audit/<session-date>/<attempt-id>.json` 保存每次提交尝试及其 `created`、`duplicate` 或 `conflict` 结果，使重复去除数量可以审计，而不是只存在进程内计数器。
- SQLite 保存图表、活动状态和结局的查询索引，可以从 JSON 重建。
- 浏览器收到的实时 K 线仍是临时展示数据，不修改已定稿预测。

## 5. 预测数据模型

### 5.1 预测版本元数据

`ChartDoc` 为 `intraday` 且已定稿时新增：

```ts
interface PredictionRevisionMeta {
  series_id: string;
  revision: number;
  supersedes_id: string | null;
  session_date: string;
  rule_version: 'intraday-v2';
  origin: 'manual' | 'analyst';
  decision: {
    server_time: string;
    quote_time: string;
    price: number;
    market_session: 'regular' | 'pre' | 'post' | 'overnight';
  };
  signal_anchor: {
    timeframe: 'm5' | 'm15' | 'h1';
    closed_bar_time: string;
    closed_bar_price: number;
  };
  horizon: {
    timeframe: 'm5' | 'm15' | 'h1';
    bars: number;
    session: 'regular' | 'all';
  };
  day_type: {
    value: 'catalyst' | 'calm' | 'unknown';
    sources: string[];
    observed_at: string;
  };
  request_hash: string;
  prediction_hash: string;
  idempotency_key: string;
}
```

约束：

- `server_time` 由服务端生成，不接受调用方覆盖。
- `session_date` 由服务端按美股交易所日历生成，不使用亚洲本地日期，也不接受调用方覆盖。
- `decision.price` 使用服务端读取的 Longbridge `last_done`；`quote_time` 与报价一同保存。交易时段内报价超过 30 秒或时间戳异常时拒绝定稿，闭市时才允许使用最近报价并显式标记。
- `signal_anchor` 只引用最新一根已完成的所选周期 K 线，用于解释判断依据，不作为计分起点。
- 如果市场关闭，允许报价时间早于服务端提交时间，但必须显示“市场关闭，使用最近报价”；观察窗口从提交后的下一根有效 K 线开始。
- `horizon.bars` 必须为正整数，并设合理上限；一期上限为三个正常交易日对应的 K 线根数。
- `day_type` 由服务端根据财报与宏观日历，以及提交时已经核验的公司公告、政策、关税、行业和重大新闻共同冻结。只有日历无事件且可信消息源也没有已知重大催化时才能写 `calm`；消息无法核验或覆盖不完整时写 `unknown`，不得由模型为了统计效果自行选择。
- `request_hash` 对规范化后的调用方请求计算，不包含服务端时间和报价，用于辨别真正的幂等重试与内容不同的并发提交。
- `prediction_hash` 对包含服务端决策元数据在内的规范化最终文档计算，排除哈希字段本身；同一预测内容在不同决策时刻生成不同哈希。
- `idempotency_key` 按 `origin + symbol + operation + parent_id` 分域；只有幂等键与 `request_hash` 都一致时才返回第一次创建的版本，同键不同内容返回 409。
- 当前是否为最新版本、市场判断是否完成、交易计划是否结束都属于后续状态，不回写不可变的 `ChartDoc`；前者由版本索引推导，后两者来自 outcome。

### 5.2 市场判断

```ts
interface ForecastV2 {
  direction: 'long' | 'short' | 'neutral';
  scenario_band: {
    bear_below: number;
    bull_above: number;
  };
  band_context: {
    policy_version: 'scenario-band-v1';
    width_pct: number;
    recent_volatility_pct: number;
    width_in_volatility_units: number;
    lower_distance_in_volatility_units: number;
    upper_distance_in_volatility_units: number;
  };
  probabilities: {
    bear: number;
    base: number;
    bull: number;
  };
  scenarios: {
    bear: { path: string; trigger: string };
    base: { path: string; trigger: string };
    bull: { path: string; trigger: string };
  };
}
```

规则：

- 三个情景固定为 Bear、Base、Bull，以便跨预测比较。
- 概率必须各自在 0–100 之间，并在浮点误差范围内合计 100。
- `bear_below < bull_above`。
- `band_context` 由服务端按决策前已完成 K 线计算并冻结。`recent_volatility_pct` 取所选期限周期最近 20 根已完成 K 线的真实波幅（把跳空计入的单根波动范围）占前收比例的中位数，再乘以 `sqrt(horizon.bars)`。
- `scenario-band-v1` 强制 `bear_below < decision.price < bull_above`，并要求决策价到上下边界的距离分别处于近期正常波动幅度的 0.25–1.5 倍之间；因此区间不能靠整体平移预先锁定 Bear 或 Bull，也不能靠无限放宽提高 neutral 守区间率。
- 观察期限最后一根有效 K 线的收盘价：
  - `close < bear_below`：Bear；
  - `bear_below <= close <= bull_above`：Base；
  - `close > bull_above`：Bull。
- 文字 `path` 和 `trigger` 用于解释，不直接决定机械结局。
- Bear/Base/Bull 概率只按期限终点所属情景评分。
- long 必须以 Bull 为唯一最高概率，short 必须以 Bear 为唯一最高概率，neutral 必须以 Base 为唯一最高概率；一期不接受文字理由覆盖这一映射，方向与概率矛盾时直接拒绝定稿。
- neutral 仍必须给上下边界；它的方向判断是“期限内没有任何有效收盘价离开闭区间 `[bear_below, bull_above]`”。即使价格曾经破区间、最后又回到 Base，概率评分与 neutral 方向判断也要分别如实记录。

### 5.3 行动与交易计划分离

```ts
interface TradeDecisionV2 {
  action: 'enter' | 'wait' | 'avoid' | 'manage_existing';
  reason: string;
}

interface TradePlanV2 {
  direction: 'long' | 'short';
  entry_order: 'stop' | 'limit' | 'close_confirmation';
  trigger_timeframe: 'm5' | 'm15' | 'h1';
  entry: number;
  entry_expiry: {
    timeframe: 'm5' | 'm15' | 'h1';
    bars: number;
  };
  invalidation_before_entry: {
    price: number;
    mode: 'touch' | 'close';
    timeframe: 'm5' | 'm15' | 'h1';
  };
  stop: number;
  target1: number;
  target2: number;
  target1_close_fraction: number;
  remainder_stop_after_target1: 'breakeven';
  time_exit_price_basis: 'bar_close';
  time_stop: {
    timeframe: 'm5' | 'm15' | 'h1';
    bars: number;
  };
  requested_risk_pct: number;
  shares: number;
  risk_amount: number;
  notional: number;
  account_snapshot: {
    account_id_hash: string;
    equity: number;
    cash: number;
    buying_power: number;
    captured_at: string;
    provider: 'longbridge';
  };
  stop_note: string;
  management_note: string;
}
```

规则：

- `action = enter` 表示启用一份条件入场模拟计划，不等于提交时已经成交；此时必须有交易计划。
- `wait`、`avoid` 和 `manage_existing` 可以只有市场判断，不生成新开仓模拟结果。
- neutral 不允许携带新开仓交易计划；两侧应对写在情景说明中。
- 有交易计划时，其 direction 必须与市场判断 direction 一致；neutral 永远不得使用 `action = enter`。
- long 必须满足 `stop < entry < target1 < target2`；short 必须满足 `target2 < target1 < entry < stop`。
- `entry_order` 明确区分突破触发单和回调限价单，禁止根据后续走势倒推出订单类型。
- 相对 `decision.price`，long stop 必须更高、long limit 必须不高于现价、short stop 必须更低、short limit 必须不低于现价；long close confirmation 必须更高，short 必须更低。
- 一期中 stop/limit 只允许 `trigger_timeframe = m5`；`close_confirmation` 可以使用 m5、m15 或 h1，确认柱完成后在下一根可用 5 分钟 K 线开盘模拟成交。
- `entry_expiry` 从可消费窗口开始累计；未成交到期为 `no_fill`。`time_stop` 只在实际入场后开始累计，两者不得混为一个期限。
- `entry_expiry.bars` 与 `time_stop.bars` 都必须为正整数；按各自周期换算后的最坏总观察长度不得超过三个正常交易日。
- `invalidation_before_entry` 结构化保存失效价、触碰或收盘确认方式及周期；不再依赖 `management_note` 解释。
- long 的入场前失效价必须低于 entry，按低点触碰或收盘 `<= price` 判断；short 必须高于 entry，按高点触碰或收盘 `>= price` 判断。
- `target1_close_fraction` 必须大于 0 且小于 1；一期剩余仓位在 T1 后统一将止损移到入场价，T2 退出全部余仓。
- 调用方只提交 `requested_risk_pct` 和计划价位，不得提交或覆盖 `shares`、`risk_amount`、`notional` 与 `account_snapshot`。服务端在定稿时实时读取长桥账户，自行计算这些最终字段；账户读取失败时，`action = enter` 不得定稿。
- `account_snapshot` 冻结账户标识哈希、净资产、现金、可购买金额、时间和来源。`risk_amount` 必须在允许误差内等于 `shares * abs(entry - stop)`，`notional` 必须等于 `shares * entry`；两者都按计划价格冻结，不因后续跳空改写。
- T1 口径收益风险比低于 1:1 时拒绝定稿。
- T1 口径 1:1–2:1 时允许，但必须在说明中标记“赔率偏薄”。
- `time_stop` 默认使用锚点周期和六根 K 线；计时只累计所选交易时段内已完成的有效 K 线。
- 交易计划继承预测版本的 `horizon.session`，不得单独改成另一套交易时段。
- 服务端将 `requested_risk_pct` 限制在策略允许范围内，并同时受可购买金额、账户风险预算和 30% 名义金额上限约束；最终股数向下取整，账户快照与计划一起冻结。
- 相关持仓集中度可以导致 `action = avoid`，但不改变市场方向判断。

## 6. API

### 6.1 预览

保留：

```text
POST /api/charts
```

无 `prediction` 时创建可复用的 preview 图表。preview 不参与统计，可以删除或重新构建。

### 6.2 定稿

新增：

```text
POST /api/charts/:id/finalize
```

请求包含 `prediction`、`context`、`horizon`、`trade_decision`、可选 `trade_plan` 和 `idempotency_key`。

服务端通过“数据库唯一约束 + 原子文件替换 + 启动恢复”完成提交：

1. 验证图表存在且仍为 preview；
2. 验证预测、概率、期限、止损、目标、neutral 区间和仓位；
3. 计算 `request_hash`，拉取当前报价、最新已完成锚点 K 线；`action = enter` 时同时读取长桥账户快照并由服务端计算仓位，随后冻结 `decision.server_time`；
4. 生成最终文档、`prediction_hash`、最终 chart ID 和临时文件名；
5. 在第一笔 SQLite 事务中写入包含上述字段的 `prepared` 预留，并锁定 preview；修订请求还要 compare-and-swap（比较后交换）series 当前 head；
6. 将最终 JSON 写入预留的同目录临时文件，完成刷盘后原子重命名；
7. 在第二笔 SQLite 事务中把预留改为 `committed`、推进 series head，并写入 settlement outbox（待结算投递表）；
8. 原子写入提交审计 JSON，再返回 `chart_id`、`series_id`、`revision` 和最终 URL。

JSON 与 SQLite 无法组成一个真正的跨存储原子事务，因此不承诺两者同时落盘。启动恢复必须处理四类窗口：`prepared` 但没有最终文件时清理临时文件并释放预留；已有匹配 `prediction_hash` 的最终文件但索引未完成时补成 `committed`；已提交但 outbox 缺失时补投递；已提交但 submission audit 缺失时补审计记录。最终以 JSON 为持久事实，outbox 与提交状态必须在同一笔 SQLite 事务中写入。

同一 preview 只能定稿一次。并发 finalize 只有在幂等域、幂等键和 `request_hash` 全部相同时才返回已有版本；内容不同一律返回 409。已定稿图表 PATCH `prediction`、`context` 或版本元数据时返回 409。

### 6.3 修订

新增：

```text
POST /api/charts/:id/revise
```

要求原图表已定稿且仍是该 series 的当前 head。服务端：

1. 创建新的 preview 数据快照；
2. 使用同一 `series_id` 和递增 `revision`；
3. 写入 `supersedes_id = :id`；
4. 按 finalize 的同一套规则定稿；
5. 原版本 JSON 保持不变。

revise 在第一笔预留事务中以 `head_chart_id = :id` 为条件设置 pending head。条件不成立说明已经出现更新版本，返回 409 和最新 head，调用方必须基于最新版本重试；因此同一版本链不允许出现两个子版本。

驾驶舱稳定 URL 默认展示该标的最新版本；带 `?analysis=<id>` 时继续展示指定历史版本。

### 6.4 兼容边界

- v2 上线后，旧 `PATCH /api/charts/:id` 仍可修改 preview 的非预测字段。
- 已定稿 v2 图表禁止修改预测字段。
- v1 图表保持只读，不自动升级为 v2。
- 人工 skill 与应用内 analyst 都必须调用 finalize/revise；不得再绕过统一校验直接写图表。

## 7. 修订语义

同一修订同时有两个视角：

### 7.1 市场判断视角

- 每个版本仍按提交时确定的期限独立完成市场判断评分。
- 后续改口不能取消旧判断，否则会产生通过不断修订规避错误的偏差。
- 默认首页统计只纳入每个“标的—美东交易日”的最早定稿版本。即使调用方错误地新建了多个 `series_id`，也不能通过重复预测放大样本数。
- 修订版本在单独的“修订质量”分组中展示。

### 7.2 交易计划视角

- 修订发生前尚未入场：旧计划结算为 `cancelled_before_entry`。
- 修订发生时已经入场：旧计划停止接受新的柱内触发，并在修订时刻之后第一根可执行 5 分钟 K 线的开盘价结算为 `revised_exit`；若已经到 T1，则结算为 `t1_then_revised_exit`。
- 闭市修订不得使用数小时前的旧报价虚构退出价，而是在所选交易时段下一根可执行 K 线开盘退出。
- 新版本的交易计划从新版本服务端决策时间重新开始。
- 旧计划不会在修订后继续等待未来目标价。

## 8. 机械结算状态机

### 8.1 方向交易计划

```text
waiting_entry
├── entry 触发前先到失效条件 ──> invalid_before_entry
├── 跳空使计划价位顺序失效 ───> gap_invalid_before_entry
├── 修订发生 ──────────────────> cancelled_before_entry
├── entry_expiry 到期仍未成交 ─> no_fill
└── 触及 entry ───────────────> active
    ├── 先到 stop ────────────> hit_stop
    ├── 到时间止损 ───────────> time_exit
    ├── 修订发生 ─────────────> 等待下根可执行开盘 ─> revised_exit
    ├── 同柱先后不可知 ───────> ambiguous
    └── 先到 T1 ──────────────> t1_reached
        ├── 余仓到 T2 ────────> t1_then_t2
        ├── 余仓回保本 ───────> t1_then_breakeven
        ├── 余仓跳空越过保本 ─> t1_then_gap_stop
        ├── 到时间止损 ───────> t1_then_time_exit
        └── 修订发生 ─────────> 等待下根可执行开盘 ─> t1_then_revised_exit
```

规则：

- 只消费完全位于 `decision.server_time` 之后的有效 K 线。对每个周期分别按交易所日历向上取整到下一个可用开盘边界，得到 `eligible_from`。
- 市场数据适配层必须先把 Longbridge 原始时间戳规范化为明确的 `open_time` 和 `close_time`；所有因果判断只使用规范化字段，不能假设原始时间戳天然代表开盘或收盘。交易所半日市、夏令时、节假日和跨夜边界由同一日历模块处理。
- 市场判断只接收 `open_time >= forecast.eligible_from` 的 `horizon.timeframe` K 线；交易计划只接收 `open_time >= trade.eligible_from` 的 5 分钟 K 线。提交发生在半根 K 线中间时，该半根 K 线整根排除，避免把提交前的高低价混入结果。
- 一期统一使用 5 分钟 K 线重放入场、止损和目标先后。
- 每根 K 线先处理开盘跳空，再处理柱内高低价。stop 入场单跳空越过 entry 时按开盘价成交；limit 入场单若开盘价优于 entry，按开盘价成交，否则按 entry 成交。
- 任何订单在确认模拟成交前，都必须用实际 fill 重新检查价位顺序：long 要求 `stop < fill < target1 < target2`，short 要求 `target2 < target1 < fill < stop`。跳空已经越过止损或 T1 时不追价、不补造盈利，终局为 `gap_invalid_before_entry`。
- `close_confirmation` 在指定周期收盘确认 long 的 `close >= entry` 或 short 的 `close <= entry`，然后在下一根可执行 5 分钟 K 线开盘成交；确认柱本身不得用于计算入场后止损或目标。
- 止损遇到不利跳空时按开盘价退出；T1/T2 与时间退出分别按目标价和时间到期 K 线收盘价计算。
- 同柱同时满足“入场与失效”或“入场与退出”等无法确定先后的事件时，同样进入 `ambiguous`，不得假设对绩效有利的路径。
- 同一根 5 分钟 K 线内同时发生多个互斥事件时记为 `ambiguous`，不强制判输赢。
- `ambiguous` 是 `outcome-v2` 的终局。以后若加入 1 分钟 K 线回放，必须以新的 evaluator 版本生成并列结果，不能覆盖 `outcome-v2`。
- `invalid_before_entry` 严格按冻结的 `invalidation_before_entry` 判断。若同一根 K 线同时满足入场与失效且无法从开盘跳空确定先后，结果为 `ambiguous`，不能直接归为入场前失效。
- 交易计划到期按有效 K 线根数判断，不使用自然时间差。

### 8.2 neutral

```text
range_active
├── 任一有效收盘价离开区间 ──> broke_range
└── 累计满 horizon.bars ─────> held_range
```

- 影线越界但收盘回到区间内，不算破区间。
- 默认使用 26 根正常交易时段 15 分钟 K 线表示一个完整交易时段。
- 盘前/盘后 neutral 必须显式选择 `session = all`，并自行指定有效根数。

### 8.3 市场判断

- 市场判断与交易计划同时从服务端决策时间开始。
- 到 `horizon.bars` 后，按最后一根有效收盘价归入 Bear、Base 或 Bull。
- 保存相对决策价格的原始涨跌和方向调整后涨跌。
- `signed_return_pct` 对 long 等于原始涨跌、对 short 取相反数、对 neutral 为 null。
- 市场判断即使没有交易计划也必须正常结算。

## 9. 结局数据模型

```ts
interface NormalizedOutcomeBarV1 {
  timeframe: 'm5' | 'm15' | 'h1';
  session: 'regular' | 'all';
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  source: 'longbridge';
  captured_at: string;
}

interface OutcomeProgressV2 {
  timeframe: 'm5' | 'm15' | 'h1';
  session: 'regular' | 'all';
  eligible_from: string;
  first_time: string | null;
  last_time: string | null;
  count: number;
}

interface PredictionOutcomeV2 {
  chart_id: string;
  prediction_hash: string;
  outcome_sha256: string;
  evaluator_version: 'outcome-v2';
  symbol: string;
  series_id: string;
  revision: number;
  decision_time: string;
  resolved_at: string | null;
  status: 'active' | 'resolved' | 'unjudged_data_gap';
  forecast: {
    status: 'active' | 'resolved' | 'unjudged_data_gap';
    resolved_at: string | null;
    realized_scenario: 'bear' | 'base' | 'bull' | null;
    raw_return_pct: number | null;
    signed_return_pct: number | null;
    probability_score: number | null;
    progress: OutcomeProgressV2;
  };
  neutral: {
    status: 'active' | 'held_range' | 'broke_range' | 'unjudged_data_gap';
    resolved_at: string | null;
    breached_at: string | null;
    breached_side: 'below' | 'above' | null;
    progress: OutcomeProgressV2;
  } | null;
  trade: {
    resolved_at: string | null;
    entered_at: string | null;
    entry_price: number | null;
    exited_at: string | null;
    exit_price: number | null;
    t1_at: string | null;
    t2_at: string | null;
    gross_r: number | null;
    pending_exit_reason: 'revision' | null;
    entry_expiry_bars_observed: number;
    time_stop_bars_observed: number;
    progress: OutcomeProgressV2;
    status:
      | 'waiting_entry'
      | 'active'
      | 't1_reached'
      | 'revised_exit_pending'
      | 't1_then_revised_exit_pending'
      | 'invalid_before_entry'
      | 'gap_invalid_before_entry'
      | 'cancelled_before_entry'
      | 'no_fill'
      | 'hit_stop'
      | 'time_exit'
      | 'revised_exit'
      | 'ambiguous'
      | 't1_then_t2'
      | 't1_then_breakeven'
      | 't1_then_gap_stop'
      | 't1_then_time_exit'
      | 't1_then_revised_exit'
      | 'unjudged_data_gap';
  } | null;
  evidence: {
    schema_version: 'normalized-bar-v1';
    bars: NormalizedOutcomeBarV1[];
    sha256: string;
  };
  data_quality: {
    calendar_version: string;
    expected_intervals_sha256: string;
    gaps: Array<{
      timeframe: 'm5' | 'm15' | 'h1';
      open_time: string;
      status: 'pending' | 'confirmed_halt' | 'confirmed_no_trade' | 'unresolved_missing';
    }>;
  };
  ambiguity: string | null;
  last_evaluated_at: string;
}
```

一期使用 `gross_r`（未计真实买卖价差、滑点和费用的模拟 R），界面不得称为“实际收益”或“净收益”。

`gross_r` 按各批次模拟退出盈亏之和除以冻结的 `risk_amount` 计算。开盘跳空会改变模拟盈亏，但不会事后改变 1R 的分母；T1、余仓和最终退出的仓位比例必须合计为 100%。

结局 JSON 采用临时文件写入后重命名，避免进程中断留下半份文件。`forecast`、可选 `neutral` 和可选 `trade` 分别保存自己的周期、进度与完成时间；`evidence.bars` 按 `timeframe + session + open_time` 去重并保存每根实际参与判断的规范化 K 线，`sha256` 对规范化数组计算。`data_quality` 同时冻结交易日历版本、预期柱序列哈希和所有缺口处置。`outcome_sha256` 对排除该字段本身后的完整规范化 outcome 计算。只有所有必需部分都到达终局，顶层才进入 `resolved` 或 `unjudged_data_gap`。终局结局一旦写入不可覆盖；非终局状态可以按同一 `prediction_hash` 更新进度。

## 10. 主动结算任务

新增独立的 prediction settlement worker（预测结算任务）：

- 正常交易时段在每根完成的 5 分钟 K 线后运行；
- 盘前/盘后只处理 `session = all` 的活动版本；
- 启动时扫描未终局版本并恢复；
- 每次执行先读取已保存进度，只消费新的 K 线；
- worker 先按交易所日历和 session 生成预期柱序列，再与返回数据逐根比对。请求成功但中间缺柱时也必须记录 `pending` 并暂停该预测后续状态推进，不能跳过缺口继续判定；
- 交易所计划闭市不进入预期序列；停牌或确实无成交只有经独立市场状态确认后，才能标记为 `confirmed_halt` 或 `confirmed_no_trade` 并继续。两者不计入 `horizon.bars`、`entry_expiry` 或 `time_stop` 的有效根数；无法确认的缺柱始终按数据缺口处理；
- 每次状态推进都把参与判断的新 K 线与 outcome 一起原子写入；终局复算只读取冻结的 `evidence.bars`，不重新请求当前行情；
- 同一根 K 线重复送达不会重复产生事件；
- 数据源失败时记录 `data_gap` 与下次重试时间，不改变输赢；
- 到观察期限仍有数据缺口时，继续重试一个正常交易日；宽限期后仍无法补齐，终局为 `unjudged_data_gap`。以后若数据恢复，只能由新 evaluator 版本生成并列结果，不能覆盖原结局；
- 查询 `/stats`、`/analyses`、recap 时不再现场拉 K 线并修改结局。

worker 随 app server 进程运行，不要求驾驶舱页面保持打开。server 停止期间不承诺实时结算；下次启动必须先补扫所有活动版本，再进入增量处理。

## 11. 统计口径

### 11.1 市场判断统计

- 标的—交易日样本数与唯一交易日数；
- 已结算覆盖率；
- long / short 固定期限方向正确率；
- Bear / Base / Bull 预测概率与实际发生率；
- Brier 分数（概率误差平方的平均值，越低越好）；
- 情景区间宽度占决策价格比例、占近期正常波动幅度的倍数；
- 原始涨跌与方向调整后涨跌的平均值和中位数。

其中 long 只有期限终点落入 Bull 才记方向正确，short 只有落入 Bear 才记方向正确；neutral 不混入这项比例，按第 11.3 节的全路径守区间口径单独统计。

三分类 Brier 分数固定为 `Σ(p_i - o_i)^2`：概率先除以 100，实际发生的情景取 1，其余取 0，结果范围为 0–2。不同 `horizon.timeframe`、`horizon.bars`、交易时段或区间宽度档不得合并成一个概率分数；默认只在相同 `band_context.policy_version` 内比较。

### 11.2 模拟交易计划统计

- 等待入场、实际触发、未成交到期、入场前失效、跳空导致计划失效；
- 修订前取消、止损、T1 后保本、T1 后跳空止损、T1 后 T2、时间退出、修订退出；
- ambiguous 数量；
- 平均和中位 `gross_r`；
- 只在真正触发入场的样本中计算交易胜率。

### 11.3 neutral 统计

- 守区间 / 破区间；
- 区间宽度占决策价格比例；
- 实际观察 K 线根数；
- normal session 与 all session 分开统计。

neutral 守区间率必须同时按 `width_in_volatility_units` 分档展示，禁止脱离区间宽度给出一个总胜率。

### 11.4 数据质量统计

所有界面必须同时展示：

- 总预测数；
- 唯一 `session_date` 数量及单日样本最高占比；
- v2 合格样本；
- 已结算；
- 活动中；
- 未成交；
- 无法判断；
- 同柱顺序不明；
- 从 submission audit 读取的重复提交被去除数量和同键内容冲突数量；
- legacy v1 数量；
- `gross_r` 的实际样本数。

### 11.5 分组与样本门槛

统计至少支持：

- 首次预测 / 修订；
- manual / analyst；
- long / short / neutral；
- regular / all；
- catalyst / calm / unknown；
- `horizon.timeframe + horizon.bars`；
- scenario band 宽度档；
- `rule_version`；
- 单标的与全局。

默认总览的独立样本键固定为“标准化标的 + `session_date`”，只取最早定稿的 v2 版本。所有后来版本仍保留并结算，但只能进入修订质量或全版本明细，不能增加默认总览的分母。

出现以下任一情况时，统一视为“样本不足”：少于 30 个“标的—交易日”样本、少于 20 个唯一 `session_date`，或任一交易日占样本超过 20%。同一天多只高度相关股票不能被当成完全独立的观察。

- 展示原始计数；
- 明确标记“样本不足”；
- 不展示带结论性质的总胜率徽章；
- 概率校准图同时显示样本数。

以后展示误差范围时，必须按 `session_date` 整日分组重抽样，保留同日多标的之间的共同市场影响，不能逐条独立抽样。

## 12. 与人工 skill 和应用内 analyst 对齐

`intraday-signal` 是分析纪律的唯一规则源，但提交契约由服务端 API 强制执行。

### 12.1 人工流程

```text
读取 lessons / 消息 / 事件 / 板块 / 仓位
→ POST preview
→ 形成预测、行动和交易计划
→ POST finalize
→ 写 journal
```

盘中重评使用 revise，不再 PATCH 原预测。

### 12.2 应用内 analyst

- 先读取 `intraday-signal` skill；
- 使用与人工流程相同的数据包和 finalize/revise API；
- 不再持有另一份独立的预测规则；
- X 不可用时必须写入“X 未查”；
- 必须接入财报与宏观事件、板块 ETF、账户快照、context 和 journal；
- 自动升级只发提醒，完整重评由用户手动触发；
- 成功定稿后重置或刷新 commentator 会话中的预测基线。

### 12.3 现有设计的调整

`2026-07-09-analyst-skill-alignment-design.md` 中以下部分保留：

- SKILL.md 作为唯一分析纪律源；
- API 层统一校验；
- 手动触发完整 analyst；
- 自动升级只发提醒；
- journal、recap、lessons 归一。

以下部分由本设计替代：

- `/api/overview/stats` 继续复用旧 `aggregateStats`；
- 通过 PATCH 同一 chart 写入或修订预测；
- 旧 `outcomes` 作为新的唯一机械口径。

实施顺序改为：先完成预测版本和 outcome v2，再进行 analyst 对齐。

## 13. UI

### 13.1 预测页

新增：

- “首次预测 / 第 N 次修订”标记；
- 服务端决策时间与报价时间；
- 观察期限和交易时段；
- 市场判断与行动建议分栏；
- 当前结算状态；
- 指向被替代版本和新版本的链接。

已定稿预测页面不提供编辑入口。

### 13.2 历史页

按 `series_id` 折叠显示版本链：

```text
MU · 2026-07-10
├── v1 long · 10:00 ET · 已结算
├── v2 neutral · 11:30 ET · 修订退出
└── v3 short · 13:15 ET · 活动中
```

每一版分别显示市场判断结局和交易计划结局。

### 13.3 统计页

- 默认只看 v2 首次预测；
- 修订质量、legacy v1、manual/analyst 放在独立筛选项；
- 命中率旁必须显示分子、分母和覆盖率；
- `unjudged`、`ambiguous` 不得隐藏；
- 旧 90% 数据标为“legacy，仅供回看，不纳入 v2”。

## 14. 历史迁移

### 14.1 v1 图表

- 保留原文件和原 URL；
- 原 v1 JSON 字节保持不变；`rule_version = legacy-v1` 只作为 SQLite 派生字段和 API envelope 元数据返回，不写回旧文件；
- 不补造服务端决策时间；
- 不生成 v2 概率或交易绩效；
- 不进入 v2 默认统计。

### 14.2 旧 outcomes

- 保留旧表供旧页面回看；
- v2 使用新的 outcome 文件和索引表；
- 不将旧 `hit_target/hit_stop` 自动转换为 v2 结局；
- UI 明确展示旧结果只是“锚点后价位触碰记录”。

### 14.3 journal 与 lessons

- 建立 `journal/lessons.md`，包含“现行教训”和“已固化规则”两个区块；
- v2 每次运行在 journal 中抄写 v2 统计，不再使用旧总胜率；
- 盘后 recap 从同一 v2 聚合函数读取；
- journal 继续追加，不覆盖旧日记录。

## 15. 错误与并发处理

- finalize/revise 使用数据库事务和唯一约束保护版本号、提交预留和幂等键；文件与数据库之间的中断由启动恢复处理，不宣称跨存储事务。
- JSON 使用同目录临时文件后重命名，避免半写入。
- 同一 preview 并发 finalize，只有同幂等域、同幂等键、同 `request_hash` 的重试返回已有版本；其他请求返回 409，不得静默归并不同预测。
- 同一 series 并发 revise 通过 `head_chart_id` 条件更新和 pending head 保证线性；失去 compare-and-swap 的请求返回 409，不得形成同父分叉。
- 市场报价缺失时 finalize 返回可重试错误，不使用调用方虚构价格。
- 最新已完成锚点 K 线无法确认时，不允许定稿。
- 结算任务失败不会把活动预测标为输或赢；它保留进度并重试。
- SQLite 索引与 JSON 不一致时，以 JSON 为准重建索引并记录诊断。
- 每次加载定稿 ChartDoc 都重新计算 `prediction_hash`；哈希不匹配的文件进入隔离状态，不结算、不统计。outcome 的 `prediction_hash` 和 `evidence.sha256` 也必须分别校验。
- settlement worker 只消费 committed outbox；投递与处理都必须幂等，进程在确认前退出时允许重复投递但不得重复计数。
- 多 worker 通过 chart 级租约和 `prediction_hash + last_evaluated_at` 条件更新保护 outcome 进度；失去租约或版本比较失败的 worker 放弃写入并重读，不允许后写覆盖较新进度。
- 精确标的查询使用标准化后的全等比较，不再使用子串匹配。

## 16. 测试策略

### 16.1 预测校验

- 服务端时间不可由请求覆盖；
- 未来或历史调用方锚点不参与计分；
- 决策发生在半根 K 线中间时，该 K 线不得进入任何判定；
- Longbridge 原始 K 线时间戳经过适配后具有正确的开盘和收盘时间；
- 概率不等于 100 时拒绝；
- Bear/Base/Bull 边界倒置时拒绝；
- 决策价不在 scenario band 内、任一侧距离超出允许波动倍数时拒绝；
- direction 与最高概率情景不匹配时拒绝；
- scenario band 过窄或过宽时拒绝，并冻结服务端计算的宽度；
- 日历外重大公告或政策消息会进入 catalyst，消息覆盖不完整时不会误标为 calm；
- neutral 缺区间时拒绝；
- `action = enter` 缺交易计划时拒绝；
- `action = enter` 时账户快照必须由服务端实时读取；调用方伪造账户数值或长桥读取失败时拒绝；
- 缺少入场订单类型、T1 减仓比例或结构化 T1 后止损规则时拒绝；
- stop/limit/close confirmation 与决策价方向不符，或 T1/T2 同价时拒绝；
- T1 收益风险比不足 1:1 时拒绝；
- 同幂等键同 `request_hash` 返回同一版本；同键不同内容返回 409，并分别留下审计记录。

### 16.2 不可变版本

- finalized 图表拒绝 PATCH 预测；
- revise 创建新 ID，旧 JSON 字节不变；
- 版本链、revision 和 supersedes_id 正确；
- 并发 finalize 不静默归并不同内容；并发 revise 不产生重复版本或同父分叉；
- `prepared` 无文件、最终文件无索引、committed 无 outbox 和缺 submission audit 四类中断都能恢复。

### 16.3 状态机

- 未触及 entry 前触及 stop，结果是 `invalid_before_entry`，不是亏损；
- 开盘跳空导致实际 fill 越过 stop 或 T1 时，结果是 `gap_invalid_before_entry`，不是成交或盈利；
- 到期未触及 entry，结果是 `no_fill`；
- 等待入场时发生修订，结果是 `cancelled_before_entry`；
- 入场后依次命中 stop、T1、T2、保本和时间退出；
- T1 后余仓跳空越过保本位时按开盘价退出并记录 `t1_then_gap_stop`；
- stop/limit 入场与开盘跳空按冻结规则得到确定成交价；
- close confirmation 只在确认柱之后的下一根可执行开盘成交；
- 同柱触及互斥事件时为 `ambiguous`；
- 修订前未入场和已入场分别正确结算；
- neutral 按有效 K 线根数结算；
- 周末和隔夜自然时间不会提前完成 neutral；
- 夏令时切换、交易所半日市和节假日不会造成多算或少算 K 线；
- regular/all 只消费各自允许的 K 线。
- 闭市修订不使用旧收盘价，等待下一根可执行开盘完成修订退出。
- 请求成功但预期序列中间缺柱时暂停推进；确认停牌、无成交和计划闭市分别得到正确处理。

### 16.4 可复现性

- 同一预测和同一组 K 线，无论何时调用统计，结局完全相同；
- 只使用 outcome 中冻结的 K 线证据即可重放出相同结局；供应商后续修订同一历史 K 线不会静默改写旧结果；
- 页面从未打开也能由 worker 完成结算；
- 进程重启后从保存进度继续；
- 两个 worker 重复收到同一任务时不重复消费 K 线，也不覆盖较新的 outcome 进度；
- 旧 K 线滚出市场数据窗口后，已保存结局不丢失；
- ChartDoc、prediction hash、outcome hash 或证据 hash 不匹配时样本被隔离并从统计中排除；
- v1 legacy 标记只存在于索引或 API envelope，旧 JSON 字节完全不变；
- outcome 的涨跌取结算时刻或期限终点，不取查询时最后报价。
- forecast、neutral 和 trade 使用各自的周期进度，完成时间互不覆盖。

### 16.5 统计

- 首次预测和修订不会混算；
- 同一标的同一 `session_date` 即使出现多个 series，默认总览也只计最早版本；
- v1 不进入 v2 默认统计；
- 未成交、无法判断和 ambiguous 分母展示正确；
- 交易胜率只使用已入场样本；
- `gross_r` 样本数单独显示；
- 概率误差按三个情景正确计算，且不同期限和区间宽度档不会误合并；
- neutral 结局保存破区间时间、方向和观察根数；
- day type 与重复提交统计都能追溯到持久记录。
- 同日多标的不能单独跨过样本门槛，误差范围按交易日整体重抽样。

### 16.6 端到端

- 人工 preview → finalize → worker → outcome → stats；
- analyst preview → finalize/revise → journal → outcome → recap；
- Cockpit 默认最新版本，固定 analysis URL 展示旧版本；
- 完整 server/web 类型检查和测试通过。

## 17. 分阶段上线

### 阶段 0：隔离旧统计

- 将当前战绩标记为 legacy；
- 界面撤下可信绩效表述；
- 建立 `journal/lessons.md`；
- 用固定样本确认 Longbridge 各周期原始时间戳语义，并建立统一的 `open_time` / `close_time` 适配层；
- 先修复并记录当前 server/web 完整测试中的既有失败，建立全绿基线；与预测流无关的修复应作为独立的准备提交，避免混入 v2 业务改动。

### 阶段 1：预测契约与不可变版本

- 新增 v2 类型、校验、finalize/revise、幂等键和原子持久化；
- UI 支持版本元数据和只读历史；
- 此阶段暂不显示 v2 战绩。

### 阶段 2：机械结算

- 新增状态机、带冻结 K 线证据的 outcome JSON、SQLite 索引和主动 worker；
- 支持恢复、数据缺口与同柱顺序不明；
- 旧查询路由停止现场结算 v2。

### 阶段 3：统计与驾驶舱

- 新增市场判断、交易计划、neutral 和数据质量四组统计；
- 增加概率校准、版本筛选和样本门槛；
- recap 和 journal 读取同一聚合函数。

### 阶段 4：统一生产线

- 更新 `intraday-signal`、`chart` 和应用内 analyst；
- 接入完整事件、板块、仓位、context 和 journal；
- 自动升级只发提醒；
- commentator 在新版本生成后刷新预测基线。

### 阶段 5：可选真实成交账本

- 读取长桥真实成交、费用和持仓变化；
- 实盘结果与模拟结果分别存储、分别展示；
- 只有实际成交才计算净收益。

## 18. 验收标准

v2 上线必须同时满足：

1. 调用方无法回填或未来设置计分起点。
2. 未成交计划永远不会记为目标或止损。
3. 方向交易与 neutral 都有固定、可复算的期限。
4. 修订不会覆盖旧预测，也不会继承旧缓存。
5. 同一数据在不同查询时刻得到完全相同的结局。
6. 不打开页面也能正常结算，重启后可以恢复。
7. 生成、显示和结算使用同一交易时段。
8. manual 与 analyst 使用同一提交 API 和同一校验。
9. v1 不进入 v2 默认战绩。
10. 统计完整展示样本覆盖、无法判断、重复和 ambiguous。
11. 模拟 R 明确标为毛收益，不冒充实盘净收益。
12. server/web 类型检查和完整测试全部通过。
