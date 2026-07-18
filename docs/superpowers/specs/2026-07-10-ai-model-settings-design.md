# AI 模型设置（server 持久化 + web 设置页）设计

日期：2026-07-10（rev 2，经外部 review 重写）
状态：待评审

## 背景与目标

现在四个 AI 用途的模型全靠环境变量指定（`AI_COMMENT_MODEL` / `AI_ANALYST_MODEL` / `AI_DEEPDIVE_MODEL` / `AI_CHAT_MODEL`），API key 也散在 `.env` 里。换模型要改文件、记格式、重启。

本功能把模型配置和凭据全部迁进 server 持久化存储（SQLite），web 端提供 `/settings` 设置页：每种用途分别选 provider、模型、思考档位；API key 在界面里管理，加密落库。环境变量彻底退出——包括 pi-ai 内部的 env 回退路径，必须一并关死。

rev 2 变更来源：外部 review 证实 rev 1 有五处硬伤（env 回退关不掉、首启判断不可靠、「模型默认」不存在、无重启承诺有例外、单字符串 key 撑不起全目录 provider），本版全部重写。

## 需求决策（已与用户确认）

| 维度          | 决策                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 范围          | 模型选择 + API key 都进设置界面                                                                                                                                          |
| 环境变量      | 彻底切换：业务模型 key 的 env 读取全链路关闭；首启一次性从 env 导入存量                                                                                                  |
| provider 范围 | 本期只露出「单 API key 即可用」的 provider + `openai-codex`；但存储与认证层从第一天按 pi-ai 结构化 `Credential` 做（adapter 就绪，后续扩多字段/OAuth provider 不动架构） |
| 思考档位      | **不设「模型默认」选项**（运行时不存在该状态）：按模型列出实际支持档位（`getSupportedThinkingLevels`），必选，预填 `off`                                                 |
| 存储          | 现有 SQLite（drizzle 迁移），不新增配置文件                                                                                                                              |
| key 安全      | AES-256-GCM + 本地主密钥文件（不用 macOS 钥匙串，避免 headless 授权弹窗）                                                                                                |
| UI 形态       | 独立 `/settings` 页，顶栏齿轮入口                                                                                                                                        |
| 前端测试      | 仅「保存队列」纯逻辑模块加行为测试；其余前端场景走手动验收，不写组件快照                                                                                                 |

## 非目标

- 本期不露出多字段 provider（Cloudflare 需 key+账户 ID）、云环境凭据 provider（Bedrock / Vertex）、`openai-codex` 之外的 OAuth provider——目录里直接不出现，而非置灰。
- 不做多用户、鉴权、配额（见文末云服务演进备忘）。
- 不做设置导入导出、不做 `.env` 自动清理。

## 本期 provider 范围的判定

代码里维护一个显式 allowlist 常量 `SINGLE_KEY_PROVIDERS`（anthropic / openai / deepseek / google-gemini / xai / moonshot / kimi / openrouter / groq / mistral / together / fireworks / cerebras / minimax / zai 等，实现时按 pi-ai 目录核对），条件是 `provider.auth.apiKey` 存在且单 key 无附加字段即可完成请求。catalog 接口只返回 allowlist ∪ {`openai-codex`}。宁可白名单保守，也不做「自动探测是否单 key」。

## 数据模型

三张新表（drizzle 迁移 `0002_*.sql` + meta journal/snapshot 一并提交）：

```ts
export const aiRoleSettings = sqliteTable('ai_role_settings', {
  role: text('role').primaryKey(), // comment | analyst | deepDive | chat
  mode: text('mode').notNull(), // custom | disabled | inherit(仅 chat)
  provider: text('provider'), // mode=custom 时必填
  modelId: text('model_id'),
  thinkingLevel: text('thinking_level'), // mode=custom 时必填，∈ 该模型支持集
  updatedAt: text('updated_at').notNull(),
});

export const providerCredentials = sqliteTable('provider_credentials', {
  provider: text('provider').primaryKey(),
  secret: text('secret').notNull(), // 加密后的结构化 Credential JSON（见加密节）
  updatedAt: text('updated_at').notNull(),
});

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(), // 首个用途：env_import_v1 = "completed"
  value: text('value').notNull(),
});
```

Role 状态语义（显式三值，不再用「无行」表达两种意思）：

