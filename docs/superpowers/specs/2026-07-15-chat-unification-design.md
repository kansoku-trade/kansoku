# 聊天体系归一：Markdown 样式收权 + 前端壳合并 + 后端会话引擎

日期：2026-07-15
背景：研究助手重构过程中发现 `.research-context p` 污染聊天 markdown 的事故，引出三个系统性问题：markdown 样式没有单一归属、两套聊天 UI 存在孪生代码、两条后端聊天管线约八成是机械复制。三块已确认全部做。

## 现状摸底（要点）

- Markdown 只有一个组件（`app/web/src/pages/cockpit/markdown.tsx`），两个变体 `chat` / `report`，样式主体在 `typeset.css` + `styles.css` 的 `.typeset*` 段。已知穿透：全局 `a` 规则（styles.css:174）覆盖所有 markdown 表面；`.page h1` / `.page .sub`（styles.css:189-190）是隐患（当前没有 markdown 挂在 `.page` 下，属于待引爆）。
- 前端：`useConversationSession` 和 `ConversationTranscript`（含时间线合并）已共用。重复的是壳：输入行、发送/停止切换、回车发送（含输入法守卫）、失败回填、提示行——`ChatDock.tsx:52-88` 与 `ResearchAssistant.tsx:206-219,367-390` 逐对孪生，各穿 `chat-*` 与 `research-assistant-*` 两套 CSS。
- 后端：`src/ai/chat.ts` 与 `src/ai/researchChat.ts` 结构逐函数平行（运行锁/turnStates/listeners/broadcast/turnState/abort/execute/run），持久化增量、事件翻译、截断工具函数成对拷贝；`chatStore.ts` ≈ `researchChatStore.ts`（消息同写 `chat_messages` 表，只差会话表和键列）；contract/service 四件套形状雷同（`researchChat.service.ts` 甚至直接 import `chat.ts` 的 `toDisplayMessages`）；`channelProtocol.ts` 的 `attachChat` ≈ `attachResearchChat`。provider 调用层已共用 `createAgentSession`。真正领域特有：图表侧的方向性验证门（缓冲流式+门控重试+fail-closed），研究侧的 MessagesEngine 文档上下文注入与修改提案工具。

## 块 1 — Markdown 样式收权（小）

**规矩（写进本 spec，作为后续约束）：markdown 输出内部元素的样式只允许 `.typeset` / `.typeset-<variant>` 作用域的规则控制。外层容器不得用裸标签后代选择器（`.foo p`、`.foo h3`、`.foo a` 等）触碰可能出现在 markdown 里的标签。变体可以增加，但都在 Markdown 组件与 typeset 段内实现。**

改动：

1. `.page h1`、`.page .sub`（styles.css:189-190）改为直接子代选择器（`.page > h1`、`.page > .sub`），消除对未来挂在 `.page` 下的 markdown 的覆盖。
2. 全局 `a` 规则保留（它是全应用默认），但确认 `.typeset :is(a)` 完整接管 markdown 链接的颜色与下划线（现状已基本接管，补齐缺口即可，如 heading 内链接）。
3. 全库扫一遍：凡是包裹 `<Markdown>` 输出的容器链上有裸标签后代选择器的，一律收窄或改类名（摸底显示当前仅上述两处 + 已修复的 `.research-context p/h3`，扫描用于确认无遗漏）。

## 块 2 — 前端壳归一（小）

新共享组件 `app/web/src/pages/cockpit/chat/ChatComposer.tsx`：

