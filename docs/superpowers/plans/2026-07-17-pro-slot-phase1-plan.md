# Pro 插槽化第一阶段实现计划

Spec:`docs/superpowers/specs/2026-07-17-subscription-open-core-design.md`
范围:插槽架构落地 + 免费模式可跑。Dodo 激活是第二阶段,本计划不涉及。
分支:`feat/pro-slot`

## 全局约束(每个任务都适用)

- **公开代码不得静态 import `@kansoku/pro`**。唯一例外是 loader 里的动态 import,且必须写成打包器无法静态解析的形式(变量 specifier 或 `createRequire`),包缺失时 try/catch 落入免费模式,不抛错不打日志刷屏(单行 info 即可)。
- **社区构建约束**:`apps/pro/` 目录不存在时,`pnpm install`、`pnpm -r typecheck`、`pnpm -r test`、`pnpm dev`、`pnpm build` 全部必须成功;AI 功能入口在 UI 上隐藏,其余功能完整。
- 类型可以公开:`@kansoku/pro-api` 与 contract 里的 AI 路由/事件类型留在公开侧。
- 迁移策略(对 spec 的修正):历史迁移 0000–0007 含 AI 表,已发布不可拆,**保留在公开 core 的 drizzle 目录**;闲置表对免费模式无害。今后新的 AI 表迁移放 pro 包,pro-api 预留 `migrations?: string`(迁移目录路径)字段,本阶段不实现第二迁移执行器。
- 注释零容忍(见仓库规则);本仓库文档一律中文白话,代码标识符 English。
- 每任务只跑与改动相关的包的 typecheck/test,不全仓跑。
- 测试随代码走:搬到 pro 的实现,其测试同步搬;留在公开侧的测试不得 import pro 实现。

## 目标架构速览

- `packages/pro-api`(公开,新包 `@kansoku/pro-api`):纯类型。`ProModule` 接口定义 pro 提供什么:`tsukiModules`(server 路由模块)、`ipcServiceClasses`(desktop IPC)、`channels`(realtime 通道注册)、`hooks`(非 AI 代码需要的反向依赖:宏事件过滤、follows、comments、settings revision)、`startScheduler`、`initRuntime(db, secretBox)`、`migrations?`。以及 core 递给 pro 的 `ProHostContext`(db 访问、realtime hub、Longbridge 客户端、数据根目录等,以实际需要为准)。
- `packages/core/src/pro/registry.ts`(公开):`registerProModule(m)` / `getPro()` / `isProPresent()`,以及每个 hook 的免费模式默认实现(宏过滤=恒真直通、follows/comments=空列表、scheduler=no-op)。
- `packages/core/src/pro/loader.ts`(公开):动态 import `@kansoku/pro` → 成功则 register,失败则免费模式。server 的 `runtimeInit.ts` 与 desktop 的 `boot/kernel.ts` 都在启动早期 await 它。
- `apps/pro/`(gitignored 插槽目录,内含独立 git 仓库,将来 push 到私有 remote):`@kansoku/pro` 包,现 `packages/core/src/ai/` 全量迁入,加上 AI 专属的 service/controller/IPC 壳。
- capabilities:contract 新增 `capabilities` 组,`GET /api/capabilities` → `{ pro: boolean, licensed: boolean }`(本阶段 pro 加载成功即 `{pro:true, licensed:true}`,Dodo 接入后 licensed 才有真语义)。web 启动时拉一次存 store,AI 入口(QuickBar 的 /research、/chat、cockpit ChatDock、settings 的 AI 分节)按 `pro` 显隐。

## Task 1: pro-api 类型包 + registry + loader 骨架

- 新建 `packages/pro-api`:`package.json`(name `@kansoku/pro-api`,type module,仅类型导出)、`src/index.ts` 定义 `ProModule`、`ProHostContext`、`ProHooks` 及 capabilities 形状 `{ pro: boolean, licensed: boolean }`。字段以"目标架构速览"为准;hook 签名照抄现有函数签名(`filterMacroForSymbol`、`listFollowedSymbols`、`setSymbolFollowing`、`listComments`、`listAllCommentDates`、`activeSettingsRevision`),从现文件抽类型,不改语义。
- `pnpm-workspace.yaml` packages 增加 `packages/pro-api` 与 `pro/*`(后者现在匹配不到任何目录,须验证 pnpm install 不报错)。
- 新建 `packages/core/src/pro/registry.ts`(含免费默认 hooks)与 `packages/core/src/pro/loader.ts`(动态 import,规避静态解析)。core 的 package.json 加 `@kansoku/pro-api` 依赖(types)。
- 本任务只搭骨架,不接线:现有代码行为零变化。loader 此时找不到 `@kansoku/pro` 是预期,写一个 core 单测:loader 在包缺失时返回免费模式且 registry 的默认 hooks 生效。
- 验收:`pnpm --filter @kansoku/pro-api --filter @kansoku/core typecheck`、core 新增测试绿。

## Task 2: 反向依赖倒置(非 AI 代码经 registry 取 hooks)