- `comment` / `analyst` / `deepDive`：`custom`（已配置）或 `disabled`（停用该层）。
- `chat`：`custom` / `inherit`（跟随 analyst 生效配置；analyst 为 `disabled` 或 stale 时 chat 同样视为未配置）/ `disabled`（追问接口返回未配置）。
- 首启搬家时四行全部写入（无 env 值的 role 写 `disabled`，chat 无值写 `inherit`），此后行常在，只改 `mode`。防御：读到缺行按上述默认处理并记日志。
- **stale 与 disabled 是两个状态**：`custom` 但模型已不在目录 = stale（配置还在、运行时该层停用、GET 标 `stale: true` 提示改选）；`disabled` 是用户主动关。

`secret` 里存的是 pi-ai 结构化 `Credential` 的加密 JSON。本期只会写入 `{ type: "api_key", key }`，但格式天然容纳 `env` 附加字段（Cloudflare 账户 ID 之类）和 `{ type: "oauth", ... }`——这就是 adapter 缝。`openai-codex` 不落这张表（见认证节）。

## 加密与主密钥

- 主密钥：32 字节随机，文件 `journal/charts/data/ai-secret.key`。
- **创建必须排他原子**：`open(path, "wx", 0o600)`；遇 `EEXIST` 读已胜出的文件。加载时校验：普通文件、权限 0600、恰好 32 字节。
- 主密钥三态：`ready` / `missing`（文件不存在，首次写 key 时创建）/ `invalid`（存在但校验失败）。三态通过 `GET /api/settings/ai` 暴露给 UI。
- `invalid` 或密文解不开时的恢复：UI 提供显式「重置全部凭据」操作——一个事务里清掉全部 `provider_credentials` 行，再排他原子重建密钥文件。没有静默自动重置。
- 算法：AES-256-GCM，**12 字节随机 IV、16 字节 authTag**，AAD 绑定 `"v1\0" + provider`——把两行合法密文互换后解密必须失败（防拼库调包）。密文格式 `v1:<iv>:<tag>:<ct>`（base64），`v1` 前缀留给以后换方案（如主密钥迁云端密钥管理服务）。
- 威胁模型：防数据库文件被拷走/误传时明文泄露；不防本机被攻破（密钥文件与库同机）。本地单人应用，此强度合理。

## 认证运行时架构

rev 1 的「只扩 `Agent.getApiKey`」不成立：pi-ai 的 `resolveProviderAuth` 在凭据存储查无此 provider 时会**落到 ambient 环境变量**（`auth/resolve.js` 末行），DB 删了 key、`.env` 旧 key 会悄悄接管。正确做法是接管整个认证上下文：

- **唯一 Models 实例**：新增 `ai/modelsRuntime.ts`，进程内只构造一次
  `builtinModels({ credentials: sqliteCredentialStore, authContext: isolatedAuthContext })`。
  - `sqliteCredentialStore` 实现 pi-ai 的 `CredentialStore` 接口（`read` / `modify` / `delete`），底下是 `provider_credentials` 表加解密。`modify` 按 pi-ai 约定对同一 provider 串行（better-sqlite3 同步事务天然满足单进程串行）。
  - `openai-codex` 在这个 store 里是一个特殊分支：`read`/`modify` 映射到 `~/.codex/auth.json`（复用现有 `codexAuth.ts` 的路径与解析，重构为 store adapter），返回 `{ type: "oauth", access, refresh, expires }`。token 刷新交给 pi-ai 的 `Models.getAuth()`（它在 `modify` 内跑刷新，天然防并发双刷）；`codexAuth.ts` 自己的刷新循环退役。
  - `isolatedAuthContext`：注入一个**不读业务模型 key 环境变量**的环境视图（对 `*_API_KEY` 一类查询一律返回 undefined）。这样 ambient 回退查到的是空，「DB 没有 = 真没有」。
- **Agent 走同一实例**：`agentSession.ts` 的 factory 改为传 `streamFn`，内部委托 `modelsRuntime.stream(...)`（pi-agent-core 的 `agent-loop` 原生支持 `streamFn` 注入）；不再传 `getApiKey`。生产 Agent、`/api/settings/ai/test`、未来任何调用共用这一条认证路径。
- key 缺失的表现：`Models.getAuth()` 返回 undefined → 请求以明确错误失败（该层报「provider 未配置凭据」），**绝不静默回退 env**。
- `aiConfig()` 返回的模型对象必须是独立副本（`{ ...model }`），不得改写 `builtinModels()` 目录里的共享对象。

