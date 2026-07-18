# Open-core 边界重划（phase 3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把误伤的免费功能从订阅门后放出来（Phase A），再把免费 AI 代码从私有仓 `app/pro` 搬回开源 core（Phase B）。

**Architecture:** 两阶段各自可发版。Phase A 只动门：pro 仓摘 `LicensedGuard`/`requireLicensed`，core 仓 web 按 licensed 维度解锁并给付费入口上锁。Phase B 按 spec 的搬迁映射把基座与免费功能层移入 `app/packages/core`，research 模块拆成 core browse + pro AI，`pro-api` 契约收窄。

**Tech Stack:** pnpm workspace、Tsuki (Hono)、electron-ipc-decorator、vitest、React。

**Spec:** `docs/superpowers/specs/2026-07-18-open-core-boundary-rework-design.md`

## Global Constraints

- 两个 git 仓：`trade-skills`（公开，含 app/）与 `app/pro`（私有 `Innei/kansoku-pro`）。各自独立提交，禁止跨仓 commit。
- 付费三项不动门：`deepDive.ts` 的 `requireLicensed()`、`scheduler.ts` 的 `isLicensed` 检查、license 模块整套保持原样。
- 测试命令：pro 仓 `cd app/pro && pnpm test`；公开仓 `cd app && pnpm test`。只跑受影响的包，勿全量 lint。
- 文档/注释遵循仓库规则：零注释默认；本计划的所有产物代码不加解释性注释。
- 每个任务一个 commit，commit message 用 plain English，不加 AI 署名。

---

## Phase A —— 摘门（先发版）

### Task A1: pro 仓 —— assistant / chat / lobehub 控制器摘 LicensedGuard

**Files:**
- Modify: `app/pro/src/server/modules/assistant/assistant.controller.ts`（22 行 `@UseGuards(LicensedGuard)`）
- Modify: `app/pro/src/server/modules/chat/chat.controller.ts`（13 行）
- Modify: `app/pro/src/server/modules/lobehub/lobehub.controller.ts`（8 行）
- Test: pro 仓现有 403 断言测试（`rg -l "LICENSE_REQUIRED" app/pro/src --glob '*test*'` 定位）

**Interfaces:**
- Produces: 上述三组路由在 pro 在场、未订阅时直接可用（不再 403）。

- [ ] **Step 1:** 三个 controller 删除 `@UseGuards(LicensedGuard)` 装饰器行和 `LicensedGuard` import 行。
- [ ] **Step 2:** 定位并改写断言这些路由 403 的测试：未订阅状态下期望正常响应（`ok: true`）。保留 license 路由自身的测试。
- [ ] **Step 3:** Run: `cd app/pro && pnpm test`，Expected: PASS。
- [ ] **Step 4:** Commit（pro 仓）: `git -C app/pro commit -am "feat: ungate assistant/chat/lobehub from license (free with own key)"`

### Task A2: pro 仓 —— research 控制器拆门（browse 免费，AI 收费）

**Files:**
- Modify: `app/pro/src/server/modules/research/research.controller.ts`

**Interfaces:**
- Produces: `GET /api/research` 与 `GET /api/research/document` 无门；`/chat*`、`/refresh*`、`/edits*`、`/chat/suggestions` 未订阅时仍 403。

- [ ] **Step 1:** 删除类级 `@UseGuards(LicensedGuard)` 与其 import；改为在每个 AI 方法体首行调用 `requireLicensed()`：

```ts
import { requireLicensed } from "../../../license/licenseGate.js";

  @Get("/chat")
  async getChat(/* 参数原样 */) {
    requireLicensed();
    // 原方法体不变
  }
```

覆盖方法：`getChat`、`postMessage`（/chat/messages）、`abortChat`、`suggestions`、`getRefresh`、`startRefresh`、`abortRefresh`、`listEdits`、`applyEdit`、`rejectEdit`、`undoEdit`。`list` 与 `get`（/document）不加。

- [ ] **Step 2:** 写/改测试：未订阅时 `GET /api/research` 与 `GET /api/research/document` 返回 200，`POST /api/research/chat/messages` 返回 403。
- [ ] **Step 3:** Run: `cd app/pro && pnpm test`，Expected: PASS。
- [ ] **Step 4:** Commit（pro 仓）: `"feat: split research gate — browse free, AI routes licensed"`

### Task A3: pro 仓 —— 服务与 hooks 摘门

