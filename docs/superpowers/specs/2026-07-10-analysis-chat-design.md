# 分析追问对话（AI Chat）设计

日期：2026-07-10
状态：待评审

## 背景与目标

现在点「重新分析」后，analyst agent 跑完一轮就结束：拿数据包、拉 K 线、写点评、提交预测落图，全程单向输出。用户没法追问「为什么判断会下破」「现在盘面变了怎么看」。

本功能给每一次 intraday 分析挂一个可持续的对话会话：分析跑完之后，用户可以带着这份分析的完整上下文和 AI 继续聊，AI 能现拉最新数据回答，但不能修改已归档的预测。

## 需求决策（已与用户确认）

| 维度       | 决策                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 会话定位   | 挂在单次分析（chart）上，一次分析一个会话；换分析即新会话                              |
| AI 能力    | 带工具的问答：可拉数据包 / K 线 / 新闻回答追问；**不可改预测、不可写点评**             |
| UI 位置    | cockpit 右侧栏最底部固定输入框；有会话时聚焦即向上抽出面板，无会话时先聚焦、发送后展开 |
| 持久化     | 消息存 SQLite；旧分析的会话可回看也可继续聊                                            |
| 呈现       | 流式输出 + 工具活动可见（「正在拉 15 分钟 K 线…」）                                    |
| 服务端状态 | 无状态回合制：每轮从 DB 读历史重建 agent，跑完写回，内存不养会话                       |

## 非目标

- 不做全局助手 / 跨 symbol 对话。
- 对话不能重新提交预测——更新结论走「重新分析」，生成新分析、新会话。
- 不做会话改名、删除接口。
- sepa 图和无分析页不提供对话。
- 前端不加测试（沿用 repo 现状：只有 server 测试）。

## 数据模型

新增两张表。同时确立全库规则：**凡是数据库自己生成的行 id 一律 snowflake（text 存十进制字符串）**；chart 的日期-slug id 是外部语义标识（文件名 / URL / journal 引用），不在此列。

```ts
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    chartId: text('chart_id').notNull().unique(),
    symbol: text('symbol').notNull(),
    title: text('title').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('chat_sessions_symbol').on(t.symbol)],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    ts: text('ts').notNull(),
    role: text('role').notNull(),
    payload: text('payload', { mode: 'json' }).$type<AgentMessage>().notNull(),
  },
  (t) => [index('chat_messages_session').on(t.sessionId)],
);
```

要点：

- `payload` 存 pi-agent-core 的 `AgentMessage` 原生结构，回放进 agent 零转换；`role`（`user` / `assistant` / `toolResult`）从 payload 冗余出来供 SQL 直查。
- 消息排序用 `(ts, id)`：同毫秒内 snowflake 位数相同、字符串序即数值序；跨毫秒由 ts 决定。
- 展示层（气泡、工具状态行）从 payload 现场派生，不另存展示副本。
- `title` 初始取会话第一条提问的前 40 个字符；面板头部展示，并为将来「按 symbol 列历史会话」预留。
- 接受的风险：pi-agent-core 升级若改动消息格式，旧会话可能无法续聊（最坏退化为只读展示）。不加版本兼容层。

### snowflake 生成器

`server/src/db/snowflake.ts`：41 位毫秒时间戳 + 12 位单进程序列，不引外部依赖，输出十进制字符串。所有新发行 id 统一走这里。

### 存量表迁移

- `comments.id`、`ai_usage.id`：自增整数 → snowflake text。两者均无外部引用（前端点评去重用 `ts + text`），迁移重建表拷贝数据，新 id 由 ts 推导时间位、旧自增 id 填序列位，保持原有时间序。
- `chart_meta.id`、`outcomes.chart_id`：保持 chart slug 不动。
- 迁移由 drizzle-kit 生成、启动时自动执行，与现有机制一致。

## 通用 agent 管线（本次一并抽象）

`server/src/ai/` 现有 4 个 agent 模块（analyst / commentator / deepDive / eventFilter），通用逻辑各自实现了一遍：`defaultAgentFactory`（`new Agent` + codex key + thinkingLevel）4 份几乎逐字相同；`runWithTimeout` + 私有 `TimeoutError` 3 份逐字拷贝（eventFilter 没有超时，属隐患）；`{prompt, abort}` 接口与 factory 类型 3–4 份；忙锁 3 种写法；模型解析 2 种写法。chat 不做第 5 份拷贝，改为先抽底座、chat 生在底座上。

### `server/src/ai/agentSession.ts`

函数式 helper（不做 Manager class，与 repo 风格一致）：

