# 盲盘训练器 M3 实现计划：独立窗口与训练局

> **给 agent 执行者：** 必用子技能 superpowers:subagent-driven-development 逐任务实现。步骤用 `- [ ]` 复选框跟踪。

**目标：** 把 `docs/superpowers/specs/2026-07-25-blind-replay-training-design.md` 的 M3 落地——独立 Vite entry + 独立 Electron 窗口、游标截断的图、图上拖拽下单、纪律拦截、推进与播放控制、收盘结算基础版。此期结束即可完整刷一盘，但没有 AI 陪练（M4）与复盘统计（M5）。

**架构：** 引擎状态活在 Electron 主进程（pro 侧），渲染进程永远只拿到「到当前游标为止」的投影。渲染层拿不到未公开的 bar，所以「右侧是雾」不是渲染自律而是物理事实；§11 的「恢复时不得因序列化往返而泄漏未公开数据」因此自动成立。训练局跑在 `apps/web/train.html` 这个独立 entry 里，与主 SPA 不共享 JS 上下文，主窗口内存里的真实持仓、watchlist、实时报价一概够不着。

**技术栈：** `packages/bench` 的纯函数 episode 引擎（`submitEpisode` / `advanceEpisode` / `buildEpisodeQuestionViewAtCursor`）、`electron-ipc-decorator` 的 `IpcService` 分组、Vite 多 entry（rolldown）、lightweight-charts v5、React 19。

## 全局约束

- **公开／私有边界**：`packages/bench`、`apps/web`、`apps/desktop` 是公开仓 `kansoku`；训练器的业务实现（case 池、开局、推进、结算）属于付费面，落 `apps/pro`，经 overlay 投影进公开树。付费逻辑一个字都不许进公开仓。两个仓分别提交，**绝不跨仓合并成一个 commit**。
- **泄漏是最高优先级缺陷**（spec §12）。任何发往渲染进程的载荷，只要含有游标之后的 bar、尾声段、或 provenance（真实代号／真实日期／缩放系数），即为 Critical。每个碰 IPC 载荷的任务都必须带一条断言这一点的测试。
- 尾声段与 provenance 存在独立文件（`case-pool/epilogues/`），训练进行中**不加载**；只有收盘后才允许读。
- 训练器只做 Electron。不给 `apps/server` 加任何训练路由，web/HTTP transport 押后。
- 文档写中文白话；代码注释、commit、PR 文本用英文。
- 注释默认为零。只在「意外行为」或「隐藏不变量」两种情况下写。
- 纪律规则引用 ID，不复述原文：TD-RR-01（盈亏比下限）、TD-EXIT-01（1R 后不许把止损移回亏损区）。
- 每个任务自带测试并跑绿再提交。只对改动过的文件跑 lint／typecheck，不要全项目跑。

---

## Task 1: 引擎的新 bar 报告泛化到梯队（公开仓 `packages/bench`）

**文件：**
- `packages/bench/src/episode/engine.ts`
- `packages/bench/test/episode/engine.test.ts`

**背景：** `EpisodeNewBars` 至今写死 `{ h1, day, week }`（`engine.ts:87`），`computeNewBars`（`engine.ts:133-153`）直接读 `view.fixtures.kline.day` / `.week`。除 1h 档外，中档恒空；1m/5m 档连上档也恒空。`view.ts` 那边梯队化是干净的，只有这里没跟上。M3 的跨周期推进与视图切换都要靠「哪根上层 K 刚收」，必须先修。

**接口：** 产出泛化后的 `EpisodeNewBars`，后续任务 3 的推进 IPC 直接消费它。

- [ ] **步骤 1：把 `EpisodeNewBars` 换成按梯队键的形状**

改成 `Partial<Record<EpisodeViewPeriod, RawBar[]>>`，或保留三个语义字段但改名为 `base` / `mid` / `top`。二选一，选后者更明确，且调用方不必自己查梯队。同步改 `EMPTY_NEW_BARS`。

- [ ] **步骤 2：`computeNewBars` 按 `episodePeriodLadder(basePeriod)` 取三档**

用 `episodePeriodLadder` 拿到 `[base, mid, top]`，三档都走 `diffBars(prevView.fixtures.kline[p] ?? [], nextView.fixtures.kline[p] ?? [])`。删掉硬编码的 `.day` / `.week` 读取。

- [ ] **步骤 3：改所有消费方**

全局搜 `newBars`，改到新形状。已知消费方至少有 `apps/pro/src/bench/episode/mock.ts` 的 `resultText()`（**pro 仓，单独提交**）。搜的时候连 `packages/bench-report-ui` 一起搜。

- [ ] **步骤 4：加有杀伤力的测试**