**Files:**
- Modify: `app/pro/src/modules/settings/aiSettings.service.ts`（33/45/54/62/81/93/144/149/171 行的 9 处 `requireLicensed();`）
- Modify: `app/pro/src/index.ts`（`reassessSymbol` 的 `requireLicensed()`，约 151 行；`usageSummary` 的 `isLicensed()` 空返回分支，约 187 行）

**Interfaces:**
- Produces: AI 设置基座、手动复评、用量统计不再受 license 限制。`deepDive.ts`、`scheduler.ts` 的门保持不变。

- [ ] **Step 1:** 删除 aiSettings.service 的 9 处 `requireLicensed();` 及（若已无引用）import。
- [ ] **Step 2:** `index.ts`：`reassessSymbol` 删除 `requireLicensed()`；`usageSummary` 改为直接 `return summarizeUsage(date, await listUsage(date))`，删除 `isLicensed()` 分支。确认 `requireLicensed`/`isLicensed` import 仍被 deepDive/scheduler 引用路径需要，仅清理本文件未用的。
- [ ] **Step 3:** 更新相应测试（未订阅时 aiSettings 读写、reassess、usage 可用；deep-dive 仍 403）。
- [ ] **Step 4:** Run: `cd app/pro && pnpm test`，Expected: PASS。
- [ ] **Step 5:** Commit（pro 仓）: `"feat: ungate ai settings, manual reassess, usage from license"`

### Task A4: pro 仓 —— desktop IPC 选择性摘门

**Files:**
- Modify: `app/pro/src/ipc/licenseGateIpc.ts`
- Modify: `app/pro/src/ipc/index.ts`

**Interfaces:**
- Produces: `gateLicensedIpc(Ctor, methods?: string[])` —— 提供 `methods` 时只包裹这些方法，省略时包裹全部（保持旧行为）。

- [ ] **Step 1:** `licenseGateIpc.ts` 增加可选方法白名单参数：

```ts
export function gateLicensedIpc<T extends IpcServiceConstructor>(Ctor: T, methods?: string[]): T {
  const proto = Ctor.prototype as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === "constructor") continue;
    if (methods && !methods.includes(key)) continue;
    // 其余逻辑原样
```

- [ ] **Step 2:** `ipc/index.ts` 改为：

```ts
export const ipcServiceClasses = [
  AssistantIpc,
  ChatIpc,
  LobeHubIpc,
  gateLicensedIpc(ResearchIpc, [
    "getChat", "postMessage", "abortChat", "suggestions",
    "getRefresh", "startRefresh", "abortRefresh",
    "listEdits", "applyEdit", "rejectEdit", "undoEdit",
  ]),
  LicenseIpc,
];
```

- [ ] **Step 3:** 写测试：未订阅时 `ResearchIpc.list` 正常、`ResearchIpc.startRefresh` 返回 `LICENSE_REQUIRED` envelope；`ChatIpc` 任一方法正常。
- [ ] **Step 4:** Run: `cd app/pro && pnpm test`，Expected: PASS。
- [ ] **Step 5:** Commit（pro 仓）: `"feat: selective license gating for desktop ipc"`

### Task A5: core 仓 —— web 解锁 licensed 维度

**Files:**
- Modify: `app/web/src/pages/home/QuickBar.tsx`（研究库/AI 对话图标的 `locked` 分支）
- Modify: `app/web/src/PageRouter.tsx`（66、71 行的 `licensed ? … : <LicenseGateEmptyState />`）
- Modify: `app/web/src/pages/SymbolCockpit.tsx`（297 行 ChatDock 三元）
- Modify: `app/web/src/pages/settings/SettingsPage.tsx`（175 行 `aiUnlocked`、229 行 `!licensed` 分支）
- Test: `app/web/src/pages/home/QuickBar.test.tsx`、`app/web/src/PageRouter.license.test.tsx`

**Interfaces:**
- Consumes: `useCapabilities()` 的 `{pro, licensed}`；`useFeatureGuard()` 保持现签名，仅付费入口继续使用。
- Produces: 免费 AI UI 只看 `pro`；`licensed` 只被付费入口消费。

