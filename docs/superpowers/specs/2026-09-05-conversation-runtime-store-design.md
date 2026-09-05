# 对话运行时前端仓库

日期：2026-09-05
状态：已确认
范围：三类 AI 对话共用（chart / research / assistant）。只改 `apps/web` 对话链路。不改后端协议，不把 React 树 keep-alive。

## 背景

独立对话页用 `key={activeId}` 挂 `AssistantConversation`。正在跑的时候切到另一个 session 再回来，整棵树卸掉重挂。

两层状态因此丢失：

1. 折叠开合是 `ToolRow` / `ToolGroupRow` / `WorkedFold` / `ReasoningFold` / `SourcesFold` 里的 `useState`。
2. 进行中的工具只活在 `useConversationSession` 的 `liveBeats` 里。一轮结束才落盘。WS 订阅跟 hook 走，切走就退订；回来时 `init` 只带 `busy + partial` 文本，工具列表从空再长。

前端没有对话运行时仓库。后端的 `chatStore` / `assistantChatStore` 只管落盘，不管界面。

## 已确认的决策

| 维度 | 决策 |
| --- | --- |
| 做法 | 新建前端运行时仓库。不把对话树藏起来 keep-alive。 |
| 形态 | 模块单例 + `useSyncExternalStore`，跟 `analystRunsStore` 同一套。不引入 zustand / jotai。 |
| 名字 | 前端叫 conversation runtime，文件 `conversationStore.ts`。不要叫 `chatStore`（后端已占用）。 |
| 共用 | chart / research / assistant 三个 `kind` 一个仓库，按槽分开。 |
| 生命周期 | 有人在看，或还在跑，槽就留着。没人看且已经停，卸掉。 |
| 折叠 | 跟运行时同槽。只记用户点过的。没点过的用组件默认值。 |
| 这次不改 | 后端 `init` 协议、输入框草稿、滚动位置、已卸掉的历史折叠。 |

## 仓库里放什么

文件：`apps/web/src/features/cockpit/chat/conversationStore.ts`。

每个槽的键是 `` `${kind}:${id}` ``，例如 `assistant:abc`、`chart:chartId`、`research:path`。

槽里有：

- 消息列表、session 元数据、`busy` / `aborting`、流式文本、`liveBeats`、hint、loaded、suggestions、usage
- 工具序号（现在的 `toolSeqRef`），不随组件卸载归零
- 折叠表：`foldId → boolean`，只含用户点过的条目
- 这一槽的 WS 退订函数、正在看的人数

不放：输入框草稿、滚动位置、`@` 提及弹层、模型选择器、侧边栏 session 列表。

## 生命周期

```
acquire          viewers + 1。没有槽就建槽、拉记录、订 WS。已有槽只加人数，不重拉、不重订
release          viewers - 1。没人看且不 busy → 卸槽、退订、清折叠
busy → false     若此时没人看 → 同样卸槽
```

`acquire` / `release` 只由 `useConversationSession` 的 `useEffect` 调用。折叠组件不碰生命周期。

切走再回来、那一轮还在跑：槽还在，WS 一直订着，工具列表和折叠都还在。组件重挂只是重新订阅仓库。

切走之后那一轮跑完了：槽卸掉。再点回来是落盘后的「跑了 xx 秒」，默认收起。这是新树，不要求还开着。

同一轮在眼前从 live 变成「跑了 xx 秒」：现有 `presentTranscript` 会换树，折叠键从 live 的 `tool-N` 换成落盘行 id。这次不要求跟着迁。只保证「切走再回来、还在跑」这一条。

两个槽可以同时 busy，互不串。

## 动作

对外动作（都带 `kind + id`，或由当前槽闭包）：

- `acquire` / `release`
- `send` / `abort` / `retryLast`：从现有 hook 原样搬过来，写这一槽。组件卸了也能把进行中的回合收完
- `toggleFold(foldId, defaultOpen)`：把当前显示值取反写入。当前显示值 = 表里的记录，没有记录则用 `defaultOpen`
- `isFoldOpen(foldId, defaultOpen)`：有记录用记录，没有用 `defaultOpen`
- `resetConversationStoreForTests()`

`ensureSuggestions` 仍由 hook 在「正在看」时触发，请求标记记在槽上，busy 期间被 send 清掉的行为保持现状。