## 思考档位

- 运行时事实：pi-ai 每次请求都带明确档位，缺省即 `off`；对推理模型甚至主动发 `effort: "none"`。**不存在「模型默认」状态**，所以 UI 不提供这个选项。
- catalog 为每个模型返回 `thinkingLevels: getSupportedThinkingLevels(model)`；非推理模型只有 `["off"]`（下拉框单项即视为锁定）。
- `PUT roles/:role` 与 `/test` 都按目标模型的支持集校验 `thinkingLevel`，不合法 400；不做静默 clamp（clamp 只用于首启搬家）。
- commentator 的会话缓存键（现为 provider/id）**加入 thinkingLevel**：`provider/id/thinkingLevel`——只改档位也必须建新会话，不复用旧 Agent。

## 配置生效语义（「无重启」的准确边界）

- `aiConfig()` 保持同步签名，内部读 settingsStore 内存缓存；写接口更新后写穿刷缓存。settingsStore 持有单调递增 `revision`，每次写 +1。
- **scheduler 改为始终建 timer**：现在 `scheduler.ts:263-269` 启动时无 comment 模型就不建 timer（之后配了也不会跑）。改为 timer 常在，每个 tick 先读 `aiConfig()` 快照，无模型即本 tick 空转。生命周期最简单，也消除「启动时 disabled、页面启用后要重启」的坑。
- 事件相关性缓存（`services/events.ts:101-109`，按 symbol/fingerprint 缓一小时）：缓存键加入 settings `revision`，配置一变旧结果全部失效。
- 进行中的任务用旧配置跑完，下一个任务用新配置（chat 每轮、deepDive/analyst 每次启动时取）——这条写进设置页页脚说明。

## server 接口

新增 `routes/settings.ts`，注册 `prefix: "/api/settings"`。**所有响应遵守仓库统一信封**：成功 `{ ok: true, data: ... }`，失败 `{ ok: false, error, hint? }` + 合理 HTTP 状态（web 的 `api.ts` 会把不带 `data` 的成功响应判为 malformed，rev 1 的 `/test` 返回 `{ ok: true }` 就踩了这个）。