- [ ] **Step 1:** QuickBar：两个图标删除 `locked ? … : …` 分支，保留 `pro && <a …>` 形式（Phase A 里 `pro:false` 仍隐藏——路由还在 pro）。
- [ ] **Step 2:** PageRouter：`/research`、`/chat` 改为 `pro ? <Page /> : <NotFound…>`（沿用现有 pro:false 处理），删除 `LicenseGateEmptyState` 分支。
- [ ] **Step 3:** SymbolCockpit：`dock={pro ? <ChatDock … /> : null}`，删除 `LockedChatBar` 分支（组件文件此阶段保留，Phase B 清理）。
- [ ] **Step 4:** SettingsPage：`aiUnlocked = pro`；229 行 `!licensed` 的锁定分支删除（「订阅与授权」区本身保留）。
- [ ] **Step 5:** 更新测试：unlicensed 状态下 QuickBar 图标可点、/research /chat 可达、设置 AI 卡片可见。
- [ ] **Step 6:** Run: `cd app && pnpm --filter @kansoku/web test`，Expected: PASS。
- [ ] **Step 7:** Commit: `"feat(web): unlock free AI surfaces from license dimension"`

### Task A6: core 仓 —— 付费入口上锁 + 订阅文案对准

**Files:**
- Modify: `app/web/src/pages/cockpit/FollowAction.tsx`（「AI 跟进」开关）
- Modify: `app/web/src/pages/cockpit/NoteTab.tsx`（deep-dive 启动按钮）
- Modify: `app/web/src/pages/research/ResearchAssistant.tsx`、`ResearchRefreshPanel.tsx`、`ResearchEditReview.tsx`（AI 面板入口）
- Modify: `app/web/src/LicenseModal.tsx`（文案：只宣传自动跟踪 / deep-dive / 研究库 AI）
- Test: `app/web/src/featureGuard.test.ts` 及上述组件测试

**Interfaces:**
- Consumes: `useFeatureGuard()` 的 `{locked, guard}`（语义已收窄为「付费功能锁」）。

- [ ] **Step 1:** FollowAction：`const { locked, guard } = useFeatureGuard()`；`locked` 时开关显示锁标并 `onChange={() => guard(noop)}`（触发 LicenseModal），解锁态行为不变。
- [ ] **Step 2:** NoteTab：deep-dive 按钮同样处理——`locked` 时按钮点击走 `guard`，显示锁标。
- [ ] **Step 3:** 三个 research AI 组件：顶层 `locked` 时渲染上锁占位（复用 `LockedAiNotice`），浏览组件不受影响。
- [ ] **Step 4:** LicenseModal 文案改为三个付费功能的说明。
- [ ] **Step 5:** 更新/补测试：unlicensed 时 FollowAction、deep-dive 按钮、research AI 面板呈锁态且点击弹 LicenseModal。
- [ ] **Step 6:** Run: `cd app && pnpm --filter @kansoku/web test`，Expected: PASS。
- [ ] **Step 7:** Commit: `"feat(web): lock paid entries (auto-follow, deep-dive, research AI)"`

**Phase A 完成门：** 两仓测试全绿 + `cd app && pnpm dev` 手动验证（未订阅：ChatDock 可聊、复评可跑、研究库可浏览；AI 跟进/deep-dive/AI 刷新上锁）。可独立发版。

---

## Phase B —— 代码搬迁（pro → core）

> 执行顺序固定 B1→B7；B1–B2 后两仓处于中间态（pro 从 core 导入基座），每个任务保持各自可编译、测试可跑。

### Task B1: 基座与免费功能层搬入 core（含 pro 全部消费者 rewire）

