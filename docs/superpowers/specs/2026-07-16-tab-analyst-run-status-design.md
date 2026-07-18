# 桌面 tab 图标透出 AI 分析运行状态

日期：2026-07-16
状态：已确认

## 背景

桌面端对某个标的发起「重新评估」（reassess，背后是 analyst 任务）后，切到别的 tab 就完全失联：状态目前靠页面内 `useAnalystRun` 每 5 秒轮询 `/:sym/reassess/status`，页面一卸载轮询就停了。用户切走后既看不到「还在跑」，跑完了也没有任何提醒。

## 目标

1. symbol tab 在其标的有 analyst 任务运行时，图标右下角显示一个发光小点。
2. 任务结束时若该 tab 不是当前激活 tab，图标右上角显示一个静态未读小圆点，激活该 tab 即清除。
3. 机制做成通用的「标的 AI 运行状态」，不写死 reassess——escalation 自动触发的 analyst 任务同样透出。本次只接 analyst，deepDive/chat 不涉及。
4. `useAnalystRun` 的 5 秒轮询一并删除，改从同一条实时通道取状态。

## 设计

### 1. 后端：新实时频道 `analyst-runs`（全局，不带 symbol）

- `packages/core/src/ai/analyst.ts`：为现有的 `analystRunStates` 内存表加事件出口——`updateAnalystRunStatus` 每次变更（开跑、换阶段、结束）发一个事件；新增 `listAnalystRuns()` 返回当前所有在跑的 `{ symbol, status }`，供订阅时发快照。
- `packages/core/src/realtime/channelProtocol.ts`：注册 kind `analyst-runs`。订阅即推 `{ type: "init", runs: [{ symbol, status }] }`；之后每次变更推 `{ type: "update", symbol, status }`。`status` 复用契约里的 `ReassessStatus`（`contract/symbols.ts`），结束时为 `{ running: false }`。
- 选全局频道而非按标的订阅：每条连接频道上限 16 个，按标的订会随 tab 数量挤占；全局订一次，tab 开关无需订退。
- 桌面端零额外工作：`wsHub` 在桌面模式走 `PortTransport`（IPC 端口），频道协议与 WebSocket 完全一致。

### 2. 前端：analystRuns store + 外壳层订阅

- 新建 `apps/web/src/desktop/analystRunsStore.ts`（可放通用位置，供非桌面页面 hook 复用），风格照 `tabsStore`（模块级 + 订阅函数，不引状态库）：
  - `runs: Map<symbol, ReassessStatus>`（running 态）
  - `unseen: Set<symbol>`
  - 迁移规则：update 为 running → 入 `runs`；update 为不 running → 出 `runs`，且该标的对应 tab 非激活 tab 时入 `unseen`；激活某 symbol tab → 该标的移出 `unseen`。
- **频道订阅由 store 自己管理**：第一个消费者 attach 时经 `subscribeChannel` 订阅 `analyst-runs`，最后一个离开时退订（wsHub 已按订阅数管理连接生命周期）。这样纯浏览器网页版（无 `DesktopShell`）里 `useAnalystRun` 读 store 同样有数据；桌面 titlebar 只是又一个消费者。
- `unseen` 只存内存不持久化——服务端运行状态本身就是内存态，应用重启后语义一致。

### 3. tab 图标表现（`DesktopTitlebar.tsx`）

- symbol tab 且标的在 `runs` 中：图标保持原样，右下角叠一个发光小点（带呼吸/脉冲动画）。
- symbol tab 且标的在 `unseen` 中：右上角叠一个静态小圆点，样式对齐现有 `HubStatusDot` / updater 角标。
- 两个点位置与样式区分：右下 = 在跑（发光），右上 = 有新结论没看（静态）。
- 其余 tab 种类不受影响。

### 4. `useAnalystRun` 去轮询

- `apps/web/src/pages/cockpit/useAnalystRun.ts` 删除 `usePollingQuery` 的 5 秒轮询，改为从 `analystRuns` store 读该标的的状态（首帧由频道 init 快照兜底）。
- 保留 start 时的 optimistic「正在等待服务端确认任务」占位，服务端事件到达后被真实状态覆盖。
- 对外接口 `{ checking, hint, pending, running, start, status }` 不变，`SymbolCockpit` / `AiTab` / `GenerateAnalysis` / `JournalSection` 等消费方无需改动。
- 契约里的 `reassessStatus` GET 路由保留（作为调试/兜底接口），但前端不再轮询它。

### 5. 测试

- store 单元测试：init 灌入、running 进出、结束时激活/非激活两种分支、激活清除 unseen。
- 频道测试：照现有 `channelProtocol` / `wsHub.test.ts` 的路子，覆盖 init 快照 + update 推送。
- `useAnalystRun` 现有测试（如有）调整为基于 store 的数据源。

## 边界

- 多窗口（popout）：每个窗口各自持有一条 wsHub 连接、各订一份全局频道，天然一致；unseen 按窗口独立，可接受。
- deepDive / chat 的运行状态本次不接入，频道命名已按 analyst 收敛，后续如需扩展另起频道或扩展 payload。
