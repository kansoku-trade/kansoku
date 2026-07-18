# 追问面板改造：右下角浮层

日期：2026-07-14
状态：待实现

## 为什么改

现在的追问入口是钉死在右侧栏底部的一条输入框（`ChatDock`），敲回车后向上弹出一个高 `min(58vh, 460px)` 的面板（`ChatPanel`），把侧栏里的结论卡、事件风险、预测/消息/持仓 tab 全部盖掉。

四个实际用起来别扭的地方：

1. **面板和侧栏抢地盘**。追问的前提是「就这份分析追问」，但面板一展开，被追问的那份分析原文就看不见了。
2. **生成中停不下来**。只有一个 Spinner，答歪了只能干等到底。
3. **工具调用是黑盒**。只显示「已调用 深度调研」一行，看不到它查了什么、拿回什么，AI 的结论没法溯源。
4. **冷启动没抓手**。空面板只写一句「还没有对话」，不给任何可点的问题。

## 改成什么样

追问面板从「侧栏底部的抽屉」改成**右下角的浮层**，有三种形态：

| 形态              | 长什么样                                                | 怎么进                                       |
| ----------------- | ------------------------------------------------------- | -------------------------------------------- |
| **收起（dock）**  | 右下角贴边的一条窄输入框，只有输入框和发送键            | 默认形态；点面板头部的收起键                 |
| **浮层（float）** | 带边框和阴影的独立面板，浮在 K 线区右下角，可拖、可缩放 | 在收起态输入框里敲字回车；或点收起态的展开键 |
| **全屏（full）**  | 铺满内容区（保留顶部 topbar），对话居中限宽约 70 字     | 点浮层头部的全屏键                           |

侧栏完全不动——结论卡、事件风险、三个 tab 一直可见可读。

### 交互细则

**拖拽**。抓浮层头部空白处拖动。可以拖到贴边，但强制至少留 100px 在可视区内，防止甩出屏幕后再也点不着。窗口缩小导致浮层跑出可视区时，自动拉回来。

**缩放**。左边和上边两条边 + 左上角可拖缩放（因为浮层默认贴右下角，往左上长才不会顶到边）。尺寸夹在 `320×240` 到 `视口宽高 − 32px` 之间。

**全屏**。全屏是**第三种形态，不是「尺寸调到最大」**：切进全屏时，浮层原来的位置和尺寸原样存着，退出时直接还原，不能被全屏的尺寸覆盖。全屏态下 topbar 保留（报价还看得见），对话内容居中限宽——这一档存在的意义就是读长回答，行宽必须正常。`Esc` 退出全屏回到浮层态。

**记忆**。

- **位置和尺寸：全局记一份**（`localStorage`，和 `intraday-macd-height` 一个路子，键名 `chat-panel-rect`）。换股票时浮层还在原地、还是原尺寸。不按 chart 分别记——那样每支票位置都不一样，反而找不着。
- **形态不记忆**：换 chart 一律回到收起态（就是现在 `setExpanded(false)` 的行为）。每份分析都是新的上下文，默认不该顶着一个大浮层挡着先看图。**例外**：进去时这份 chart 的对话正在跑（`busy`），自动展开成浮层。

## 停止生成

后端已经有能力，只是没暴露：`agentSession.ts` 的 `AiAgentHandle.abort()` 现在只在超时路径上被调用（`agentSession.ts:94`）。

- **服务端**：`chat.ts` 里为每个正在跑的 turn 存下它的 `agentSession` handle（跟 `turnStates` 一起放），新增 `abortChatTurn(chartId)` 调它的 `abort()`。中止走的是现成的失败路径 `persistFailureIncrement`，会把已经说出口的半截回答存成一条 `stopReason: "aborted"` 的 assistant 消息——**中止不丢内容**。中止后广播一个 `{ event: "aborted" }`（新事件类型，和 `error` 分开，前端不该把主动中止显示成红色报错）。
- **契约**：`ChatApi` 加 `abort(input: { id: string }): Promise<{ status: 202 | 409 }>`，路由 `POST /charts/:id/chat/abort`。没有正在跑的 turn 就返回 409。desktop 侧同步加 IPC handler。
- **前端**：生成中，输入框右边的「发送」换成「■ 停止」；按下后立即禁用（防连点），等 `aborted`/`done` 事件回来再恢复。

## 工具调用可展开

现在 `toDisplayMessages`（`chat.ts:105`）只从 `toolCall` block 里取了 `name`，参数和返回值全丢了。