> **范围修正（2026-07-18 侦察后）**：基座是原子搬迁——ai/ 一旦移走，pro 里**所有**消费者（bench 7 文件、modules 服务、index.ts、留在 pro 的 ai 文件、以及 pro/test 里 ~43 个测试）同一刻全断，因为它们都以 `./models.js` 引 sibling。故 B1 不能只移文件，必须在**同一步**把 pro 全部消费者的 import 一起 rewire，否则 pro 无法编译、拿不到「pro 测试通过」的门。原计划把 bench import 改动放 B5、把消费者 rewire 分散到 B2/B5 的设想物理上不成立。**B5 因此退化为纯 bench 冒烟验证。**
>
> **侦察已确认的事实（写进实施 brief）**：
> - 搬迁集（36 源文件）**无任何反向依赖**留在 pro 的付费模块（scheduler/deepDive/researchChat/researchRefresh/recap/triggers/license）——干净下层。
> - 搬迁集只用 core 的 package.json **已有**的包（typebox / @earendil-works/pi-agent-core / @earendil-works/pi-ai / drizzle-orm / better-sqlite3）——**core 无需加依赖**。pro-only 的包（quickjs-emscripten / reflect-metadata / @tsuki-hono / electron-ipc-decorator）只被留在 pro 的文件用。
> - `app/shared/` 是 workspace 级共享目录，core 已在用（`../../../../shared/`）——**不搬**。
>
> **纠缠边修正（2026-07-18 B1 首次 BLOCKED 后，正确扫描发现 4 条边——原扫描因 shell 分词 bug 假阴性）**：
> - **#3 chat.ts→`packages/core/src/modules/annotations`**：假警报，是 core 自己的模块，搬后 core→core，仅路径改写。
> - **#1 credentialStore→`LICENSE_PROVIDER_KEY`（pro/license/licenseStore）**：真反向边。该常量 = `"kansoku-license"`，是「保留凭证行」的键。**解法**：把 `LICENSE_PROVIDER_KEY` 定义搬进 core 的 `credentialStore.ts` 并 export；pro 的 `licenseStore.ts` 反向从 core 引（pro→core）。
> - **#2 commentator→`Trigger`（type，来自 triggers.ts）**：triggers.ts **零 import**、纯类型+纯检测函数，被免费的 commentator 与付费的 scheduler 共用——**它是免费基座，原计划划到 stay-pro 是分类错**。**解法**：triggers.ts 并入搬迁集；scheduler 从 core 引。
> - **#4 assistantChat→`buildResearchLibraryTools`（researchLibraryTools.ts）**：免费全局助手用研究库搜索/读取工具，底层是**免费 browse 服务**。researchLibraryTools 依赖 `createResearchService`（来自 `modules/research/research.service.ts`，该文件**已 core-clean**，只依赖 node 内置+core contract/env/errors，AI 逻辑在别的文件）。**解法**：`research.service.ts` 与 `researchLibraryTools.ts` 一并并入搬迁集——research browse 本就是基座前置依赖。**B3 因此缩小**为只做 browse **控制器**与 contract 拆分（browse 服务已在 B1 移入 core）。
>
> **扩充后的搬迁集 = 36 原文件 + `ai/triggers.ts` + `ai/researchLibraryTools.ts` + `modules/research/research.service.ts`（→`packages/core/src/modules/research/`）+ `LICENSE_PROVIDER_KEY` 常量归位。**
> **额外 rewire 的 pro 消费者**：`ai/researchChat.ts` `ai/researchRefresh.ts` `ipc/researchIpc.ts` `server/modules/research/research.controller.ts`（research.service 消费者，改从 core 引）、`ai/scheduler.ts`（triggers 消费者）、`license/licenseStore.ts`（改从 core 引 LICENSE_PROVIDER_KEY）。

**Files:**
- Create: `app/packages/core/src/ai/`（36 源文件：30 顶层 + `messages/`3 + `lobehub/`3）
- Move: 测被搬模块的测试（如 `settingsStore.test.ts commentator.test.ts conversationEngine.test.ts chat-suggestions.test.ts` 等）从 `app/pro/test/` 到 `app/packages/core/test/`（或 core 既有测试位置）；测 pro 侧路由/门的测试（`assistant-routes.test.ts follow-routes.test.ts reassess-license-gate.test.ts` 等）留在 pro，只 rewire import。
- Modify（rewire，import 改指 core）：pro 消费者 `index.ts`、`bench/**`、`modules/{assistant,chat,lobehub,research,settings}/*.service.ts` 与 `settings.deps.ts settings.testConnection.ts settingsValidation.ts`、留在 pro 的 ai 文件 `scheduler.ts triggers.ts recap.ts deepDive.ts deepDiveTools.ts researchChat.ts researchChatStore.ts researchRefresh.ts researchLibraryTools.ts`。

**Interfaces:**
- Produces: core 内 `packages/core/src/ai/*` 提供基座与免费功能层。pro 消费者按各自深度以相对路径 `…/packages/core/src/ai/<mod>.js` 导入（从 `pro/src/ai/` 是 `../../../packages/core/src/ai/`；从 `pro/src/modules/<x>/` 是 `../../../../packages/core/src/ai/`）。

