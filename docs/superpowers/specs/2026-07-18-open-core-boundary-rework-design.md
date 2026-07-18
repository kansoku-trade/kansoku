# Open-core 边界重划（phase 3）设计

日期：2026-07-18
状态：已批准
前置：`2026-07-17-subscription-open-core-design.md`（phase 2，Dodo 订阅授权）

## 背景与问题

Phase 1/2 的 open-core 拆分把**所有** AI 代码搬进了私有仓 `app/pro`，并给整个 AI 面挂上了订阅门（`requirePro` 404 + `LicensedGuard` 403）。这一刀切得太粗，造成两类误伤：

1. **非 AI 的核心功能被收费**：研究库的文档列表与 markdown 阅读（`research.controller` 的 `GET /` 和 `GET /document`）只是读 `journal/` 与 `stocks/` 下用户自己写的文件，不产生任何 AI 成本，却因整个 research 模块搬进 pro 而要求订阅；QuickBar 的研究库入口在无 pro 构建里直接不渲染。这违背仓库定位——journal/stocks 是第一层「durable record」。
2. **自带 key 的 AI 功能被收费**：用户配置自己的 API key 后，token 成本由用户承担，这类功能不该再收订阅费。

## 决策：新的免费/收费分界

### 免费且开源（代码在公开仓 `app/packages/core` + `app/server` + `app/web`）

| 功能 | 说明 |
|---|---|
| 研究库浏览 | 文档列表 + markdown 阅读（journal/stocks） |
| 个股关注状态 | 标记关注、cockpit 分组；`symbolFollows` 表本就在 core schema |
| WS 频道骨架 | notifications / comments / analyst-runs / chat 等免费功能频道 |
| AI 设置基座 | 模型角色配置、自带 API key、provider 管理（含 LobeHub 设备登录——用户自己的账号与额度）、连通测试、用量统计 |
| 手动 AI 复评 | analyst 单次运行（reassess）+ AI 评论流展示 |
| 对话类 | 图表页 ChatDock、全局助手 /chat、对话建议 |
| macro 事件 AI 过滤 | eventFilter，一次 LLM 调用，用户自己的 key |

### 收费（代码留在私有仓 `app/pro`，需订阅激活）

| 功能 | 说明 |
|---|---|
| 个股自动跟踪 | scheduler 定时跑 analyst（含 triggers、每日 recap），产出评论流与通知 |
| 深度研究 deep-dive | 多轮长任务，产出个股档案 |
| 研究库 AI | AI 刷新文档、AI 编辑审阅、研究对话（researchChat） |

不收费但不开源（留 pro）：license/Dodo 整套、bench 私有基准。

## 代码搬迁映射（pro → core）

### 搬到 core

- **AI 基座**：`agentSession`、`agentTools`、`dataTools`、`datapack`、`models`、`modelsRuntime`、`settingsStore`、`credentialStore`、`secretBox`、`usage`、`usageStore`、`initAiSettings`、`prompts`、`promptPolicy`、`messages/*`、`conversationEngine`、`conversationShared`、`conversationStore`、`runLock`、`verifyRead`
- **功能层**：`analyst`、`analystMessagesEngine`、`commentator`、`comments`、`notices`、`follows`、`eventFilter`、`chat`、`chatStore`、`chatSuggestions`、`assistantChat`、`assistantChatStore`、`lobehub/*`
- **模块/控制器/IPC**：settings(AI)、chat、assistant、lobehub 的 service + controller + IPC 服务类；对应 WS 频道定义
- **research 拆分**：browse 部分（`list` / `get document`，即 `research.service.ts` 的文件系统读取）进 core 新建 research 模块；AI 子路由留 pro（见下）

### 留在 pro

- `scheduler`、`triggers`、`recap`（只被 scheduler 的每日复盘调用）、`deepDive`、`deepDiveTools`
- `researchChat`、`researchChatStore`、`researchRefresh`、`researchEdit.service`、`researchLibraryTools`
- `license/*`、`licensed.guard`、license controller/module/IPC
- `bench/*`（改为从 core 导入搬走的基座模块）

### research 路由拆分

- core 新增公共 research 模块：`GET /api/research`（列表）、`GET /api/research/document`（阅读），无任何门。
- pro 保留 research AI 子路由：`/api/research/chat*`、`/refresh*`、`/edits*`、`/chat/suggestions`，挂 `LicensedGuard`；pro 不存在时这些路由 404（现有 requirePro 缺席模式）。
- 同一 URL 前缀由两个模块分担，contract 里 research group 拆成 public browse + pro AI 两段。

## 门的新语义

