# AI Chat 流式输出体验改造

日期：2026-07-17
范围：`apps/web`（前端），引擎/server/desktop 零改动。三类会话（chart / research / assistant）共用同一条链路，一次改造全部受益。

## 背景与问题

现状链路：`conversationEngine` 把模型增量作为 `delta` 事件经 WS 推到前端，`useChatSession` 直接把 delta 拼进 `streamText`，`ConversationTranscript` 每个 delta 都用 `react-markdown` 整段重新解析渲染。四个体验问题：

1. **输出一顿一顿**：delta 按网络包到达，文字成坨蹦出，不是平滑的打字效果。
2. **Markdown 闪烁/跳动**：流式中途语法不完整（半截代码块、表格、加粗），样式来回跳；每个 delta 整段重渲染。
3. **gate 回合无流式**：带校验关卡的回合全程只有等待，最后整段一次性出现。gate 的语义是「答案先过校验再上屏」，真流式会破坏校验，只能改观感不能改语义。
4. **滚动跳动**：Markdown 重排时浏览器滚动锚定和手动 `scrollTop` 打架；用户往上翻阅时缺少回到底部的入口。

另有一个反馈空窗：消息发出后到第一个字（或第一个工具事件）出现之间，界面没有任何动静。

## 方案总览

| 问题 | 方案 |
|---|---|
| 一顿一顿 + gate 无流式 | 前端平滑排字器（缓冲 + rAF 匀速放字），gate 整段答案自动变成回放 |
| Markdown 闪烁 | `react-markdown` 换 `streamdown` 核心包（未闭合语法补全 + 块级记忆化） |
| 滚动跳动 | `overflow-anchor: none` + 吸底跟随 + 「回到底部」按钮 |
| 反馈空窗 | 助手侧「思考中」占位气泡（三个脉动圆点） |

引擎侧 `ConversationEvent` 协议、server 路由、desktop IPC 全部不动。

## 一、平滑排字器

新文件 `apps/web/src/pages/cockpit/chat/useSmoothStream.ts`，挂在 `useChatSession` 内部，对外接口不变（仍然吐 `streamText: string`）。

**数据流**：WS `delta` 不再直接 `setStreamText`，而是追加进缓冲区 ref；`requestAnimationFrame` 循环按速率从缓冲区把字符移入显示文本。

**自适应速率**：

- 目标：显示进度落后缓冲区约 300–500ms。
- 积压越多放得越快；速率上限保证任意大的积压在 2–3 秒内追平（gate 回合整段回放同样受此约束，长文不会回放一分钟）。
- 追平后回落到基础速率等待新 delta。

**字符边界**：按 Unicode 码点切分，不劈开代理对（表情、生僻字）。

**收尾时序**（关键行为变更）：

- 现状：`done`/`error` 立刻清空 `streamText` 并 `reload()`。
- 改为：收到 `done`/`error` 先标记「收尾中」，排字器加速放完缓冲区剩余文字，放完后再清空并 `reload()` 换成持久化消息行，保证流式气泡到正式消息的切换不闪断。
- `aborted`：立即整段上屏剩余缓冲后走现有流程，不回放。
- WS `init` 携带 `partial`（页面刷新后恢复进行中的回合）：整段直接上屏，不回放。
- 会话切换（`id` 变化）：缓冲区与 rAF 循环随 effect 清理重置。

## 二、Markdown 流式渲染（streamdown）

改 `apps/web/src/pages/cockpit/markdown.tsx`：

- 依赖变更：`react-markdown`、`remark-gfm` 移除，新增 `streamdown` **核心包**。不装 `@streamdown/code`、`@streamdown/math`、`@streamdown/mermaid` 插件包（聊天内容是文字和表格，不需要代码高亮/公式/图表，也避免它默认从 CDN 拉资源）。`remark-gfm` 是 streamdown 的默认插件，无需显式传。
- `Markdown` 组件新增 `streaming?: boolean` 入参：
  - 流式气泡：`mode="streaming"` + `isAnimating`，用内置光标，删掉手写的 `.chat-cursor`。
  - 历史消息与 report 场景：`mode="static"`，跳过流式开销。
- 未闭合语法由 streamdown 的 remend 预处理器自动补全；块级记忆化保证流式时只有最后一个变动块重渲染。
- 现有 `MARKDOWN_COMPONENTS`（deep link 的 `a`、带滚动容器的 `table`）原样传入 `components`，接口兼容。
- `controls={false}` 关闭内置交互按钮（复制、表格全屏等依赖 Tailwind 样式，本项目无 Tailwind）。
- 样式：本项目无 Tailwind，streamdown 输出里的 Tailwind class 是惰性字符串，无害。渲染观感靠现有 `.typeset` 元素样式；落地后对照补少量 `[data-streamdown=...]` 规则（预计集中在代码块容器、表格包装层），确保与现状观感一致。

## 三、滚动体验

`ConversationTranscript.tsx`：

- 滚动容器加 `overflow-anchor: none`，跟随行为统一由代码控制，消除浏览器锚定与手动 `scrollTop` 的冲突。
- 保留「离底 48px 内才跟随」的吸底判断。
- 用户脱离吸底且回合仍在跑时，显示「回到底部」浮动按钮（右下角），点击滚到底并恢复跟随。
- 按钮样式使用现有设计变量（`--radius`、`--control-h`），不自造几何数值。

## 四、「思考中」占位气泡

**触发条件**：`busy && !streamText && 没有 status 为 "start" 的 liveTool`。

覆盖两段空窗：发送后到第一个输出之间；gate 回合所有工具跑完、模型组织最终答案期间。一旦有文字或有进行中的工具行，占位让位。

**形态**：助手侧小气泡，内部三个脉动小圆点（CSS 动画，交错相位），无文字。颜色用现有弱化前景变量，不用行情涨跌色。发送是乐观更新（`send` 里立刻 `setBusy(true)`），所以占位在点击发送的瞬间就出现。

## 数据流（改造后）

```
WS delta ──► 缓冲区 ref ──► rAF 排字循环 ──► streamText ──► <Markdown streaming> (streamdown, 块级 memo)
WS done ──► 收尾标记 ──► 加速放完缓冲 ──► reload() 换持久化行
busy 且无输出无进行中工具 ──► 思考中占位气泡
```

## 错误处理

- `error` 事件：与 `done` 同样先放完缓冲再 reload（reload 会带上错误行），错误提示不打断已上屏的部分文字。
- WS 断线重连：现有 `init` 快照逻辑不变，`partial` 整段上屏。
- streamdown 渲染异常：与 react-markdown 同为纯渲染组件，无新增失败面。

## 测试

- 排字器速率/收尾逻辑抽成纯函数（给定缓冲长度与时间步，产出放字数量），vitest 单测：积压加速、2–3 秒追平上限、码点边界、done 后放完才收尾。
- `useChatSession.test.ts` 补用例：delta 进缓冲不立即全量上屏；done 后等缓冲放完才 reload；aborted/init-partial 整段上屏；占位条件（busy 无输出无进行中工具）。
- 手工验证：普通回合、gate 回合（assistant 场景）、中途 abort、刷新页面恢复、用户上翻时不被拽底。

## 不做的事

- 不改引擎的事件协议、缓冲策略（gate 的 fail-closed 语义原样保留）。
- 不装 streamdown 的 code/math/mermaid 插件。
- 不做逐字淡入等更花哨的动画（先落地匀速排字，观感不够再说）。