- [ ] **Step 1（确定性移动，run brief 内脚本 verbatim）:** 用纯 `mv` 把 36 源文件从 `pro/src/ai/{,messages/,lobehub/}` 移到 `packages/core/src/ai/{,messages/,lobehub/}`；两仓各 `git add -A` 暂存（pro 记删除、公开仓记新增）。内容不改。
- [ ] **Step 2（移动文件内 import，两条确定性 sed）:** 移入 core 的文件：`../../../packages/core/src/` → `../`（core 内相对）；`../../../shared/` → `../../../../shared/`（3up→4up）。intra-ai 的 `./x.js`、`./messages/x.js`、`./lobehub/x.js` 不变。
- [ ] **Step 3（编译器驱动修 core）:** Run `pnpm --filter @kansoku/core typecheck`，按报错逐条修残余 import，直至 core typecheck 通过。
- [ ] **Step 4（rewire pro 消费者 + 归位测试）:** 按 Files 的 Move/Modify 清单：测被搬模块的测试随主体移入 core；pro 消费者 import 改指 core 相对路径（编译器驱动：`pnpm test` 报 `Cannot find module` 就把该 import 指向新 core 位置）。
- [ ] **Step 5:** `promptPolicy` 的 trading-discipline 注入路径复核（搬入 core 后 core 内 `analyst`/`chat`/`promptPolicy` 直接引用，路径正确）。
- [ ] **Step 6（双门）:** Run `cd app && pnpm --filter @kansoku/core typecheck && pnpm --filter @kansoku/core test` **且** `cd app/pro && pnpm test`。Expected: 两侧全 PASS（pro 重新完整编译）。
- [ ] **Step 7:** 双仓各自 commit：core `"feat(core): absorb AI base + free feature layer from pro"`；pro `"refactor: import AI base from core, rehome moved tests"`。

### Task B2: 免费服务/控制器/IPC 搬迁 + 摘 requirePro + AI 运行时启动接线

> **侦察补充（2026-07-18，B1 之后）**：
> - pro 的四组免费 service（assistant/chat/lobehub/settings-AI）B1 后已是薄壳，全部 import 指向 core——搬迁即「移动 + import 缩短」。
> - server 挂载点：`app/server/src/modules/app.module.ts:14` 由 `getPro()?.tsukiModules` 合并 AI 模块——free 控制器搬入 server 后改为一等模块注册，pro 的 `tsukiModules` 剩 `[ResearchModule, LicenseModule]`。
> - desktop 合并点：`app/desktop/src/ipc/index.ts` 的 `nonAiIpcServiceClasses ⊕ getPro()?.ipcServiceClasses`——Assistant/Chat/LobeHub IPC 搬入 desktop 后加入前者，pro 的 `ipcServiceClasses` 剩 `[gateLicensedIpc(ResearchIpc,[11 AI 方法]), LicenseIpc]`。`groups.ts` 是纯名字白名单，组名不变则无需改（以 contract-parity 测试为准）。
> - core 的 `settings.service.ts` 现经 `getPro()?.aiSettings` 委托——改为直接 import 搬入 core 的 aiSettings service；`ProModule.aiSettings` 字段与 pro-api 类型的删除留到 B4（本任务里 pro 可暂时继续导出，无消费者）。
> - **启动接线（新子任务，纯开源构建能跑免费 AI 的关键）**：`initAiSettings` 目前只被 pro 的 `initRuntime` 调用。改为 `app/server/src/runtimeInit.ts` 在 `loadPro` **之前**无条件调用 `initAiSettings(getDb(), { secretBox: opts?.secretBox })`（pro 缺席时免费 AI 仍初始化）。
> - **跨副本一致性（dev 下 pro 跑自己的 core 拷贝，单例按副本各一份）**：`settingsStore` 有内存缓存（Map+revision），B2 后 kernel 写设置、pro 的 scheduler 读设置，若各持缓存必失同步。沿用 watchedMarkets 的实例收养先例：host 对象新增 `aiSettingsStore`（kernel 的 active SettingsStore 实例，`getActiveSettingsStore()`），pro 的 `initRuntime` 在自己副本里照常 `initAiSettings` 后，用 `setActiveSettingsStore(host.aiSettingsStore)` 收养 kernel 实例。credentialStore/lobehub/models 为 db/文件直读或无缓存态，按副本各持无碍。pro-api 的 host 类型随之扩一个可选字段（向后兼容，旧 pro 忽略之）。
> - reassess 路由摘 `requirePro()` 后，pro 缺席时经 `freeHooks.reassessSymbol` 返回 `{started:false}`（不 404 不崩）；真正 pro 缺席可用要等 B4 hooks 直调化——可接受的中间态。

