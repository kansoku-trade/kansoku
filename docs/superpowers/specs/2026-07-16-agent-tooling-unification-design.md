# In-app agent 工具与上下文基座统一

日期：2026-07-16
状态：待评审

## 背景与问题

图表追问 chat（`app/packages/core/src/ai/chat.ts`）的全部工具在构建时绑死在当前图表的标的上（`read_data_pack` / `fetch_kline` / `fetch_news` / `read_drawings` / `draw_annotations`，工具参数里没有 symbol 字段），也没有 bash / read_skill / read_file。用户追问一旦外溢到板块或关联标的（SMH、SK Hynix、ASML），agent 只能回答「我查不到」。2026-07-16 的实际对话截图证实了这一点。

盘点后发现这不是 chat 一个的问题，而是五个 in-app agent 各自手工装配、能力参差：

| Agent | 文件 | 研究三件套（bash / read_skill / read_file） | 技能目录注入 | MessagesEngine |
|---|---|---|---|---|
| analyst | `analyst.ts` | 有（手工拼 + 进度上报包装） | 有（provider 注入） | 用（5 个专属 provider） |
| deepDive | `deepDiveTools.ts` | 有（手工拼） | 有（拼进 system prompt 字符串） | 不用 |
| 图表 chat | `chat.ts` | **无** | 无 | 不用 |
| 研究库 chat | `researchChat.ts` | **无** | 无 | 用（文档上下文 provider） |
| 全屏助手 | `assistantChat.ts` | 有（手工拼） | **无**（给了 read_skill 却没告诉模型有哪些 skill） | 不用 |

## 目标

1. 图表 chat 和研究库 chat 获得研究三件套，能跨标的查行情、跑 skill 脚本、读仓库文件。
2. 三件套的装配收敛到一个共享 builder，五个 agent 共用。
3. 技能目录注入收敛到共享 MessagesEngine provider：凡有 read_skill 的 agent 都注入目录（顺带修掉全屏助手看不到技能列表的缺陷）。
4. analyst 的可泛化 provider 抽成共享版，analyst 换用，行为不变。

## 非目标

- 不统一会话生命周期（analyst 的一次性运行、chat 系的 conversationEngine 各自保留）。
- 不迁移纪律注入通道：chat / deepDive / researchChat / assistantChat 继续走 system prompt（`composeWithDiscipline`，fail-closed），analyst 继续走 provider。统一留给后续单独改。
- 不给任何 chat 场景增加写盘工具（write_note / write_journal）。对话不落盘结论；要沉淀就跑 deepDive。
- 核验闸门（verify_directional_read / submit_chat_answer）保持只针对当前图表标的。
- 画线工具保持只针对当前图表标的。

## 设计

### 1. 工具基座：`buildResearchTools`

位置：`app/packages/core/src/ai/agentTools.ts`（三个单工具 builder 已在此文件）。

```ts
interface ResearchToolsOptions {
  repoRoot: string;
  exec?: ExecFn;              // 默认 createDefaultExec(repoRoot)；调用方可传包装过的（如 analyst 的进度上报）
  skillIndex?: SkillMeta[];   // 默认 loadSkillIndex(skillSearchDirs(repoRoot))
  onSkillRead?: (name: string) => void;
}

function buildResearchTools(opts: ResearchToolsOptions): {
  tools: AgentTool[];         // [read_skill, bash, read_file]
  skillIndex: SkillMeta[];    // 回传给调用方喂 SkillCatalogProvider，避免重复加载
}
```

bash 的只读拦截（`isRejectedCommand`）、输出截断、超时等既有行为不变。

### 2. 上下文基座：共享 provider

新文件：`app/packages/core/src/ai/messages/sharedProviders.ts`。从 `analystMessagesEngine.ts` 迁出并泛化：

- `SkillContext`（原 `AnalystSkillContext` 改名迁入）。
- `SkillCatalogProvider(skills: SkillContext[])` —— 原样迁入，无 analyst 硬编码。
- `ActivatedSkillsProvider(skills, runtimeAdapter)` —— 原样迁入。
- `RunMetadataProvider(fields: { agent: string; symbol: string; origin?: string; startedAt: string; marketDate?: string; dataAsOf?: string })` —— `<agent>` 从硬编码 `analyst` 参数化，可选字段缺省不输出。
- `escapeXml` / `safeJson` 工具函数随迁。

`analystMessagesEngine.ts` 保留 analyst 专属的 `DataPackProvider` / `AnalystRunStateProvider`，改为从 sharedProviders 引入共享部分。`researchChat.ts` 的 `ResearchDocumentContextProvider` 留在原文件。

### 3. 各 agent 改动

**图表 chat（`chat.ts`）** —— 本次主目的：