对五档 basePeriod 各造一个 fixture，断言推进跨过一个中档边界时 `mid` 非空、跨过上档边界时 `top` 非空。**关键**：测试必须在改回硬编码 `.day`/`.week` 时变红——写完先手工把实现改回去跑一遍确认它红，再改回来。1m/5m 档尤其重要，那两档旧实现恒空。

- [ ] **步骤 5：跑 `pnpm --filter @kansoku/bench test` 与 typecheck，公开仓提交**

---

## Task 2: 训练局会话模块（pro 仓 `apps/pro/src/modules/training/`）

**文件：**
- `apps/pro/src/modules/training/session.ts`（新）
- `apps/pro/src/modules/training/sessionStore.ts`（新）
- `apps/pro/test/modules/training/session.test.ts`（新）

**背景：** 主进程侧的状态持有者，照抄 `apps/pro/src/bench/episode/mock.ts` 的闭包模式——引擎本身是纯的，可变的 `EpisodeState` 关在会话对象里。区别是消费方从 LLM 工具调用换成 IPC，返回结构化数据而非给模型看的文本块。

**接口：** 导出 `TrainingSession` 及其方法；任务 3 的 IPC 层是唯一调用方。

- [ ] **步骤 1：定义对外载荷类型**

`TrainingViewPayload`：渲染进程能看到的全部内容。必须由 `buildEpisodeQuestionViewAtCursor(question, cursor)` 派生，**不得**直接塞 `question`。字段至少包含：`cursor`、`basePeriod`、`ladder`（三档周期名）、每档的 bar 数组（已截断）、`quote`、`phase`、`order`、`position`、`netR`、`remainingBars`。

**明确不含**：`replay.bars` 全量、`replay.rollups` 原始表、任何 provenance、尾声段。

- [ ] **步骤 2：实现 `createTrainingSession`**

```ts
export function createTrainingSession(question: Question, options?: EpisodeEngineOptions): TrainingSession
```

闭包持有 `let state = createEpisodeState()`。方法：

- `view(): TrainingViewPayload`
- `submit(submission, entryMode: EpisodeEntryMode): TrainingStepResult`（转 `submitEpisode`）
- `step(action: EpisodeTradeAction, bars?: number): TrainingStepResult`（转 `advanceEpisode`）
- `amend({stop?, target?, reason})`、`cancel(reason)`、`exitNextOpen(reason)`

`TrainingStepResult` = `{ view: TrainingViewPayload, events: TrainingStepEvent[], terminal: boolean, result: EpisodeTradeResult | null }`。

- [ ] **步骤 3：跨周期推进要回溯步内事件（spec §6 保护二）**

`step` 接受「走 N 根基础 K」。引擎的批量快进遇到非平淡事件会提前停（`batchAdvancedBars` / `batchStopReason`），所以实现成循环：反复调用直到走满 N 根或终局，把每次返回的 `event` 连同它发生在第几根一起收集进 `events[]`。终局或用户要求暂停时提前返回，并在 `view` 里如实反映实际走了几根。

播放遇事件自动暂停（保护一）由渲染层依据 `events` 非空来做，引擎侧只负责如实上报。

- [ ] **步骤 4：会话持久化（spec §11）**

`sessionStore.ts`：把 `EpisodeState` + caseId + basePeriod 序列化到 `<KANSOKU_HOME>/training/sessions/<id>.json`，复用 `casePoolPaths.ts` 的路径风格与 `0o600`/`0o700` 权限。恢复时按 caseId 从 case 池重新读 `question`，**不把 question 写进 session 文件**——那等于把未公开数据落一份到磁盘。

- [ ] **步骤 5：泄漏测试（Critical）**

对一个 replay 有 N 根的 case，在 cursor=0、cursor=N/2、cursor=N-1 三个点上：`JSON.stringify(session.view())`，断言不含任何 `replay.bars[cursor+1..]` 的时间戳与收盘价，不含 provenance 字段名，不含尾声段。序列化 session 文件同样断言一遍。

- [ ] **步骤 6：跑 pro 测试与 typecheck，pro 仓单独提交**

---

## Task 3: 训练器 IPC 分组与渲染端桥接

**文件：**
- pro 侧：训练器 IPC service（放 `apps/pro/src/modules/training/ipc.ts`，经 pro edition 注册）
- 公开仓：`apps/desktop/src/kernel/ipc/groups.ts`（登记分组名）
- 公开仓：`apps/web/src/features/desktop/`（新增 bridge 文件）

**背景：** 照 `WindowsIpc`（`apps/desktop/src/shell/window/ipc.ts`）的样子加一个 `IpcService` 子类。分组名必须登记进 `groups.ts` 的白名单，否则 preload 的 `isAllowedIpcChannel` 会拦掉。渲染端桥接照 `apps/web/src/features/desktop/desktopWindowsBridge.ts` 的形状写。