**Files:**
- Create: `app/packages/core/src/modules/{settings-ai,chat,assistant,lobehub}/*.service.ts`（自 pro `modules/`）
- Create: `app/server/src/modules/{chat,assistant,lobehub}/`（controller + module，自 pro `server/modules/`，去掉所有 license 引用）
- Modify: `app/server/src/modules/settings/settings.controller.ts`（AI 路由删 9 处 `requirePro()`）
- Modify: `app/server/src/modules/symbols/symbols.controller.ts`（reassess 两处删 `requirePro()`；deep-dive 两处保留）
- Modify: `app/server/src/modules/overview/overview.controller.ts`（/usage 删 `requirePro()`）
- Create: desktop 侧免费 IPC 服务（AssistantIpc/ChatIpc/LobeHubIpc 移入公开仓 IPC 注册处，参照 `app/desktop` 现有 ipc 服务模式）
- Modify: `app/desktop/src/**/groups.ts`（allowlist：chat/assistant/lobehub 组改为 core 常驻）

**Interfaces:**
- Consumes: B1 的 `packages/core/src/ai/*`。
- Produces: 免费 AI 的 HTTP + IPC 全部由公开仓提供，pro 缺席也可用。

- [ ] **Step 1:** 服务文件搬入 core `modules/`，controller/module 搬入 `app/server/src/modules/`，import 全部改 core 路径；`aiSettings.service` 已无 license 引用（A3 摘净）。
- [ ] **Step 2:** server 三个免费 controller 删 `requirePro()`（settings AI 9 处、symbols reassess 2 处、overview usage 1 处）；symbols deep-dive 的 2 处保留。
- [ ] **Step 3:** IPC 服务类移入公开仓并在 desktop 注册；`groups.ts` allowlist 调整；pro `ipc/index.ts` 只剩 `[gateLicensedIpc(ResearchIpc, […AI 方法]), LicenseIpc]`（AI 方法列表同 A4）。
- [ ] **Step 4:** 运行 desktop contract-parity 测试：`cd app && pnpm --filter @kansoku/desktop test`。Expected: PASS（allowlist 与 contract 对齐）。
- [ ] **Step 5:** Run: `cd app && pnpm test`；`cd app/pro && pnpm test`。Expected: PASS。
- [ ] **Step 6:** 双仓 commit：core `"feat: free AI modules served from open core (http + ipc)"`；pro `"refactor: drop migrated free modules"`。

### Task B3: research 服务方拆分（browse 归 server/desktop，AI 留 pro）

> **裁量修正（2026-07-18）**：browse 服务已在 B1 提前进 core，spec 原文「contract 拆两段」的目的其实是**行为边界**（pro 缺席时 browse 可用、AI 子路由 404）。**保持单一 research contract group 不拆**（web/desktop 客户端零破坏），只拆**服务方**：server 新增 browse 控制器（`GET /`、`GET /document`，无门），pro 的 research 控制器删去这两个方法只留 AI 路由；desktop 新增 browse IPC，pro 的 ResearchIpc 删 `list`/`get`。
> **必须实证的风险**：HTTP 两个 controller 共享 `research` 前缀、IPC 两个服务共享 `research` groupName 是否被 tsuki-hono / electron-ipc-decorator 允许（路由合并 vs 注册冲突）——用测试验证；若框架不允许，回退方案 = contract 拆 `researchBrowse` 新组（并改 web/desktop 客户端调用点），在报告里说明选了哪条。

**Files:**
- Create: `app/packages/core/src/modules/research/researchBrowse.service.ts`（自 pro `research.service.ts` 的 list/get 与文件系统读取，整段搬移）
- Create: `app/server/src/modules/research/research.controller.ts`（只含 `GET /`、`GET /document`，无门）
- Modify: `app/packages/core/src/contract/research.ts`（拆 public browse 组与 pro AI 组）
- Modify: pro `server/modules/research/research.controller.ts`（删 list/get 两个方法及 browse service 依赖，保留 AI 路由与 `requireLicensed()`）
- Modify: pro `ipc/researchIpc.ts`（删 `list`/`get`；公开仓新增 browse IPC）

**Interfaces:**
- Produces: `researchBrowse.service` 导出 `list(input: {kind?, query?})` 与 `get(input: {path})`，签名与现 `ResearchApi["list"|"get"]` 一致。

