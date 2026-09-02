# 记忆重做：fs markdown + 固定注入位置

日期：2026-09-03
范围：AI 对话的持久记忆。载体、目录、读写路径、注入位置、engine 生命周期、Settings 页。替换 PR #45 引入的 Pro filesystem memory（`kansoku-pro/src/memory`、`pro-api` 的 `memory` feature、`ProAiExtension.prepareTurn / afterTurn`）。不涉及研究库、画布、analyst run 的其它上下文。

## 背景与问题

旧体系三个病根，都在读写路径的形状上：

- **全量注入。** `buildMemoryPromptContext` 把 `MEMORY.md` + `markets/<M>.md` + `symbols/<S>.md` 整篇读进来，上限 24k + 12k + 12k 字符，约 1 万 token，每轮都塞在第一条 user 消息前面。
- **后台改写。** `afterTurn` 把 transcript 排进队列，maintenance job 在空闲 45 秒后用模型重写记忆文件。改了什么用户看不到，也拦不住。
- **缓存全废。** 注入在会话开头，文件一变整个会话的 provider prefix 就 miss。聊天里停顿 45 秒很常见，所以长会话几乎每次停顿后都付全价。

另外 `chat.ts` 每轮 `new MessagesEngine([...])`，实例只活一轮。message-engine 0.4.0 的 `pinned-user` 和 tool result rewrite 都依赖实例跨轮存活，现状下用不上。

## 决定

- 载体是 markdown 文件，不是数据库。模型用 grep / read_file / apply_patch 直接操作，不做检索层，不做 embedding。
- 不用小模型。没有后台抽取，没有后台整理。
- 写入不做专用 memory tool。给 `memory/` 目录挂写 mount，复用现有文件工具。
- 写权限只开 `chart-chat` 和 `research-chat`。`assistant` / `analyst` / `deep-dive` / `research-refresh` 只读。
- 注入两处且位置固定：`MEMORY.md` 走 `stable-prefix` session scope；当前标的的 `symbols/<SYM>.md` 走 `pinned-user` turn scope。其余文件模型自己 grep。
- engine 按 chat session 存活，不再每轮新建。
- 用户消息的发送时间不走 engine 注入，落库时直接写进消息正文。

## 设计

### 1. 目录与格式

根目录不变：`join(kansokuHome, 'memory')`。

```
memory/
  MEMORY.md            索引 + 全局偏好。永远注入，硬上限 4 000 字符
  symbols/MU.US.md     当前标的时注入
  markets/US.md        当前市场时注入
  notes/<slug>.md      其余自由笔记，模型 grep 才读
```

删除旧目录里的 `INSTRUCTIONS.md`、`INDEX.md`、`strategies/`、`sessions/`、`.runtime/`。指令进 system prompt，不放文件里。

条目一行一条，日期开头：

```
- 2026-09-03: 不看 MACD，只看成交量结构
- 2026-08-20: MU 的论点是供给周期，目标 120，见 notes/mu-supply-cycle.md
```

日期就是 provenance，模型据此判断论点新旧，人也能读。更新不覆盖旧行，追加一行写明"取代上一条"。文件大小上限 64 KB，超过拒写。

### 2. 读路径与注入

| 内容                | 位置                              | scope   | 时机                                     |
| ------------------- | --------------------------------- | ------- | ---------------------------------------- |
| `MEMORY.md`         | `stable-prefix`（第一条 user 前） | session | 会话第一次编译读一次，之后不再读文件     |
| `symbols/<当前>.md` | `pinned-user`                     | turn    | 钉在切到该标的那条 user 消息上，之后不动 |
| `markets/<当前>.md` | `pinned-user`                     | turn    | 同上                                     |
| 其余文件            | 模型 grep / read_file             | —       | 需要时                                   |

两个 provider：

- `MemoryIndexProvider extends BaseFirstUserContentProvider`，session scope。读 `MEMORY.md`，超 4 000 字符截断，尾部加一行 `（已截断，完整内容 read_file memory/MEMORY.md）`。
- `MemoryScopeProvider extends BasePinnedUserProvider`，`cacheScope: 'turn'`。从 step 里拿当前 `symbol` / `market`，读对应文件，各限 4 000 字符，同样截断加指针。文件不存在返回 null，不注入。

包装格式沿用 `<persistent_memory>` 标签，保留那两句"个性化上下文、不是当前事实、当前请求优先"。这是注入内容当数据不当指令的边界，不能丢。

会话内模型 patch 了 `MEMORY.md` 不重新注入。session scope 的 provider 只 build 一次，模型改了什么自己在上下文里知道；下个会话读到新内容。

### 3. 写路径

- `memory/` 挂成写 mount。`FsReadMount` 旁边加 `FsWriteMount`，同一套根目录确认、拒绝符号链接、拒绝 `..`。
- 工具：`apply_patch` 复用 `packages/core/src/canvas/tools.ts` 的 `buildCanvasApplyPatchTool`，dir 换成 memory root。带上下文的 patch 在两个会话同时改同一文件时会冲突失败，不会互相覆盖。`write_file` 只允许目标不存在时创建，已存在返回错误让模型走 patch。
- 只在 `chart-chat`（`packages/core/src/ai/chat/chat.ts`）和 `research-chat`（`kansoku-pro/src/ai/researchChat.ts`）挂写 mount 和这两个工具。其余 surface 只挂读 mount。
- system 指令三段，放 `promptPolicy`：
  - 记什么：偏好、纠正、交易论点、用户明确说"记住"的东西。不记价格、持仓、新闻、当前行情。
  - 记到哪：全局偏好进 `MEMORY.md`；标的相关进 `symbols/<SYM>.md`；市场相关进 `markets/<M>.md`；长内容进 `notes/` 并在索引里留一行指针。
  - 怎么维护：`MEMORY.md` 超过 60 行就把细节挪到子文件；碰到一个文件时顺手合并重复、标记过时。