**先读**：`apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts`，搞清楚 pro 侧现在是怎么往 desktop 注册东西的，照那条路走，**不要**把 pro 实现写进公开仓。

**接口：** 产出 `trainer.*` 这组 IPC，任务 5–9 的 UI 全部经它取数。

- [ ] **步骤 1：定义 IPC 方法面**

`listPool()`（各档 case 数）、`open(basePeriod)`（从池中抽一盘，返回首个 view）、`submit(...)`、`step(...)`、`amend(...)`、`cancel(...)`、`exitNextOpen(...)`、`resume(sessionId)`、`reveal(sessionId)`（**仅终局后**返回 provenance 与尾声段）。

- [ ] **步骤 2：`reveal` 的终局闸**

未终局调用 `reveal` 必须抛错，不能返回部分数据。加测试。

- [ ] **步骤 3：登记分组名并写渲染端 bridge**

- [ ] **步骤 4：测试 + 两个仓分别提交**

---

## Task 4: 独立 entry 与独立窗口（公开仓）

**文件：**
- `apps/web/train.html`（新）
- `apps/web/src/train-entry.tsx`（新）
- `apps/web/vite.config.ts`
- `apps/desktop/src/shell/window/trainerWindow.ts`（新）
- `apps/desktop/src/shell/window/windowManager.ts`、`ipc.ts`

**背景：** 现有 popout 是同一 SPA 的一条路由，不是独立 entry；这次是真的第二个 entry。`proOverlayPlugin` / `proLeakGuard` 都挂在顶层 `plugins` 数组上、按整个 bundle 工作，新 entry 自动被覆盖，无需单独登记。`app://-/train.html` 也不用改协议层——已核实 `guardStaticPath` 原样透传、`applySpaFallback` 见 `.html` 后缀不回退。

- [ ] **步骤 1：加第二 entry**

`vite.config.ts` 里设 `build.rollupOptions.input: { main: resolve(__dirname,'index.html'), train: resolve(__dirname,'train.html') }`。注意 `worker` 那块有自己独立的 `plugins`/`rollupOptions`，不要动。

- [ ] **步骤 2：写 `train.html` 与入口模块**

入口只挂训练局根组件。**不要**引 `generated-routes`、不要引主 SPA 的 store／WS hub／实时行情——引了就等于把隔离白做了。

- [ ] **步骤 3：窗口工厂**

照 `popoutWindow.ts` 写 `createTrainerWindow()`，dev 加载 `http://localhost:1792/train.html`，prod 加载 `app://-/train.html`，preload 与 `applyWindowSecurity` 沿用现有的。窗口不带标签栏，独立尺寸，可全屏。

- [ ] **步骤 4：`windows.openTrainer` IPC + 命令面板入口**

`apps/web/src/features/palette/commands.ts` 加「开始盲盘训练」。首页卡片按 spec §9 押后，本期不做。

- [ ] **步骤 5：构建边界测试**

跑一次生产构建，断言 `proLeakGuard` 对新 entry 不报错，且 `dist/train.html` 生成了。

---

## Task 5: 游标截断的图（公开仓 `apps/web`）

**文件：**
- `apps/web/src/features/training/`（新目录）

**背景：** 复用 `IntradayChartOnly`（`apps/web/src/features/charts/intraday/IntradayDashboard.tsx`），它只吃一个 `IntradayBuilt` 形状的普通对象加两个 DOM ref，不自带网络请求。两个摩擦点：(a) 必须包在 `IntradayControlsProvider` 里；(b) `IntradayChartOnly` 无条件调 `useDrawings`，那个会打 `client.annotations.*` 并按 symbol 订 WS——训练局绝不能碰。

- [ ] **步骤 1：把 `TrainingViewPayload` 转成 `IntradayBuilt`**

按 `packages/shared/types.ts` 的 `IntradayBuilt` / `IntradayTfData` 形状组装，梯队三档对应三个 timeframe。因为载荷本身就是截断的，图自然只画到游标——**不要**在渲染层再做一次截断，那会掩盖上游泄漏。

- [ ] **步骤 2：做一个无 drawings 的图组件变体**

不要给 `useDrawings` 传假 symbol 蒙混——那仍会写进真实标注存储。

**做法已定：给 `IntradayChartOnly` 加一个 `drawings?: boolean` prop，默认 `true`，为 `false` 时不调 `useDrawings`。** 不要在 training 目录下另写一个精简版图组件——两份图必然漂移，与 CLAUDE.md「复述必漂移」同一个坑。改动要小：现有调用方一律不传这个 prop，行为逐字节不变。

- [ ] **步骤 3：本地 `IntradayControlsProvider`**