- [ ] **Step 1:** browse 逻辑搬 core，路径校验（stocks/journal 白名单）随行；pro 的 researchChat/refresh/edit service 改从 core 导入需要的公共工具。
- [ ] **Step 2:** contract research group 拆两段；web 客户端 import 对应更新（调用方签名不变则零改动，核对 `app/web/src/pages/research/researchModel.ts`）。
- [ ] **Step 3:** 补测试：pro 缺席时 `GET /api/research`、`GET /api/research/document` 返回 200；AI 子路由 404。
- [ ] **Step 4:** Run: `cd app && pnpm test && cd pro && pnpm test`。Expected: PASS。
- [ ] **Step 5:** 双仓 commit：core `"feat: research browse in open core"`；pro `"refactor: research module keeps AI routes only"`。

### Task B4: pro-api 契约收窄 + hooks 直调化 + 免费频道归 core + desktop IPC 平权

> **侦察补充（2026-07-18，B3 之后）**：
> - core 内 15 个 `getProHooks().` 调用点：**直调化 12 个**——`usageSummary/listUsageDates`（usage*）、`listComments/listCommentDates/listAllCommentDates`（comments）、`symbolFollowState/setSymbolFollowing/listFollowedSymbols`（follows；含 `store.ts:168` 与 `cockpit/board.ts`）、`reassessSymbol/analystRunStatus`（body 从 pro index.ts 移入 core：`aiConfig().analystModel` + `runAnalyst`，与 `listAnalystRuns` 状态同在 core analyst）、`activeSettingsRevision`（settingsStore）、`filterMacroForSymbol`（eventFilter；无模型时原样返回，pro 缺席行为不变）。**保留 hook 3 个**：`requestImmediateFollow`、`startDeepDiveForNote`、`deepDiveStatus`（付费）。
> - `store.ts:168` 的 intraday 建图自动 setSymbolFollowing 保持现状（服务端写标记 = 纵深防御层面免费，付费引擎 scheduler 自守门）。
> - **频道**：`channelProtocol.ts:83,129` 目前只查 `getPro()?.channels`。改为 core 频道优先合并：`[...coreAiChannels, ...(getPro()?.channels ?? [])]`。免费频道（comments/notifications/analyst-runs/chat/assistant-chat 及其 attach 逻辑）从 pro index.ts 移入 core（新文件如 `packages/core/src/realtime/aiChannels.ts`）;pro 只留 `research-chat`、`research-refresh`（付费）。
> - **pro-api 收窄**：`ProHooks` 剩 3 个付费钩子；`freeHooks` 同步缩；`ProModule` 删 `aiSettings` 字段（B2 后 core 无消费者）。破坏性变更，两仓同批落地。
> - **desktop IPC 平权（B2 遗留）**：`desktop/src/ipc/{settingsIpc,overviewIpc,symbolsIpc}.ts` 摘免费面的 `requirePro()`（settings AI 全部、overview usage、symbols reassess），deep-dive 的保留;顺带补 IPC 侧付费门等价断言（B2 review 的 Minor）。

**Files:**
- Modify: `app/packages/pro-api/aiTypes.ts`、`index.ts`（`ProHooks` 只剩：`requestImmediateFollow`、`startDeepDiveForNote`、`deepDiveStatus`、`filterMacroForSymbol` 若经确认仍走 hook 则保留否则删除——core 已有 eventFilter，删除）
- Modify: `app/packages/core/src/pro/registry.ts`（`freeHooks` 相应删除；付费钩子空实现保留）
- Modify: core 内原 hook 调用点改直调：`services/cockpit/board.ts`（`hooks.listFollowedSymbols`/`hooks.listComments` → `ai/follows.js`、`ai/comments.js` 直接 import）、`modules/symbols/symbols.service.ts`（follow 三连改直调，`requestImmediateFollow` 留 hook）
- Modify: pro `index.ts`（`ProModule` 精简：hooks 收窄、`tsukiModules` 只剩 `[ResearchModule, LicenseModule]`、channels 只剩付费相关、免费频道定义搬 core）

**Interfaces:**
- Produces: 收窄后的 `ProHooks`；core WS 层承接免费频道（comments/notifications/analyst-runs/chat/research-chat/assistant-chat），pro 只注册 `research-refresh`。