```ts
createAgentSession({
  layer, symbol, origin?,        // 用量记录（attachAiUsageLogger）
  model, systemPrompt, tools,
  messages?,                      // 历史回放，走 initialState.messages（chat 用）
  agentFactory?,                  // 测试注入缝，类型全库统一为 AiAgentFactory
  onEvent?,                       // 原样透传 AgentEvent（chat 翻译成 ws 推送）
}) → { agent, runTurn(prompt, timeoutMs), isDone() }
```

一处收拢：Agent 构造、用量记录挂载、超时 + abort（全库唯一的 `AgentTimeoutError`）、`isDone()` 供工具做「超时后 skipped」守卫。commentator 的跨轮会话缓存不受影响——保留 `agent` 句柄跨 run 复用即可。

### `server/src/ai/runLock.ts`

keyed 忙锁小工具（十行级），替代 `runningAnalysts` / `runningCommentators` / deepDive `state.running` 三种手写。

### 模型解析统一

`aiConfig()` 扩展为 `commentModel` / `analystModel` / `deepDiveModel` / `chatModel`（`AI_CHAT_MODEL`，未配置回退 `analystModel`），deepDive 的内联 env 读取并入。

### `server/src/ai/dataTools.ts`（共享只读数据工具）

```ts
buildDataPackTool(symbol, { buildPack, onPack? })   // onPack 钩子：analyst 借它从 pack 带出 chartId，chat 不传
buildKlineTool(symbol, fetchKline)                   // period 白名单与 count 上限收敛逻辑随之共享
buildNewsTool(symbol, fetchNews)
```

- 缓存语义靠「每次构建一套工具实例」天然解决：analyst 每 run 建一套（pack 缓存一个 run），chat 每轮建一套（缓存一轮，跨轮必然拿新数据）。
- 写入类工具不共享：`submit_prediction` / `append_comment` 留在 analyst，`submit_comment` 留在 commentator，bash / 文件工具留在 `deepDiveTools.ts`。chat 只组装三个只读工具，物理上拿不到写入能力。

### 迁移范围

- 本次：chat 直接用新底座；analyst（抽工具必须动它）与 eventFilter（顺手补上超时保护）一并迁移。
- 随后各自独立 commit：commentator、deepDive。
- 四个模块都有现成测试；factory 注入缝保留，测试假 agent 不需重写。

## 服务端

### 对话回合：`server/src/ai/chat.ts`

`runChatTurn(chartId, text)` 流程：

1. 读 chart 文档（必须是 intraday，否则 404）；按 `chart_id` 查会话，没有则创建（发 snowflake id，title 取提问前 40 字）。
2. 立即把用户消息写入 `chat_messages`——即使本轮失败提问也入档。
3. 组装 system prompt（对话模式分析员）：
   - 上下文：symbol、分析创建时间、冻结的预测 JSON（direction / anchor / entry_plan / scenarios / range_plan）、分析当日（按 chart 创建日期，非聊天当日）的 analyst 点评。
   - 纪律：中文白话；不修改已归档预测；引用数字必须说明是分析时点快照还是刚拉的实时数据；不给仓位建议；拿不到数据就明说。
4. 经 `createAgentSession` 建会话：模型取 `aiConfig().chatModel`；`messages` 传 DB 读出的全部历史；`onEvent` 翻译事件为 ws 推送（见下）；用量记录 layer `"chat"`（扩展 `AiUsageLogContext`）。
5. `runTurn(text, timeoutMs)` 跑一轮，单轮超时 3 分钟。
6. 回合结束：取 `agent.state.messages` 相对回放起点的增量，连同 `updatedAt` 在一个事务里写回 DB。

工具只给 `dataTools.ts` 的三个只读工具：`read_data_pack` / `fetch_kline` / `fetch_news`。

并发：`runLock` 按 chartId 加锁，同一会话同时只跑一轮。

### HTTP 接口

- `GET /api/charts/:id/chat` → `{ session, messages, busy, partial }`：session 元信息（无会话为 null）、派生的展示消息列表、是否有回合在跑、进行中回答的已产出文字。
- `POST /api/charts/:id/chat/messages` `{ text }` → `202 { accepted: true }`；`409` 回合在跑；`503` 两个模型环境变量都没配；`404` chart 不存在或非 intraday。

### 实时推送

`/api/ws` 多路复用连接新增 `chat` channel，按 chartId 订阅。事件（骑在现有 `{type:"data", data}` 信封里）：

- `{ event: "delta", text }` — 回答文字增量（来自 `message_update`）。
- `{ event: "tool", label, status: "start" | "end" }` — 工具活动（来自 `tool_execution_start/end`）。
- `{ event: "done" }` — 本轮完成，客户端以此解锁输入。
- `{ event: "error", message }` — 本轮失败或超时。