- `ChatDeps` 增加 `exec?: ExecFn`（`repoRoot` 已有）。
- `buildTools` 追加 `buildResearchTools` 三件套；原有 5 个数据工具与核验闸门不动。
- 通过 `ConversationPreparedTurn.transformContext`（conversationEngine 已支持）挂一个 `MessagesEngine([SkillCatalogProvider])`，注入技能目录。
- `prompts.ts` 新增独立常量 `RESEARCH_TOOLING_RULES`（chat 与 researchChat 共用，拼接进各自 system prompt）：bash 只读、cwd 为仓库根、跨标的行情走 `longbridge` CLI、韩国存储链走 korea-market 脚本（TD-KOREA-01）、宏观走 fred 脚本；措辞参考 `assistantChat.ts` 现成的 system prompt；明确画线与核验仍只针对当前图表标的；引用外部数据要标时间属性（TD-DATA-02）。

**研究库 chat（`researchChat.ts`）**：

- `ResearchChatDeps` 增加 `exec?: ExecFn`。
- `buildTools` 追加三件套；`SkillCatalogProvider` 追加进它已有的 MessagesEngine processor 列表。
- system prompt 拼入 `RESEARCH_TOOLING_RULES`。

**全屏助手（`assistantChat.ts`）** —— 行为收敛 + 补缺陷：

- 手工拼的三件套改为 `buildResearchTools`。
- 通过 `transformContext` 挂 `SkillCatalogProvider`，模型从此能看到技能目录。

**analyst（`analyst.ts`）** —— 纯收敛，行为不变：

- 三件套改为 `buildResearchTools`（exec 传进度上报包装版，`onSkillRead` 传 `state.loadedSkillIds` 记录）。
- 共享 provider 改从 `sharedProviders.ts` 引入。

**deepDive（`deepDiveTools.ts` / `deepDive.ts`）**：

- 三件套改为 `buildResearchTools`，`write_note` 不变。
- 技能目录从 system prompt 字符串（`deepDiveAdapterPrompt(skillIndexPrompt(index))`）迁到 `SkillCatalogProvider`（经 `createAgentSession` 的 `transformContext`）。`deepDiveAdapterPrompt` 去掉技能列表参数；`skillIndexPrompt` 若无其他使用者则删除。

### 4. 数据流

三件套的能力来源不变：bash 在仓库根执行 `longbridge` CLI 与 `.claude/skills/**/scripts/*.py`，read_file 限仓库内路径，read_skill 按索引读 SKILL.md。Electron 与 server 两种宿主的 kernel 都跑在 node 进程里，`createDefaultExec` 无平台差异。

### 5. 错误处理

- 三件套自身的错误策略沿用现状（bash 失败返回文本、路径逃逸拒绝、输出截断）。
- 纪律加载 fail-closed 行为不变。
- `SkillCatalogProvider` 在技能索引为空时不注入（返回 null），不阻塞对话。

### 6. 测试

- `agentTools`：新增 `buildResearchTools` 的组装测试（默认 exec / 默认索引 / onSkillRead 回调 / skillIndex 回传）。
- `sharedProviders`：`analystMessagesEngine.test.ts` 中共享部分的用例迁移为共享 provider 测试；`RunMetadataProvider` 补 agent 参数化用例。
- `chat.test.ts` / `researchChat.test.ts`：断言工具列表包含三件套、技能目录出现在 provider 视图里；核验闸门与画线行为的既有用例保持通过。
- `assistantChat.test.ts`：断言技能目录注入。
- `analyst.test.ts` / `deepDive.test.ts`：既有用例保持通过；deepDive 补「技能目录改走 provider 后 system prompt 不再含技能列表」的断言。

## 风险与取舍

- **提示注入面扩大（接受的风险）**：图表 chat 与研究库 chat 会消费不可信文本（新闻、文档正文），挂上 bash 后注入指令可驱动命令执行。既有防线只有 bash 的写模式黑名单 + cwd 仓库根 + 上下文层的「数据仅作证据」包裹（catalog 字段全部 escapeXml）；单用户本地应用，按现状接受，不额外加防。
- **每轮变慢变贵**：chat 系可跑 bash 后，单轮可能多出数秒的 CLI 调用与更多 token。bash 输出 30k 字符截断兜底；prompt 里引导优先用便宜的预计算数据工具（read_data_pack 等），bash 只用于绑定工具覆盖不到的查询。
- **deepDive prompt 语义变化**：技能目录从 system prompt 迁到 first-user 注入，是本设计里唯一「非纯收敛」的行为变化，靠 deepDive 既有测试 + 一次实跑验证。
- **不做的统一**：纪律双通道（system prompt vs provider）继续并存，是有意为之——纪律是命根子，不与能力改动混在一刀里。