- [ ] **Step 1:** 按上述清单改 pro-api 类型与 registry；破坏性变更，pro 与 core 同一批次落地。
- [ ] **Step 2:** core 调用点直调化；WS 频道注册处（`packages/core` 的 ws 模块）收编免费频道，attach 逻辑自 pro `index.ts` 对应函数搬入。
- [ ] **Step 3:** Run: `cd app && pnpm test && cd pro && pnpm test`。Expected: PASS。
- [ ] **Step 4:** 双仓 commit：core `"feat: narrow pro-api to paid hooks, core owns free channels"`；pro `"refactor: shrink ProModule to paid surface"`。

### Task B5: pro 打包构建验证（bench import 已在 B1 处理）

> **范围修正**：bench 的 import 改动已在 B1 的原子 rewire 里完成（bench 是 pro 消费者之一）。B5 因此退化为 pro 侧打包与依赖核对的收尾验证。

**Files:**
- Modify（仅按需）: `app/pro/tsdown.config.ts`、`app/pro/package.json`（入口与依赖核对——B1 后 pro 可能有不再直接使用、可清理的 dep；不强制删除，只核对不缺）

- [ ] **Step 1:** 确认 bench 单测在 B1 后仍绿：`cd app/pro && pnpm test`。
- [ ] **Step 2:** pro 打包构建验证：`cd app/pro && pnpm build`（tsdown），Expected: 成功（打出的 dist 供打包桌面宿主用）。
- [ ] **Step 3:** 若有改动才 Commit（pro 仓）: `"chore: verify pro build after base migration"`；无改动则跳过。

### Task B6: web 终态 —— 免费 AI UI 无条件渲染

**Files:**
- Modify: `app/web/src/pages/home/QuickBar.tsx`（去掉 `pro &&`）
- Modify: `app/web/src/PageRouter.tsx`（/research、/chat 无条件路由）
- Modify: `app/web/src/pages/SymbolCockpit.tsx`（ChatDock 无条件）
- Modify: `app/web/src/pages/settings/SettingsPage.tsx`（AI 卡片无条件）
- Delete: `app/web/src/pages/cockpit/chat/LockedChatBar.tsx`、`LicenseGateEmptyState` 相关（若已无引用）
- Test: 上述组件测试 + `featureGuard.test.ts`

- [ ] **Step 1:** 免费 AI UI 全部去掉 `pro` 条件；付费入口（FollowAction、NoteTab deep-dive、research AI 面板）保持 A6 的「`pro:false` 隐藏 / 未订阅上锁」。
- [ ] **Step 2:** 删除无引用的锁组件文件；`rg` 确认零引用后再删。
- [ ] **Step 3:** Run: `cd app && pnpm --filter @kansoku/web test`。Expected: PASS。
- [ ] **Step 4:** Commit: `"feat(web): free AI surfaces render unconditionally"`

### Task B7: 全量验证 + CI

- [ ] **Step 1:** `cd app && pnpm test`（全 workspace）与 `cd app/pro && pnpm test`。Expected: 全绿。
- [ ] **Step 2:** 无 pro 冒烟：临时移开 `app/pro`（`mv app/pro /tmp/pro-slot`），`pnpm --filter @kansoku/web build && pnpm typecheck`，`pnpm dev` 验证：研究库可浏览、ChatDock/复评在配 key 后可用、付费 UI 隐藏、`GET /api/capabilities` 报 `{pro:false}`。验完移回。
- [ ] **Step 3:** 触发 CI 的 pro-present build check（fetch-pro + typecheck + build + pro tests）。Expected: 绿。
- [ ] **Step 4:** 更新 `app/pro/README.md` 与根 `CLAUDE.md` 的 open-core 描述段（免费/付费新边界，一句话即可）。
- [ ] **Step 5:** 双仓最终 commit + PR（公开仓走 PR 流程，pro 仓直接 push main 或按其惯例）。

---

## Self-Review 记录

- Spec 覆盖：分界表 → A1–A6/B2/B3；搬迁映射 → B1–B3；门语义 → A1–A4/B2；hooks 收窄 → B4；UI → A5/A6/B6；desktop allowlist → B2；测试 → 各任务 + B7。「明确不做」清单无对应任务（正确）。
- `filterMacroForSymbol`：spec 定为免费且搬 core（eventFilter 在 B1 搬迁清单内），故 B4 从 `ProHooks` 删除并由 core 直调——与 spec「hooks 只剩付费钩子」一致。
- 类型一致性：A4 与 B2 的 ResearchIpc AI 方法列表相同；B3 的 browse 服务签名沿用 `ResearchApi`。