订阅时服务端补发 `{ event: "init", busy, partial }`：中途刷新页面能接上正在进行的回答，不丢字。进行中回答的文字缓冲由 chat 模块在内存里维护（仅回合期间存在，不落库）。

## 前端

### 组件

- **`ChatDock`**（`web/src/pages/cockpit/chat/ChatDock.tsx`）：右侧栏最底部固定输入条。收起态只有输入框；展开态从输入框向上抽出 `ChatPanel` 盖住 tab 区。交互：
  - 无会话：点击仅聚焦，发送第一条后自动展开。
  - 有会话：聚焦输入框即展开。
  - 面板头部：title + 所属分析时间（「关于 HH:MM 的分析」）+ 收起按钮。
  - 回答进行中输入框禁用并显示 spinner。
  - sepa 图、无分析页不渲染。
- **`ChatPanel`**：消息列表。用户消息右对齐气泡；AI 回答用现有 markdown 渲染（复用 `pages/cockpit/markdown.tsx`）；工具活动灰色小字行；流式文字尾部带光标。
- **`useChatSession(chartId)`**：GET 拉存档 → 订阅 `{kind:"chat", chartId}` → `send()` 发 POST → 拼接 delta / 工具状态 / done / error 到本地消息状态。chartId 变化（时间线切换分析）即整体重置到对应会话。

### 展示派生规则

- `user` payload → 用户气泡。
- `assistant` payload 的文字块 → markdown 段；其中的 toolCall 块 → 工具状态行（用工具 label）。
- `toolResult` payload → 不展示（结果体积大且是给模型看的）。

## 错误处理

- POST 失败：输入框下方一行提示——`409` 「上一条还在回答中」、`503` 「未配置 AI_CHAT_MODEL / AI_ANALYST_MODEL」、网络错误原样透出。
- 回合失败 / 超时：提问已入档；面板插入一条错误行；用户可直接重发。
- ws 掉线：沿用现有 degraded 机制显示重连提示，重连后重新 GET 对齐存档。
- 服务器重启：进行中回合丢失（无 done 事件）；ws 重连后订阅补发的 `init` 带 `busy: false`，客户端据此解锁输入，不需要另设计时器；历史消息完好（该轮提问已入档、无回答）。

## 测试

服务端 vitest（仿 `analyst.test.ts` 的假 agent factory 手法）：

- 存储：会话创建 / 消息追加 / `(ts, id)` 排序读取；snowflake 唯一性与单调性。
- 回合：历史消息正确回放进 `initialState.messages`；system prompt 含预测上下文；用户消息先行入档；回合结束增量写回；超时 abort。
- 事件：agent 事件正确翻译为 delta / tool / done / error 推送；订阅补发 init。
- 接口：非 intraday 404、无模型 503、并发 409、正常 202。
- 工具面：对话 agent 拿不到 `submit_prediction` / `append_comment`。
- 迁移：comments / ai_usage 迁移后行数一致、顺序保持。
- 管线：`createAgentSession` 的超时 abort、factory 注入、`messages` 回放、`onEvent` 透传；`dataTools` 的 count 上限与 pack 单实例缓存。
- 回归：analyst / eventFilter（及后续 commentator / deepDive）迁移到新底座后，各自现有测试保持全绿。

## 落地文件一览

| 位置                                         | 内容                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `server/src/db/schema.ts`                    | 新增 `chatSessions` / `chatMessages`；comments / ai_usage 主键改 text |
| `server/src/db/snowflake.ts`                 | snowflake 生成器                                                      |
| `server/drizzle/*`                           | 新迁移（建表 + 存量 id 迁移）                                         |
| `server/src/ai/agentSession.ts`              | 通用 agent 管线（构造 / 超时 / 用量 / 事件 / 回放）                   |
| `server/src/ai/runLock.ts`                   | keyed 忙锁                                                            |
| `server/src/ai/dataTools.ts`                 | `read_data_pack` / `fetch_kline` / `fetch_news` 共享实现              |
| `server/src/ai/models.ts`                    | `aiConfig()` 扩展 `deepDiveModel` / `chatModel`                       |
| `server/src/ai/analyst.ts`、`eventFilter.ts` | 迁移到新底座（commentator / deepDive 随后独立 commit）                |
| `server/src/ai/chat.ts`                      | `runChatTurn`、system prompt、事件翻译                                |
| `server/src/ai/chatStore.ts`                 | 会话 / 消息读写                                                       |
| `server/src/routes/chat.ts`                  | GET / POST 接口                                                       |
| `server/src/routes/ws.ts`                    | `chat` channel                                                        |
| `web/src/pages/cockpit/chat/ChatDock.tsx` 等 | ChatDock / ChatPanel / useChatSession                                 |
| `server/test/chat*.test.ts`                  | 上节测试                                                              |