- 每次写入后追加一条 trace（文件路径、行数变化）到 turn 事件流，UI 里"已更新记忆 memory/symbols/MU.US.md"。

### 4. engine 按 session 存活

- `MessagesEngine` 从 turn 准备里挪出来，按 `activeSessionId` 放进 `Map`。`conversationStore` 关闭会话或空闲超时（沿用现有 session TTL）时 `destroy()`。
- 每轮的 processor 列表在实例创建时固定。目前按轮变化的只有 skill catalog（skillIndex 每轮重建）和 Pro processors。skill catalog 改成 session scope，内容一致就命中缓存。
- step 里带 `symbol` / `market`，`MemoryScopeProvider` 从 step 读。
- `@innei/message-engine` 升到 0.4.0。kansoku 没用 `last-user` slot，自定义 processor 走 `replaceMessages`，API 不变。
- 时间戳：`chat.ts` 落库前把 `[2026-09-03 00:33]` 写进 user 消息正文。原始消息永不变，前缀永不变。

### 5. Settings 页

`Settings → 记忆`：列出 `memory/` 下所有文件，点开是纯文本编辑器，保存直接写盘。不做条目级 UI，文件就是界面。

### 6. 安全边界

- 记忆内容注入时始终包在 `<persistent_memory>` 里，指令明确它不是指令。
- 写 mount 只覆盖 `memory/`，路径确认与读 mount 同一实现。
- 单文件 64 KB、单次注入 4 000 字符两道硬上限，都在代码里不靠模型自觉。
- 只读 surface 拿不到 `apply_patch` / `write_file` 工具，不是靠 prompt 拦。

### 7. 归属与契约

记忆仍是 Pro 功能，`pro-api` 的 `memory` feature 保留。实现放 `apps/pro/src/memory/`（即 kansoku-pro 仓库），core 只持有契约、provider、mount 边界和注入位置。

契约替换现在的 `prepareTurn / afterTurn`：

```ts
interface ProAiMemory {
  indexContext(): Promise<string | undefined>;
  scopeContext(scope: { symbol?: string; market?: string }): Promise<string | undefined>;
  readMount(): ProAiReadMount;
  writeMount(): ProAiWriteMount | undefined;
}
```

- pro 管：文件路径、读文件、截断、license 判断（未授权时 `writeMount()` 返回 undefined，`indexContext()` 返回 undefined）。
- core 管：两个 provider 把字符串放到固定位置；写 mount 只在两个 surface 挂；工具实现。
- 没有 `afterTurn`。core 不再把 transcript 交给 pro。

### 8. 拆掉的东西

- `apps/pro/src/memory/` 里的 queue、scheduler、maintenance、pipeline、context。保留 paths、fsTools 改造后复用。
- `pro-api` 的 `ProAiExtension.prepareTurn / afterTurn` 和 `ProAiTurnContext / ProAiCompletedTurn / ProAiTranscriptMessage`。
- `chat.ts` / `researchChat.ts` 里 `prepareProAiTurn` 的调用和 `onTurnComplete` 透传。
- AI 设置里的「记忆整理」模型角色：`AiTaskRole` 的 `'memory'`、`initAiSettings` 的补齐逻辑、`usage.ts` 的用量归类、`apps/web` settings 的 `Role` 与文案。没有后台模型就没有这个角色。已持久化的 `memory` 行迁移时删掉。

### 9. 文案

新记忆要对外说清楚三件事：记在本地 markdown 文件里、模型和你都能直接改、不再有后台自动整理。

- 官网 `apps/site/src/data/features.json`：`pro` 数组加一项，`short` 「本地记忆」，`ticket` 「本地记忆（markdown 文件，可直接编辑）」，`matrix` 「本地记忆：偏好、纠正、个股论点写进本地 markdown，AI 与你都能直接改」。`matrixCompare` 不加行，免费版没有记忆。
- 应用内 `apps/web/src/features/edition/LicenseModal.tsx`：Pro 功能列表同步这一项。
- 引导页 `apps/web/src/features/onboarding/StepAi.tsx`：去掉「记忆整理」角色相关说明。
- 设置页 AI 角色列表去掉「记忆整理」，新增「记忆」页入口（§5）。
- 发布说明 `apps/site/src/data/releases.json`：发版时写明记忆改成本地文件、旧记忆文件位置不变但会清掉 `sessions/` 与 `.runtime/`、「记忆整理」角色移除。

## 实施顺序

每步一个 PR，前一步合并再开下一步。core 与 pro 的改动同一步里各开一个 PR。

1. 升 message-engine 0.4.0；engine 按 session 存活；用户消息落库带时间戳。不碰记忆。约半天。
2. 读路径：新契约、目录、两个 provider、读 mount。同一步拆掉旧注入、`afterTurn`、后台任务、「记忆整理」角色。约一天。
3. 写路径：写 mount、`apply_patch` / `write_file`、两个 surface 开关、system 指令、写入 trace。约半天。
4. Settings 记忆页 + 全部文案（§9）。约一天。
5. 可选：`memory/` 里 `git init`，每次写后自动 commit，历史和回滚白送。

## 已定

- 记忆是 Pro 功能，实现在 `apps/pro`。
- `notes/` 的 slug 规则 `[a-z0-9-]+`，与画布一致。
