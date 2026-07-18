# 多窗口 + 共享标签 + 盯盘小窗 实施计划

Spec：`docs/superpowers/specs/2026-07-15-multi-window-shared-tabs-design.md`（先读，需求以 spec 为准）

## Global Constraints

- 网页版（浏览器访问、检测不到 desktop bridge）行为必须完全不变：标签继续走 `tabsStore.ts` 纯函数 + `localStorage("desktop-tabs-v1")`。
- `activeTabId` 是每个窗口自己的状态，绝不进入主进程共享的 `tabs[]`。
- 主进程对标签变更按到达顺序应用；操作不存在的标签一律 no-op，不抛错。
- 数据层（kernel、realtime、行情连接）零改动。
- 代码零注释、零 JSDoc（仅允许标注非直觉的坑）；遵循各包现有代码风格与目录结构。
- 每个任务：先写测试再实现；只对改动的文件跑 lint/typecheck；`pnpm test` 相关包需绿（`agentsSkillsParity` 与 `promptAssembly` 两个失败是既有问题，忽略）。
- 提交信息 plain English、conventional commits、不带 AI 署名。

## Task 1 — 主进程共享 tabs store + IPC

新建 `apps/desktop/src/tabs/store.ts`：

- 状态 `{ revision: number; tabs: TabState[] }`，`TabState = { id, route, title, scrollY }`（与 `apps/web/src/desktop/tabsStore.ts` 的 `TabState` 一致，不含 activeTabId）。
- 变更操作：`open(route)`、`close(id)`、`closeOthers(id)`、`closeToRight(id)`、`updateRoute(id, route)`、`updateTitle(id, title)`、`updateScroll(id, scrollY)`、`adopt(tabs[])`（一次性接管渲染层迁移来的旧存档，仅当 store 为空时生效）。语义与 `apps/web/src/desktop/tabsStore.ts` 对应纯函数一致（去掉 activeTabId 相关部分）；每次成功变更 revision +1。
- 持久化：`userData/tabs.json`，写入防抖 500ms；启动时读取，损坏或缺失时从单个 home 标签（route `/`）开始。
- IPC（跟随 `apps/desktop/src/tabs/channels.ts` 与现有 ipcMain 注册模式，channel 前缀 `desktop:tabs:`）：
  - `desktop:tabs:get`（invoke）→ 当前快照。
  - `desktop:tabs:mutate`（invoke，payload `{ op, ...args }`）→ 应用后的快照。
  - `desktop:tabs:snapshot`（main → 所有窗口广播，每次变更后发）。
- 在 `main.ts` 启动时注册（参照 `registerDataRootIpc` 等现有注册函数的形态）。
- 测试（vitest，desktop 包）：每个操作的语义、no-op 规则、revision 递增、adopt 仅空 store 生效、持久化往返（用临时目录注入路径）。

## Task 2 — 渲染层接入共享标签（desktop 模式）

- `apps/desktop/preload.ts`：在现有 `window.desktop.tabs` bridge 上补充 `getSnapshot()`、`mutate(op)`、`onSnapshot(cb)`（封装上面三个 channel；保持既有 `onCommand` 不动）。
- `apps/web/src/desktop/desktopTabsBridge.ts`：扩展 `DesktopTabsBridge` 类型与探测。
- `apps/web/src/desktop/tabsController.ts`：
  - 检测到新 bridge 能力时：`tabs[]` 以主进程广播为唯一来源，本地变更全部改为 `mutate` 提交（乐观更新可选，简单起见可等广播回来再渲染）；`activeTabId` 留在本窗口内存 + `sessionStorage`（每窗口独立）。
  - 激活标签在广播后不存在时，按现有 `closeTab` 的邻居规则在本地重选。
  - 迁移：bridge 可用且主进程快照为空、而 `localStorage("desktop-tabs-v1")` 有存档时，把旧 `tabs[]` 通过 `adopt` 提交一次，随后本地存档不再作为事实源。
  - 检测不到新 bridge（网页版 / 旧 preload）：现有逻辑原样保留。
- 测试：用假 bridge 覆盖「广播驱动渲染、mutate 上报、外部关掉当前激活标签后的重选、迁移只发生一次、无 bridge 时走 localStorage」。

## Task 3 — 窗口管理与重启恢复

- 新建 `apps/desktop/src/window/windowManager.ts`：
  - 稳定窗口 id：win-1、win-2…（取未占用最小序号）；`electron-window-state` 的 `file` 参数按 id 分档案。
  - `userData/windows.json`：`[{ id, activeTabId }]`；窗口关闭时移除条目、activeTab 变更时更新（渲染层经 IPC `desktop:windows:active-tab` 上报，preload 相应补一个方法）。
  - `openWindow()`（新窗口）、`restoreWindows()`（启动时按 windows.json 恢复全部；缺失/空则开一个默认窗口）。
- `main.ts`：启动改用 `restoreWindows()`；macOS `activate` 且无窗口时恢复上次布局。
- 应用菜单（`apps/desktop/src/menu/`）加「文件 → 新建窗口 ⌘N」调 `openWindow()`。
- 渲染层：窗口创建时通过 IPC 问到自己的 `{ windowId, activeTabId }`，作为 activeTab 初值（Task 2 的 sessionStorage 让位于这个初值）。
- 测试：windows.json 序列化/恢复往返、窗口 id 分配规则；菜单与 BrowserWindow 生命周期部分手工验收。

## Task 4 — 盯盘小窗（popout）

- 新建 `apps/desktop/src/window/popoutWindow.ts`：`createPopoutWindow(symbol)`——约 520×420、min 360×300、独立于 windowManager（不记 windows.json、不用 window-state 档案，层叠偏移摆放即可），加载 `/popout/symbol/{SYMBOL}`；复用 `mainWindow.ts` 的安全项（sandbox、navigation guard、windowOpenHandler）。
- 渲染层：`PageRouter` 加 `/popout/symbol/:symbol` 路由，渲染纯图表壳：无标签栏、无全局导航，顶部一条迷你报价（复用 `TopbarQuote` / 实时图表现有组件）。
- 入口：
  - 标签右键菜单（symbol 类标签）加「弹出盯盘小窗」，经 IPC 请求主进程开小窗（preload 补 `openPopout(symbol)`）。
  - 图表页顶栏加弹出按钮（仅 desktop bridge 存在时显示）。
- 测试：popout 路由壳的渲染测试（不出现标签栏/导航）；主进程入口手工验收。