训练局自己的指标开关状态，不读主 SPA 的设置。

- [ ] **步骤 4：顶部周期切换**

只允许切到梯队内、且不低于基础周期的档（`isEpisodeViewPeriod`）。

- [ ] **步骤 5：测试**

断言喂进图的 candles 数组末根时间等于当前游标那根，且数组里不含更晚的时间戳。

---

## Task 6: 图上拖拽下单（公开仓 `apps/web`）

**文件：**
- `apps/web/src/features/training/`

**背景：** `PositionBoxPrimitive`（`apps/web/src/features/charts/intraday/positionBoxPrimitive.ts`）零依赖，`setData({startTime,endTime,entry,stop,target1,target2,dimmed})` 即可，挂在蜡烛 series 上就能用。`useDrawingsInteraction`（`apps/web/src/features/charts/drawings/useDrawingsInteraction.ts`）是纯指针事件状态机，不读任何 store，可直接复用；有网络依赖的是它上面那层 `useDrawings`，别引。

- [ ] **步骤 1：三价拖拽**

拖仓位框的绿／红边界改目标与止损，像素↔价格换算走 `useDrawingsInteraction` 的那套。

- [ ] **步骤 2：输入框双向同步**

- [ ] **步骤 3：盈亏比实时显示**

- [ ] **步骤 4：「照现价立刻进」按钮**

引擎已支持（`EpisodeEntryMode = 'market'`，`engine.ts:721`），走 `submit` 时传 `'market'` 即可，止损与目标仍必填。

- [ ] **步骤 5：测试拖拽后三价与提交载荷一致**

---

## Task 7: 纪律拦截（公开仓 `apps/web`）

**文件：**
- `apps/web/src/features/training/`

- [ ] **步骤 1：TD-RR-01——盈亏比不足 1.5:1 锁死挂单按钮，目标块变黄**

边界值必须测：恰好 1.5 允许、1.499 拒绝。注意 spec §6 只提了 1.5 这个下限，横盘要求 2:1 属于判断层，本期不做自动判定。

- [ ] **步骤 2：TD-EXIT-01——已达 1R 后不许把止损移回亏损区**

引擎侧已有 `EpisodeGuardrailError`（止损只许收紧，放宽会抛）。UI 要在按钮层就拦住，不要靠捕获异常；同时保留异常兜底。测各个方向：多头／空头、移到盈亏平衡（允许）、移到平衡之上（允许）、移回亏损（拒绝）。

---

## Task 8: 推进与播放控制（公开仓 `apps/web`）

**文件：**
- `apps/web/src/features/training/`

- [ ] **步骤 1：单根步进**

推进单位跟随当前视图周期。看 5m 图推一根即 5m；切到 15m 推一根即消费 3 根基础 K。切到上层周期推进时必须推到下一根完整的上层边界，不许停在半根上。

- [ ] **步骤 2：播放，倍速 0.5x / 1x / 2x / 4x / 8x**

- [ ] **步骤 3：遇事件立即暂停（保护一）**

`TrainingStepResult.events` 非空即停。挂单成交、止损触发、目标达成、挂单超时作废，任一发生都要停。

- [ ] **步骤 4：步内事件回溯列表（保护二）**

大周期推进后按序列出步内发生的事件，形如「第 7 根 5m 触发挂单成交，第 11 根打到止损」。数据来自任务 2 步骤 3 收集的 `events[]`。

- [ ] **步骤 5：测试对齐规则与暂停时机**

---

## Task 9: 收盘结算基础版（公开仓 `apps/web` + pro）

**文件：**
- `apps/web/src/features/training/`

**背景：** spec §8 的完整收盘页与复盘页属 M5，本期只做「跑完能看到结果」这一层。

- [ ] **步骤 1：终局后揭晓真身**

调 `trainer.reveal`，显示真实代号、真实日期。一键跳转 symbol 页押后到 M5。

- [ ] **步骤 2：成绩**

每笔明细、净 R、计划盈亏比 vs 实际拿到。「最大浮盈回吐」引擎已有 `mfeR`／`maeR`，一并显示。

- [ ] **步骤 3：尾声段开关**

默认关。打开才加载尾声段并画出来。**尾声段不进任何统计口径**（spec §8）——只用于看结构，不参与算成绩，代码里要有测试钉住这一点。

- [ ] **步骤 4：测试——未终局时 `reveal` 被拒**

---

## 明确不做（本期）

- AI 陪练与人工标注（M4）
- 复盘页重放、统计面板、教训沉淀通道（M5）
- 首页卡片入口（spec §9 提到，但付费钩子留到有统计数据可显示时再做）
- web/HTTP transport
- 池子耗尽时的进度显示（spec §11）——本期池空直接报错即可