- **`requirePro`（404，pro 缺席）**：只挡三个付费模块的路由。免费 AI 路由在纯开源构建里真实可用。
- **`LicensedGuard` / `requireLicensed`（403，pro 在场未订阅）**：只存在于 pro 内部的付费模块上。免费功能代码已在 core，物理上不再经过任何 license 检查。
- **`capabilities`**：`{pro, licensed, license?}` 结构不变。语义变为：`pro:false` → 付费功能 UI 隐藏；`pro:true && licensed:false` → 付费功能 UI 上锁并引导订阅；免费功能不看这两个值。
- **pro hooks 收窄**：`ProHooks` 只保留付费功能钩子（`requestImmediateFollow`（触发自动跟踪）、`startDeepDiveForNote`、`deepDiveStatus`、scheduler 启动等）。搬进 core 的功能（follows、comments、eventFilter、usage、reassess 手动运行等）改为 core 内部直调，`freeHooks` 中对应的空实现删除。`pro-api` 契约相应缩减，属破坏性变更，pro 与 core 同步升版。

## Web UI 变化

- **QuickBar**：研究库、AI 对话图标无条件渲染，去掉 `pro &&` 与锁态。
- **/research**：浏览对所有人开放；「AI 刷新」「AI 编辑审阅」「研究对话」入口按 capabilities 走隐藏（无 pro）或上锁（未订阅）。
- **/chat、ChatDock、设置页 AI 卡片**：无条件解锁。
- **个股页**：复评按钮免费可用；「AI 跟进 / 自动跟踪」开关与 deep-dive 入口走付费门。跟进开关是一个整体的付费入口——未订阅时该开关在所有出现处（个股页 `FollowAction`、首页 `WatchBoard`）一律上锁，点击弹订阅框，不写关注标记；订阅后开关生效并驱动 scheduler 自动跟踪。（服务端 `setSymbolFollowing` 本身不设 license 门，仅作纵深防御——未订阅用户在 UI 上够不到这个开关。）
- **LicenseModal / 设置「订阅与授权」区**：保留，文案改为只宣传三个付费功能。
- `featureGuard` 的 `locked` 语义收窄为「付费功能锁」，不再用于免费 AI 入口。

## 迁移策略（两阶段，各自可发版）

### Phase A —— 只改门（小，先发）

代码位置不动，官方带-pro 构建立刻恢复免费功能：

1. pro 仓：免费清单内的路由/服务摘掉 `LicensedGuard` / `requireLicensed`（research browse、chat、assistant、lobehub、aiSettings、reassess、usage 等）；付费三项保持。
2. core 仓：web 解锁对应 UI（QuickBar、PageRouter、ChatDock、设置 AI 卡片）——**只解锁 licensed 维度**；`pro:false` 时免费 AI 入口仍隐藏（路由此阶段还在 pro 里）。「无条件渲染」是 Phase B 的终态。付费入口改为按新语义上锁。
3. 纯开源构建此阶段暂无变化（AI 仍缺席），known limitation。

### Phase B —— 代码搬迁（大）

1. 按搬迁映射把文件移入 core（保持相对结构，`app/packages/core/src/ai/…`），改 import 路径；pro 内剩余模块改为从 `@kansoku/core` 导入基座。
2. research 模块拆分（core browse + pro AI），contract 同步拆分。
3. `pro-api` 契约收窄：`ProHooks` 缩减、`ProModule` 的 `tsukiModules` / `ipcServiceClasses` / `channels` 只剩付费与 license 相关项。
4. desktop：IPC channel allowlist（`groups.ts`）随 contract 调整——免费 AI 组变为 core 常驻，license 组保持 pro 提供。
5. 两仓各自提交；core 先合（带兼容旧 pro 的过渡加载失败提示即可），pro 跟进。

## 测试

- 既有门语义测试改写：`capabilitiesStore`、`featureGuard`、`PageRouter.license`、`LicenseModal`、desktop `groups.test.ts`（contract parity）。
- 新增：research browse 无门可访问（pro 缺席 + 未订阅两种状态）；免费 AI 路由在纯开源构建（pro 缺席）下工作；付费三项在未订阅时 403、pro 缺席时 404。
- 兜底：`cd app && pnpm test`；CI 的 pro-present build check（fetch-pro + typecheck + build + pro tests）。

## 明确不做

- 不动 Dodo/license 机制本身（激活、五态机、24h 复验照旧）。
- 不给免费版加用量限额或计量。
- 不把 bench、scheduler、deep-dive、研究库 AI 开源。
- macro 过滤不做规则版降级——无 key 时全量展示。
