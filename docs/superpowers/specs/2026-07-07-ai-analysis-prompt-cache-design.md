# AI 分析执行策略优化：提高 prompt cache 命中率

日期：2026-07-07
状态：已确认设计，待实现

## 背景与问题

盘中 AI 分析是两层 agent：

- **Commentator**（`apps/server/src/ai/commentator.ts`）：调度器（`scheduler.ts`）每 60 秒一个 tick，某个 symbol 触发信号或到 5 分钟心跳时运行一次，输入是 `JSON.stringify({ pack, trigger })` 整包快照。
- **Analyst**（`apps/server/src/ai/analyst.ts`）：Commentator 升级（escalate）或手动 reassess 时运行，带 5 个 tool，30 分钟升级冷却。

系统没有应用层的 AI 结果缓存，唯一的缓存是 pi-ai 内置的 Anthropic prompt cache（前缀缓存）。当前命中率极低，原因：

1. `CommentPack` 带 `as_of` 时间戳和实时报价/K 线/资金流，紧跟在静态 system+tools 前缀之后，第一条用户消息每次都不同，前缀立刻分叉。
2. 每次运行都新建 Agent、新开对话，跨次运行的历史无法复用。
3. `PI_CACHE_RETENTION` 未设置，默认 5 分钟 TTL；同一 symbol 两次运行间隔经常超过 5 分钟，连静态前缀都过期。
4. 多 symbol 顺序轮询，互相冲刷缓存。

## 方案总览

三项改动组合：

- **a.** 缓存保留时长调到 1 小时（`PI_CACHE_RETENTION=long`）。
- **b+c.** Commentator 改为每 symbol 一个常驻会话，全量 pack 只发首条消息，之后每次只发紧凑增量更新——历史对话整体成为可命中的缓存前缀。
- Analyst 不做会话复用（间隔远超 TTL、收益近零、有旧推理污染风险），保持现状。

## 设计细节

### a. 缓存保留时长

在服务入口（`apps/server/src/index.ts`）尽早设置：

```ts
process.env.PI_CACHE_RETENTION ??= 'long';
```

pi-ai（`anthropic-messages.js` 的 `resolveCacheRetention`）读到 `long` 后使用 1 小时 TTL。代价：1h 缓存写入单价约 2 倍 input 价（5m 是 1.25 倍），但配合增量更新后每次写入量很小。用 `??=` 保留用户显式覆盖的能力。

### b+c. Commentator 会话池与增量更新

#### 会话池

`commentator.ts` 新增模块级会话池：

```ts
interface CommentatorSession {
  agent: CommentatorAgent;
  easternDate: string; // 会话所属交易日
  runCount: number; // 累计运行次数
  sentChars: number; // 累计发送字符数（膨胀保护）
  lastBarTime: string | null; // 已发送的最后一根 m5 bar 时间
}
const sessions = new Map<string, CommentatorSession>();
```

- 首次运行（或会话失效后）：创建 Agent，发送**全量** `CommentPack`（现有格式），记录 `lastBarTime`。
- 后续运行：复用 Agent，发送**增量更新**消息（见下）。

#### 增量更新消息

`datapack.ts` 新增纯函数：

```ts
export function buildCommentUpdate(pack: CommentPack, lastBarTime: string | null): CommentUpdate;
```

`CommentUpdate` 只含盘中会变的字段：

- `as_of`、`quote`、`rel_volume`
- `m5.bars`：只保留 `time > lastBarTime` 的新 bar（`lastBarTime` 为 null 时回退到全量尾部）
- `m5.macd`：与新 bar 对齐的尾部切片
- `flow`：尾部 10 条（新常量 `UPDATE_FLOW_ROWS = 10`）
- `day_levels`：只带盘中会变的 `opening_range`（`prev_day`、`pre_market` 开盘后不变，已在首条消息里）

明确**不含**：`prediction`（当天不变，首条已有）、`recent_comments`（agent 自己写的点评已在对话记录里）。

Commentator 的 prompt 文本：

- 首条：`JSON.stringify({ pack, trigger })`（现状不变）
- 增量：`JSON.stringify({ update, trigger })`

两者都过 `truncateForPrompt`（沿用 `MAX_PROMPT_CHARS = 24_000`）。

#### tool 处理

`submit_comment` 的 name/description/schema 保持逐字节不变（tool 定义参与缓存前缀）。每次运行前用 `agent.state.tools = [tool]` 换上绑定了本次 trigger 文本和 escalate 回调的新实例——定义不变、闭包更新，缓存前缀不受影响。

#### 会话生命周期

| 事件                                        | 处理                                       |
| ------------------------------------------- | ------------------------------------------ |
| 交易日变化（`easternDate(now)` ≠ 会话记录） | 丢弃会话，新建并重发全量 pack              |
| 运行抛错 / 超时                             | 丢弃会话（避免脏对话记录），下次重建       |
| `runCount > 40` 或 `sentChars > 120_000`    | 丢弃会话重播种（防对话无限膨胀）           |
| 服务重启                                    | 会话池是内存态，自然丢失，首次运行重新播种 |

`runningCommentators` 并发守卫、escalate 冷却逻辑均不变。

#### 模型/配置变化

若 `deps.model` 与会话创建时不同，丢弃会话重建（模型切换后旧缓存无意义）。

### Analyst

不改执行结构。收益来自 a（多轮 tool 循环内部的前缀缓存本来在工作，1h TTL 对手动连续 reassess 也有帮助）。

## 观测与验收

- `usage.ts` 已记录 `cacheRead` / `cacheWrite`。验收指标：改动上线后，commentator 层的 `cache_read / (input + cache_read)` 显著上升（预期从接近 0 升到高位，因为历史对话整体命中）。
- commentator 每次运行结束追加一行日志：本次 `cacheRead` / `input` token 数，便于盘中肉眼确认。

## 测试计划

沿用现有 fake `agentFactory` 注入模式：

1. **会话池**（`commentator` 单测）：
   - 首次运行发全量 pack；
   - 第二次运行复用同一 agent 实例，消息为增量格式；
   - 跨交易日重建会话；
   - 运行抛错后会话被丢弃、下次重建；
   - `runCount` / `sentChars` 超阈值后重播种；
   - model 变化后重建。
2. **`buildCommentUpdate`** 纯函数单测：新 bar 截断、`lastBarTime` 为 null 的回退、字段裁剪（无 prediction / recent_comments）。
3. 运行 `pnpm test` 保证既有用例不回归。

## 不做的事（明确出界）

- 不给 AI 分析结果做应用层缓存（结论依赖实时行情，缓存结果无意义）。
- 不改 Analyst 的会话结构、冷却、超时。
- 不改调度节奏（60s tick、5 分钟心跳、触发器逻辑）。