- **契约**：`ChatDisplayMessage` 的 `tool` 那一档加两个字段：`input?: string`（`toolCall.args` 序列化后的 JSON）、`output?: string`（对应 `toolResult` 的内容）。两者都**截断到 4000 字符**，超出部分标注「…（已截断）」——K 线工具能回几百根 bar，原样塞进 WS 和内存不合适。
- **实时事件**：`ChatEvent` 的 `tool` 事件在 `status: "end"` 时带上同样截断过的 `output`。
- **前端**：工具行从一行纯文字变成可点开的一行：`● 已调用 分钟级成交量对比 ▸`，点开显示「查了什么 / 拿回什么」两段等宽字体的 JSON。默认收起。

## 开场建议问题

打开一份还没有对话的分析时，在空面板里给 3 条可点的建议问题。

- **怎么生成**：**复用 `comment` 角色的模型**（`aiConfig().commentModel`）——点评本来就是短平快的活，多半已经配的是小模型。不新增 `suggest` 角色。
- **输入**：这份 chart 的 `symbol` + 已归档的 `prediction`（方向、锚定价、失效位、情景）+ 当日分析员点评，复用 `buildChatSystemPrompt` 已经在拼的那套上下文。要求模型吐 3 条**冲着这份分析的薄弱处去**的短问题（每条 ≤ 20 字）。
- **契约**：**独立端点** `GET /charts/:id/chat/suggestions` → `{ suggestions: string[] }`。**不挂在 `chat.get` 里**——`get` 是页面一打开就调的，同步等一次模型会让整个面板卡住，而建议问题只在「展开 + 无会话」这一种情况下才看得见，没必要让每张图都付这个钱。
- **前端什么时候拉**：浮层展开、且当前 chart 没有会话时，才发这个请求。收起态不拉。已经有对话了不拉。
- **缓存**：按 `chartId` 缓存在内存里（进程级 Map），一份 chart 只生成一次。生成失败 / 没配模型 / 请求还没回来 → 空数组，前端退回现在那句「还没有对话，在下方输入你的问题」。**不为这个报错、不显示 loading 骨架**——建议问题是锦上添花，不该让人等它。
- **前端**：点一条建议 = 把它填进输入框并直接发出。发出第一条消息后建议区消失。

## 要动的文件

**后端 / 内核**

- `packages/core/src/ai/chat.ts` — 存 agent handle、`abortChatTurn`、`aborted` 事件、`toDisplayMessages` 带上 tool input/output、建议问题生成 + 缓存
- `packages/core/src/contract/chat.ts` — `ChatApi.abort`、`ChatState.suggestions`、`ChatDisplayMessage` 扩展
- `packages/core/src/modules/chat/chat.service.ts` — `abort` 实现、`get` 里挂建议问题
- `server/src/modules/chat/chat.controller.ts` — `POST /:id/chat/abort`
- `desktop/src/ipc/chatIpc.ts` — 对应的 IPC handler

**前端**

- `web/src/pages/cockpit/chat/ChatDock.tsx` — 改成浮层容器，管三种形态、拖拽、缩放、位置记忆
- `web/src/pages/cockpit/chat/ChatPanel.tsx` — 头部加全屏/收起键；工具行可展开；空态显示建议问题；停止键
- `web/src/pages/cockpit/chat/useChatSession.ts` — `abort()`、`suggestions`、`aborted` 事件处理
- 新增 `web/src/pages/cockpit/chat/useFloatingRect.ts` — 拖拽 / 缩放 / 边界约束 / localStorage，单独抽出来，别让 `ChatDock` 变成一坨
- `web/src/styles.css` — `.chat-dock` 系列重写为浮层

`ChatDock` 现在挂在 `IntradaySidebar` 的 `dock` 插槽里（`IntradayDashboard.tsx:168`、`IntradaySidebar.tsx:96`）。改成浮层后它不该再是侧栏的子节点——**挪到 `IntradayDashboard` 的 `.layout` 下**，`position: absolute` 定位在图区上方。`dock` 这个 prop 从 `IntradaySidebar` 拿掉。

## 怎么验

- **核心单测**：`abortChatTurn` 会把半截回答存下来且广播 `aborted`；没有正在跑的 turn 时返回 409；`toDisplayMessages` 带上截断后的 tool input/output；建议问题生成失败时返回空数组不抛错。
- **路由测试**：`POST /charts/:id/chat/abort` 的 202 / 409 / 404 三条路径。
- **前端测试**：`useFloatingRect` 的边界约束（拖出可视区被拉回、尺寸夹在上下限内、全屏进出不覆盖记住的 rect）。
- **手验**：拖到左上角 → 换股票 → 位置还在；生成中点停止 → 半截回答留在对话里且不是红色报错；点一条建议问题 → 直接发出。

## 这次不做

- **引用块**（把 AI 回答对应的那句分析原文钉在回答顶上）。想法是好的，但要 analyst 输出带锚点的结论，牵涉到分析生成那一侧，单独开一轮。
- **多会话 / 会话列表**。仍然是一 chart 一会话。
- **把追问结论收进笔记 / 日志**。
- 移动端布局。浮层按桌面尺寸设计。
