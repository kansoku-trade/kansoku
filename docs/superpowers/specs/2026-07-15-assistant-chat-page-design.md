# 独立 AI Chat 页面（assistant）设计

日期：2026-07-15
状态：待用户批准

## 目标

在 web 应用里新增一个独立的 `/chat` 页面，承载不挂任何图表或研究文档的通用 AI 会话，体验对齐 Claude Code：全套 agent 能力（只读 bash、读仓库文件、读 skill、搜研究库）、多会话管理、流式回复、工具调用过程可展开、忙时排队追问、用量可见、@ 引用仓库文件。

## 非目标

- 不改动现有图表追问（chart chat）和研究追问（research chat）的行为与接口。
- 不做写文件、下单等有副作用的工具；bash 沿用现有只读防护。
- 不做会话搜索、会话导出、多端同步以外的高级管理功能。
- 不做客户端把 @ 文件内容注入上下文——由模型用读文件工具自取。

## 总体方案

复用现有对话基建，作为 `createConversationEngine` / `createConversationStore` 的第三个实例（前两个是 chart chat 和 research chat）。会话的 key 就是 sessionId 本身。

## 1. 数据与后端核心（`app/packages/core`）

### 数据

- 新表 `assistant_sessions`：`id / title / created_at / updated_at`，新增一个 drizzle migration。
- 消息复用现有 `chat_messages` 表，按 `session_id` 关联。

### 新模块

- `src/ai/assistantChatStore.ts`：用 `createConversationStore` 实例化，`keyColumn = id`；另提供 `listSessions`（按 `updatedAt` 倒序）、`deleteSession`（连带删该会话的 `chat_messages`）。
- `src/ai/assistantChat.ts`：用 `createConversationEngine` 实例化，key = sessionId。`usage.ts` 的 `layer` 联合类型加 `"assistant"`。
- `src/modules/research/…` 之外新建 `src/modules/assistant/assistantChat.service.ts`：组装 deps（model、rootDir、db），暴露 list / create / delete / getChat / postMessage / abort。

### system prompt

- 走 `composeWithDiscipline` 注入 trading-discipline（与 analyst / deepDive / chat 相同机制）。
- 正文声明角色：仓库级通用研究助手；可以跑只读命令（含 `longbridge` CLI 和 skill 脚本）、读仓库文件、读 skill、搜研究库；用户消息里出现 `@路径` 时用读文件工具读取该文件再回答；引用结论要写明文件路径。

### 工具集

- `agentTools`：bash（现有只读防护 + 超时 + 截断）、read_file、read_skill。
- research 库的 `search_research_documents` / `read_research_document`（从 `researchChat.ts` 抽出复用或同构新建）。
- 不带 per-symbol 的 datapack/news 工具；行情通过 bash 跑 `longbridge` CLI，与 Claude Code 同路径。

### 用量汇总

- `getChat` 返回值附带本会话累计用量：从 `chat_messages` 的 payload 里读 `usage` 字段累加（复用 `usage.ts` 的解析判定逻辑），返回 `{ totalTokens, costTotal, calls }`。

## 2. 接口层

- **contract**：新 `src/contract/assistant.ts`：
  - `listSessions(): { sessions: AssistantSessionMeta[] }`
  - `createSession(input: { title?: string }): AssistantSessionMeta`
  - `deleteSession(input: { id: string })`
  - `getChat(input: { id: string })`：session + messages + busy + partial + usage
  - `postMessage(input: { id: string; text: string })`：202 受理，busy 时 409
  - `abortChat(input: { id: string })`
  - 形状与 route 定义方式照抄 `contract/research.ts` 的 chat 部分。
- **server**：新 `app/server/src/modules/assistant/assistant.controller.ts`，注册进 `app.module.ts`。
- **desktop**：新 `app/desktop/src/ipc/assistantIpc.ts`，照 `researchIpc.ts` 的形状。
- **WS**：`realtime/channelProtocol.ts` 加 `kind: "assistant-chat"`（携带 sessionId）；事件流复用 `ConversationEvent`（init / delta / tool / done / aborted / error）。server 与 desktop 两条通道都接。