- Props：`value, onChange, busy, aborting, disabled?, placeholder, onSubmit, onAbort, hint?`（不留空插槽，将来有真实需求再加）。
- 内含：`Input` + 发送/停止按钮切换（busy → 停止）+ Enter 发送（`isComposing` 守卫）+ 提示/错误行（`role="alert"`）。
- 外观统一为图标按钮（`Send` / `Square`，带 aria-label），CSS 统一用 `chat-composer` 一族；`.research-assistant-composer`、`.research-assistant-error` 及驾驶舱侧文字按钮样式（`.chat-composer-send/-stop` 如不再需要）删除，无死规则。
- `ChatDock` 与 `ResearchAssistant` 改为消费 `ChatComposer`；驾驶舱的聚焦自动悬浮、提交转悬浮等行为保留在外壳（通过回调），研究侧的失败回填逻辑保留在外壳的 `onSubmit` 里。
- 建议问题引导（`ensureSuggestions`）各自留在壳中（门控条件不同）。

## 块 3 — 后端会话引擎（中大）

目标：`chat.ts` 与 `researchChat.ts` 缩成"配置 + 领域工具"，机械复制收进一个引擎。**对外零变化：contract 类型、HTTP/IPC 路由、WS 协议（`sub` 的 `chat` / `research-chat` 两个 kind 与事件载荷）一律不动。**

新模块：

1. `src/ai/conversationStore.ts` — store 工厂：`createConversationStore({sessionTable, keyColumn, sessionShape})`，吸收 `chatStore.ts` / `researchChatStore.ts` 的 `getSessionBy… / create…Session / list…Messages / append…Messages`（消息表共用 `chat_messages` 不变）。`titleFromText` 移入或保留原处 re-export。
2. `src/ai/conversationEngine.ts` — 生命周期引擎：`createConversationEngine(config)`，吸收运行锁、`turnStates`、`listeners`、`broadcast`、`turnState`、`abort`、`execute/run` 骨架、持久化增量（`persistIncrement` / `persistFailure` / `hasAssistantText` / 部分消息合成 / `ZERO_USAGE`）、事件翻译与字符串工具（`truncate` / `stringify` / `textOf` / `toolResultText` / `concatAssistantText`）。config 提供：`key 语义、store、buildTools、buildSystemPrompt（fail-closed 纪律加载沿用）、transformContext?（研究侧 MessagesEngine）、事件钩子（图表门控所需的缓冲/settled 控制与门控重试、回合后校验）`。
3. `chat.ts`：保留方向性验证门全部领域逻辑（`isDirectionalClaim`、`buildVerifyTools`、门控指令与重试、fail-closed），以引擎钩子形式接入；`buildChatSystemPrompt`、绘图/数据工具不动。**不在本轮迁移 MessagesEngine**（图表聊天的上下文策略照旧，列为后续独立事项）。
4. `researchChat.ts`：保留 `ResearchDocumentContextProvider`、文档库工具、`propose_current_document_edit`；其余走引擎。
5. `channelProtocol.ts`：`attachChat` / `attachResearchChat` 合并为一个通用 attach 辅助（订阅→事件封包→init 快照），两个 kind 的解析与分发不变。
6. service 层（`chat.service.ts` / `researchChat.service.ts`）的 get/post/abort/suggestions 与 4000 字符守卫如自然收敛就收，不强求——以不动 contract 为界。

测试：core 现有套件全绿为底线；`conversationEngine` / `conversationStore` 补单元测试（锁互斥、abort 广播、增量持久化、部分消息合成、事件翻译含门控缓冲钩子）；图表门控回归用现有 `chat.test.ts` 覆盖面验证。

风险与顺序：3 拆三步串行——(3a) store 工厂 + 纯工具函数下沉（无行为变化）；(3b) 引擎骨架落地并接入 chart chat（门控钩子是验收重点）；(3c) research chat 接入 + attach 合并。每步全套测试过再走下一步。

## 执行

沿用 subagent-driven 流程：任务 1（块 1）、任务 2（块 2）、任务 3a/3b/3c（块 3）串行，每任务独立审查；全部完成后做整体终审。不 commit，改动留工作区。

## 后续（本轮不做）

- 图表聊天迁移到 MessagesEngine（与 analyst / research 对齐上下文策略）。
- `contract/chat.ts` 与 `contract/research.ts` 的结果联合类型如需字面收敛，等引擎稳定后另起小任务。