- 改 `packages/core/src/services/events.ts`(`filterMacroForSymbol`、`activeSettingsRevision`)、`services/store.ts`(`setSymbolFollowing`)、`services/cockpit/board.ts`(`listComments`、`listFollowedSymbols`)为经 `registry` 的 hooks 取用,不再直接 import `../ai/*`。
- 过渡态:在 core 启动装配处(server `runtimeInit.ts` 初始化链、desktop `boot/kernel.ts` 同位置之前的公共点——放 `packages/core/src/pro/builtin.ts`)临时把现有 ai/ 实现注册为 builtin pro module 的 hooks 部分,行为与现状完全一致。builtin 注册本身可以静态 import ai/(ai/ 此时还在 core 内,Task 6 会把这个文件随迁移删除)。
- `realtime/channelProtocol.ts`:把 7 个 AI 模块的静态 import 改为通道注册机制——AI 通道 kind 由注册方提供,builtin 注册时带上;pro 缺席时这些通道 kind 不存在,WS 订阅收到未知 kind 按现有错误路径处理(确认 web 端订阅失败不会崩,只是无数据)。
- 相关既有测试(events、board、channelProtocol、follows 等)改为经 builtin 注册后再跑,全部保持绿。
- 验收:core 测试绿;`pnpm dev` 手动冒烟(图表 + chat 都活着)。

## Task 3: 路由与 IPC 注册动态化 + capabilities

- contract:新增 `contract/capabilities.ts`(组 `capabilities`,`GET /capabilities`),挂入 `contract/index.ts`。
- server:`app.module.ts` 的 AI 模块(Assistant/Research/Chat/Settings 中 AI 部分/LobeHub/Overview 中 AI 部分/Symbols 中 AI 部分)改为从 registry 组装——本阶段 builtin 恒在,行为不变;新增 `CapabilitiesModule` 返回 registry 状态。混合组(settings/symbols/overview)本阶段不拆组:整组仍注册,AI 子路由的 handler 在 pro 缺席时返回 404(统一走一个 `requirePro` guard),路由 parity 测试相应调整(允许 AI 路由在 pro 缺席时 guard 化,parity 断言在"builtin 在场"环境下跑,维持全量校验)。
- desktop:`ipc/index.ts` 与 `ipc/groups.ts` 的 AI IPC 类改为 registry 提供,`createServices` 前拼接。
- web:`client` 增加 capabilities 调用;新建 capabilities store(启动拉取一次);`QuickBar` 的 /research 与 /chat 入口、`PageRouter` 对应路由、cockpit `ChatDock`、settings 的 AI 分节按 `pro:false` 隐藏(路由直接进则显示"此构建不含 AI 功能"占位)。
- 验收:server routeParity 与路由测试绿;web typecheck;手动:正常构建下 UI 无变化,临时把 builtin 注册注掉可见 AI 入口消失、图表正常。

## Task 4: AI 实现整体迁入 apps/pro(@kansoku/pro)

- 新建 `apps/pro/`(gitignore 加 `/pro/`,目录内 `git init` 独立仓库,自带 package.json name `@kansoku/pro`,依赖 `@kansoku/pro-api`、`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core` 等 AI 专属 deps,从 core 的 package.json 移除这些 deps)。
- `packages/core/src/ai/` 全目录 `git mv` 出 core、落入 `apps/pro/src/`(公开仓库这边表现为删除,pro 仓库表现为新增;两边各自提交)。
- AI 专属的 service/controller/IPC 壳同步迁入:core `modules/` 里的 assistant/research/chat/lobehub 服务、server 对应 controller、desktop 对应 IPC 类,以 pro-api 的 `tsukiModules` / `ipcServiceClasses` 形态从 pro 导出。混合文件(symbols.service、settings.*、overview.service)只迁 AI 函数,留下的部分经 hooks 调用。
- `pro/builtin.ts` 删除;loader 的动态 import 现在真正生效。contract 里 AI 类型 import(`../ai/*`)改为从 `@kansoku/pro-api` 取(类型移入 pro-api)。db schema 的 AI 表定义保留在公开 core(迁移策略见全局约束);`schema.ts` 顶部 `AgentMessage` 类型 import 改为 pro-api 内定义的等价类型或 `unknown` payload 类型别名,公开侧不得依赖 pi-agent-core。
- ~40 个 AI 测试随迁到 `apps/pro/test/`,pro 包配 vitest;留在 core 的测试(events/board/channelProtocol 等)在"pro 在场"与"缺席"两种态各跑一遍关键断言。
- 验收:pro 在场:全量测试绿、`pnpm dev` 冒烟;pro 缺席(临时 mv 走 apps/pro):core+server+web typecheck/test 绿、`pnpm dev` 起得来、UI 隐藏 AI。

## Task 5: 双态 CI 与构建链

- 公开 CI(现有 workflow):固定在 pro 缺席态跑 install/typecheck/test/build——这就是"社区能跑"的持续验证。
- release 链:`release-dry-run.sh` 与 electron-builder 打包路径确认包含 `apps/pro`(存在时);新增 `scripts/fetch-pro.sh` 占位(clone 私有 remote 到 apps/pro,remote URL 走环境变量,本阶段脚本就绪但 CI 不配 key,由用户后续在 GitHub 建私有仓库并配 deploy key)。
- desktop 打包验证:`pnpm package:desktop` 在 pro 在场时产物含 pro 代码且 app 启动 AI 可用(dry-run 脚本级验证即可)。
- 验收:公开 CI 配置在 pro 缺席态通过;dry-run 脚本跑通。

## Task 6: 收尾与文档

- `apps/README.md` 增加 open-core 说明:社区构建=免费版、`apps/pro` 插槽机制、`@kansoku/pro-api` 接口指引(中文白话)。
- spec 的迁移策略小节按全局约束里的修正更新。
- 全仓一次 `pnpm -r typecheck`(此时允许)+ 全量测试,清理遗留 TODO。