## 3. 前端（`app/web`）

### 页面与路由

- 路由 `/chat`，新目录 `src/pages/assistant/`，导航加一个入口。
- 布局为经典双栏（UI 决定 #1）：
  - 左侧：会话列表。顶部「新建会话」，列表按 `updatedAt` 排序，当前会话高亮，条目提供删除（确认后删）。
  - 右侧：全高对话区（transcript）+ 输入区 + 底部状态行。
- 数据接入：`useChatSession.ts` 的 `useConversationSession` 扩一个 `"assistant"` kind（fetch / send / abort / WS 频道各多一个分支），新增 `useAssistantChatSession(sessionId)`。
- 样式沿用现有 design token（`--radius`、`--control-h` 等），不引入新的几何值；涨跌色不用于非行情状态。

### 工具调用呈现（UI 决定 #2：逐条行内块）

- 每次工具调用在对话流里占一行：`⏺ 工具名(参数摘要)`，流式进行中显示运行状态。
- 点击一行展开该次调用的完整输入/输出：等宽字体、独立滚动、超长截断提示。
- 历史消息里的 tool 行和进行中的 liveTools 用同一个可折叠组件（改造 `ConversationTranscript` 或在 assistant 页内新建组件后反哺）。

### 排队追问（UI 决定 #3：队列夹在输入框上方）

- AI 运行中输入框不禁用；此时发送的消息进入本地队列，显示为输入框上方的小列表，每条带撤回（✕）。
- 当前回合收到 done / aborted / error 后，自动把队首消息发出，依次清空。
- 队列纯前端状态，不落库；刷新页面即丢弃。
- 中止按钮保持现有行为（abort 当前回合，不清队列）。

### 用量状态行

- 对话区底部一条状态行：模型名（settings 里当前 chat 模型）+ 本会话累计 tokens 与花费。
- 数据来自 `getChat` 的用量汇总，每回合结束（done/error/aborted 触发 reload）后刷新。

### @ 文件补全

- 输入 `@` 后弹出补全列表（输入框上方），数据源 = research 库文档列表（`stocks/*.md`、`journal/**/*.md`），按输入前缀过滤。
- 选中后把路径以 `@stocks/MU.md` 形式插入文本。
- 前端不注入文件内容；system prompt 已约定模型见 `@路径` 自行读取。

## 4. 错误与边界

- busy 时 `postMessage` 返回 409（复用现有引擎的 run lock 语义），前端排队机制天然避免用户撞上它。
- 模型未配置（no_model）：postMessage 返回错误，页面提示去设置。
- 删除当前打开的会话：自动切到列表第一个，列表为空则显示空态（引导新建）。
- WS 断线重连后 reload 会话状态（沿用 `useConversationSession` 现有逻辑）。

## 5. 测试

- core：
  - `assistantChat.test.ts`：会话创建/追加/列表/删除、引擎跑通一回合（假 agentFactory）、busy 锁、用量汇总计算。
  - schema/migration 测试按现有惯例补 `assistant_sessions`。
- server：`assistant-routes.test.ts` 照 `research-routes.test.ts` 形状（list/create/delete/getChat/postMessage/abort/409）；`ws.test.ts` 补 `assistant-chat` 频道。
- web：
  - 排队逻辑（入队、回合结束自动发送、撤回）纯逻辑单测。
  - @ 补全的匹配/插入纯逻辑单测。
  - 工具块折叠的数据整形（transcript 时间线）单测，沿用 `transcriptTimeline.test.ts` 的做法。

## UI 决定记录（视觉伴侣会话结论）

1. 页面布局：经典双栏（左会话列表 + 右对话区），不做三区式。
2. 工具调用：逐条行内块，每行可点开看完整输入/输出（Claude Code 式），不做步骤组折叠、不做 chips。
3. 排队消息：输入框上方的独立队列列表，每条可撤回；不直接挂进对话流。
4. @ 补全：输入框上方弹文件列表，选中插入路径。