## 现有 hook 怎么收

`useChatSession` / `useAssistantChatSession` / `useResearchChatSession` 的名字、返回的 `ChatSessionState`、adapter 导出位置都不变。ChatDock、AssistantConversation 对 hook 的调用面不变。`ConversationTranscript` 会多一个 `conversationKey`，由 `ChatPanel` / `AssistantConversation` 传入。

hook 内部改成：挂上 `acquire`，卸掉 `release`，`useSyncExternalStore` 读这一槽。`rows` / `liveBeats` / `busy` 仍作为 props 传给 `ConversationTranscript`，这条渲染路径不变。

## 折叠怎么接到组件

`ConversationTranscript` 增加 `conversationKey`。用 React context 把当前槽传给折叠组件。同一时刻图表追问和独立对话可以各有一棵树，靠 context 区分槽，不靠模块级「当前 session」。

`ToolRow` / `ToolGroupRow` / `WorkedFold` / `ReasoningFold` / `SourcesFold` 调用：

```
useConversationFold(foldId, defaultOpen?)
```

折叠键跟现有 `blockKey` 对齐：

- 单条工具：`tool:${tool.id}`
- 工具组：`group:${group.id}`（现有就是 `group:${tools[0].id}`）
- 跑了：`worked:${turnId}`
- 思考过程：与现有 `blockKey` 相同，即 `reasoning:${index}`
- 来源：`sources:${assistantRow.id}`

`ReasoningFold` 现在 `streaming` 一变就强制打开。改成：没点过时默认跟 `streaming`；点过之后听仓库，切回来不要再撑开。

`ChatPanel`（图表追问）和 `AssistantConversation` 把对应的 `conversationKey` 传给 `ConversationTranscript`。研究侧若走同一 Transcript，同样传 key。没传 `conversationKey` 时（现有单测），折叠只用组件内临时状态、不写仓库，避免测例漏 key 时和仓库缠在一起。生产路径都传 key。

## 数据流

```
页面 hook acquire
    │
    ▼
conversationStore  ──订──►  /api/ws  （busy 或有人看才订）
    │
    ├─ rows / liveBeats / busy  → hook 原样吐给 Transcript
    └─ folds                    → 折叠组件自己订
```

页面仍可用 `key={activeId}` 卸载对话树。卸的是树，不是槽。

## 出错和重连

- 拉记录失败：槽留下，hint 仍是「对话记录加载失败」。
- 发送失败：乐观消息撤回，和现在一样。
- WS 断线：**不清** `liveBeats`。工具还没落盘，清了就没了。这点和 `analystRunsStore` 断线清空不同。
- 重连 `init`：这一槽已经 busy 且内存里已有工具列表，不用空列表（或只有 partial 文本）盖掉。只有本机从没订过的新槽，才用 `partial` 文本起步。
- 本机从没打开过、第一次点进正在跑的对话：进行中的工具仍可能缺。服务端 `init` 不带工具列表，这次不改后端。这不算本需求失败。

## 不做的事

- 不改后端 `init` / 不在服务端缓存工具列表。
- 不保输入框草稿、滚动位置。
- 不保已经结束、槽已卸掉的历史折叠。
- 不把 `AssistantConversation` 藏起来多挂几棵。
- 不引入新的状态库。
- 不把折叠和运行时拆成两个仓库。

## 验证

仓库单测（不挂页面）：

1. busy 时 `release` 不卸槽、不退订；再 `acquire` 工具 id 和折叠还在。
2. `busy → false` 且没人看 → 卸槽。
3. 两个槽同时 busy，互不影响。
4. 已有工具列表时，WS `init` 不用空列表盖掉。
5. 断线不清 `liveBeats`。

组件测：

1. 现有 Transcript 折叠测仍过（默认收起、「跑了」点开后露出过程、live 时只展示进行中的工具）。
2. 同一 `conversationKey` 把 Transcript 卸掉再挂上，展开过的工具组还是开着。
3. `afterEach` 调 `resetConversationStoreForTests`。

桌面端肉眼：独立对话开一轮工具调用，展开一条或一组，切到另一个 session 再切回来（还在跑），工具还在、展开还在，不要先空再长。