| 接口                                            | 行为                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/settings/ai`                          | data：四个 role 的 `{ mode, provider, modelId, thinkingLevel, stale }`；已存凭据列表 `{ provider, masked, updatedAt }`（掩码尾四位，永不回明文）；`masterKey: "ready" \| "missing" \| "invalid"`                                                        |
| `PUT /api/settings/ai/roles/:role`              | body `{ mode, provider?, modelId?, thinkingLevel? }`。校验：role 合法；`inherit` 仅 chat；`custom` 时 provider 在本期范围内、模型在目录里、thinkingLevel ∈ 该模型支持集。整行原子替换                                                                   |
| `PUT /api/settings/ai/credentials/:provider`    | body `{ key }`。校验 provider ∈ allowlist（`openai-codex` 400：OAuth 型不收 key）。加密落库                                                                                                                                                             |
| `DELETE /api/settings/ai/credentials/:provider` | 删凭据行                                                                                                                                                                                                                                                |
| `GET /api/settings/ai/catalog`                  | data：本期范围内 provider 列表，每个含模型列表（id、显示名、`thinkingLevels`）+ 认证状态 `{ kind: "api_key", status: "configured" \| "missing" }` 或 `{ kind: "oauth", status: "configured" \| "missing" \| "error" }`（codex 读 auth.json 可达性判定） |
| `POST /api/settings/ai/test`                    | body `{ provider, modelId, thinkingLevel }`，同 PUT 校验。经唯一 Models 实例发最小请求（上限几个 token），**服务端 25s 超时 + abort**；成功 `{ ok: true, data: { latencyMs } }`；失败 `{ ok: false, error: <稳定错误类别>, hint: <脱敏消息> }`          |
| `POST /api/settings/ai/reset-credentials`       | 主密钥 `invalid` 时的恢复：事务清全部凭据行 + 重建密钥文件                                                                                                                                                                                              |

错误消息脱敏：`/test` 的 hint 与所有日志输出先过一遍清洗（剔除 `Bearer …`、`sk-…`、当前完整 key 字面量、authorization header 模式），只留稳定类别 + 安全摘要。「不含明文 key」是硬断言，优先级高于「错误原文透出」。

## 首启搬家

- 判定改用持久标志：`app_meta` 里 `env_import_v1 = "completed"`。**不用「表空」判断**——否则用户删光配置重启会复活旧 `.env`，中途失败还留半迁移。
- 无标志时执行，**单个事务**内完成：四个 `AI_*_MODEL` 解析写入 `ai_role_settings`（`:level` 后缀用 `clampThinkingLevel` 归到支持集，无后缀写 `off`；无值的 role 写 `disabled`/chat 写 `inherit`）→ 对引用到的 allowlist provider 用 `getEnvApiKey`（准确 import：`@earendil-works/pi-ai/compat`）取 env key 加密写入 → 写 `env_import_v1` 标志 → 提交。任一步失败整体回滚，下次启动完整重试。
- `getEnvApiKey` 返回 `<authenticated>` 占位符（Bedrock 等环境凭据的标记）时**拒绝持久化**该条。
- 单个 model 串解析失败：跳过该 role（写 `disabled`）记日志，不中断事务。

## 启动顺序

`apps/server/src/index.ts` 固定为：`loadDotenv()` → DB migration → `initAiSettings()`（搬家 + 装载 settingsStore 缓存 + 构造唯一 Models 实例）→ `createApp()` → `startAiScheduler()`。**settingsStore / modelsRuntime 禁止在模块顶层读 DB 或执行搬家**——全部走显式 init，测试才可注入。

## 前端设置页

- 路由 `/settings`，顶栏齿轮入口；复用 `ui/` 组件；`SettingsPage`（统一持有 overview + catalog 状态）+ `ProviderCredentialsCard` + `RoleModelsCard`。
- **卡片一：Provider 与凭据**——已配 provider 一览（名字、掩码、更新时间、更新/删除）；「添加」下拉只列本期范围 provider；`openai-codex` 徽标显示 OAuth 三态（已登录 / 未登录（提示跑 `codex` 登录）/ 异常）。主密钥 `invalid` 时整卡置警示态 + 「重置全部凭据」按钮（二次确认）。
- **卡片二：模型分配**——四行（盘中快评 / 升级分析 / 深度研究 / 追问）。每行：模式（chat 三选：自定义/跟随分析/停用；其余两选）→ provider 下拉 → 模型下拉（联动）→ 思考档位下拉（该模型支持集，预填 `off`）→ 测试按钮。provider 未配凭据行内黄字；stale 模型黄字提示改选。
- **保存队列（即改即存的并发语义）**：
  - 每个 role 一份「完整快照」状态；**provider 变更时同步选定该 provider 的默认模型**（列表第一个）+ `off` 档位，作为一个快照发**一次** PUT——绝不发「新 provider + 旧 modelId」的非法中间态。
  - 每 role 一条串行保存队列，连续变更合并为最新快照；PUT 与模式切换（含 disabled）进同一队列，杜绝乱序覆盖。
  - 失败回滚到最后一次服务器确认的快照，行内红字 + 「未保存」标记。
  - 凭据卡片变更成功后，同步刷新 role 行的警告状态（跨卡片失效）。
  - 队列实现为纯 TS 模块（如 `pages/settings/saveQueue.ts`，无 DOM 依赖），**加 vitest 行为测试**（web 包为此加最小 vitest 配置）：合并、串行、失败回滚、DELETE/PUT 同队列。组件本身不写测试。

## 受影响文件清单

**新增**：`ai/modelsRuntime.ts`、`ai/settingsStore.ts`、`ai/secretBox.ts`、`routes/settings.ts`、`drizzle/0002_*.sql`（+ meta）、`web/src/pages/settings/*`。

**修改**：

- `ai/models.ts` — `aiConfig()` 改读 store；`parseModelRef`/`resolveModel` 留给搬家。
- `ai/agentSession.ts` — `getApiKey` 换 `streamFn` 注入。
- `ai/codexAuth.ts` — 重构为 CredentialStore 的 codex adapter，自带刷新循环退役。
- `ai/scheduler.ts` — timer 常在、tick 内取配置。
- `ai/commentator.ts` — 会话键加 thinkingLevel。
- `services/events.ts` — 相关性缓存键加 settings revision。
- `db/schema.ts`、`src/index.ts`（启动顺序）、`src/app.ts`（注册路由）。
- **提示文案改指向 `/settings`**（不再教用户设 env）：`routes/chat.ts`、`routes/symbols.ts`、`web/src/pages/cockpit/useDeepDive.ts:117-120`。
- `scripts/ai-smoke.ts`、`scripts/deep-dive-smoke.ts` — 改读 settingsStore 而非 `AI_*_MODEL`。
- `apps/README.md` — env 配置说明段改写为设置页说明。

## 测试

server（vitest）：

- secretBox：加解密往返；篡改报错；**两行密文互换解密必须失败**（AAD）；IV/tag 长度；密钥文件 `wx` 创建、`EEXIST` 走读取、损坏文件判 `invalid`；32 字节校验。
- settingsStore：CRUD + revision 递增；chat 三态语义；stale 返回 null；缺行按默认。
- 搬家：标志缺失才跑、事务中途失败全回滚可重试、`:level` clamp、`<authenticated>` 拒收、表非空但无标志仍执行（以标志为准）。
- 认证：**DB 无凭据 + env 留有同名 key 时请求必须失败**（env 回退关死的回归测试）；codex adapter 映射 auth.json；`streamFn` 路径生产/test 共用同一实例。
- 路由（fastify inject）：信封格式（成功必有 `data`）；全部校验拒绝路径；**任何响应与日志不含明文 key 的专门断言**；`/test` 成功/失败/超时三路（注入假 Models）；reset-credentials 事务性。
- scheduler/commentator：boot 时 disabled、运行中启用后下一 tick 生效；同模型改 thinkingLevel 下一轮换新 Agent。
- 现有依赖 env 版 `aiConfig()` 的测试改为注入 store。
- 迁移：从现有 `0001` 库升级到 `0002` 的实测。

web（vitest，仅此一个模块）：`saveQueue` 行为测试（合并到最新、串行、失败回滚、混合 PUT/DELETE 顺序）。

## 手动验收

1. `.env` 留旧 key、界面删掉 DB 凭据 → 该层请求明确报错，不偷用 env。
2. 删光全部设置重启 → 不复活 `.env`（标志仍在）。
3. 备份删 `app.db` 重启 → 搬家一次成功导入现 env 配置。
4. boot 时快评 disabled，页面启用 → 下一个 tick 自动开跑，不重启。
5. 同模型 low→high → 下一轮点评用新档位（usage 表核对）。
6. chat 三态各自行为正确（自定义模型 / 跟随分析 / 停用报未配置）。
7. provider 快速连续切换 → 无非法中间态请求，最终状态 = 最后一次选择。
8. 保存失败（拔网线/杀 server）→ 行内回滚 + 未保存标记。
9. 密钥文件手工写坏 → UI 显示 invalid，重置流程可走通，重置后重新填 key 可用。
10. 设置页所有下拉里只出现 allowlist provider + codex；Cloudflare / Bedrock / Vertex 不可见。
11. 全流程：填 key → 配模型 → 测试通过 → intraday 图发追问 → `ai_usage` 记录新模型。

## 云服务演进备忘（不在本期范围）

1. **账号与多租户**：登录体系、所有表加租户隔离、接口鉴权（现状单人 localhost 裸奔）。
2. **模型 key 商业模式**：用户自带 key（本期 CredentialStore + `v1:` 信封直接演进，主密钥迁云端密钥管理服务）vs 平台代付按量计费（`ai_usage` 已按次记 token 与成本，是计费/配额地基）。
3. **数据层搬家**：SQLite + 磁盘文件 + 进程内推送 → Postgres + 对象存储 + 共享消息通道。
4. **AI agent 圈养**：深研 agent 能写仓库文件，云上必须沙箱、限工具、防提示注入。
5. **行情授权与合规**：长桥个人账户数据对外属再分发；AI 投资分析对外有投资建议边界/牌照问题。

对本期的硬约束：**新代码不读 `process.env` 拿业务配置，一律走 settingsStore**——为多租户留的缝。
