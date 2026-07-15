# 多窗口 + 共享标签 + 盯盘小窗 设计

日期：2026-07-15
状态：已与用户确认方向（形态 C；标签列表全窗口共享；小窗独立于标签体系；同步机制选主进程 store）

## 目标

桌面版（Kansoku）支持同时开多个窗口，每个窗口看不同标的：

1. **完整窗口**可开多个（⌘N），每个窗口功能与现在的主窗口完全一致。
2. **标签列表全局共享**：所有完整窗口显示同一份标签，任何窗口开/关/改标签，其它窗口实时跟随；但**每个窗口各自决定当前激活哪个标签**。
3. **盯盘小窗（popout）**：无标签栏、无导航的纯图表小窗，适合铺开盯盘；不进标签列表，不持久化，关掉即弃。

网页版（浏览器直接访问）行为完全不变。

## 现状（实现前提）

- 打包版只有一个 `BrowserWindow`（`app/desktop/src/main.ts` → `window/mainWindow.ts`），窗口位置由 `electron-window-state` 单档案记忆。
- 标签全部在渲染层：`app/web/src/desktop/tabsStore.ts` 是纯函数集合，状态 `TabsSnapshot { tabs[], activeTabId }` 持久化在 `localStorage("desktop-tabs-v1")`；`tabsController.ts` 驱动，`desktopTabsBridge.ts` 只接收主进程的菜单命令（new-tab / close-tab / …）。
- kernel 在主进程，渲染进程经 preload 的 MessagePort 接入；实时层本就按连接多路广播，多窗口下行情仍共享同一条长桥 WS 连接（0.12.0 已验证）。

单窗口假设的两处坑：多窗口会互相覆盖 `localStorage` 存档且互不感知；`electron-window-state` 单档案会让两个窗口抢同一份位置记忆。

## 设计

### ① 标签共享 —— 主进程 tabs store（单一事实源）

- 主进程新增 `desktop/src/tabs/store.ts`：
  - 状态：全局 `tabs: TabState[]`（id / route / title / scrollY），**不含 activeTabId**。
  - 持久化：`userData/tabs.json`，变更后防抖落盘（~500ms）。
  - 变更接口（IPC，渲染层 → 主进程）：open / close / closeOthers / closeToRight / updateRoute / updateTitle / updateScroll（与现有 `tabsStore.ts` 纯函数一一对应，不新增能力）。
  - 每次应用变更后把新快照（带自增 revision）广播给所有窗口。
- 冲突规则：主进程按到达顺序应用；对不存在标签的操作是无操作（no-op）。两个窗口同时关同一个标签 = 第二个请求落空，无报错。
- `activeTabId` 降级为**每个窗口自己的状态**：渲染层本地持有；变更时上报主进程记入该窗口的档案（用于重启恢复）。
- 某窗口激活的标签被其它窗口关掉：该窗口收到广播后发现 activeTabId 不在列表里，按现有单窗口规则切到相邻标签。
- 两个窗口允许同时激活同一个标签（各自渲染各自的实例；route/title/scrollY 仍是共享字段，以后到先得为准——接受这个简化）。
- 渲染层改造：`tabsController` 检测到 desktop bridge 时，`tabs[]` 的读写全部走 IPC + 广播订阅；检测不到（网页版）时维持现状（纯函数 + localStorage），`tabsStore.ts` 的纯函数继续复用。
- 迁移：desktop 首次启动时若 `tabs.json` 不存在而渲染层 localStorage 有旧存档，由渲染层把旧 `tabs[]` 提交给主进程一次性接管。

### ② 窗口管理

- 新增 `desktop/src/window/windowManager.ts`：
  - 每个完整窗口分配稳定 id（win-1、win-2…，取当前未占用的最小序号）。
  - `electron-window-state` 按窗口 id 分档案（`window-state-win-1.json` …），位置大小互不干扰。
  - 维护 `userData/windows.json`：`[{ id, activeTabId }]`，窗口关闭/激活标签变更时更新。
- 入口：应用菜单「文件 → 新建窗口 ⌘N」。
- 重启恢复：启动时按 `windows.json` 恢复全部完整窗口（数量、各自位置、各自激活标签）；文件缺失或为空时开一个默认窗口。
- macOS 全关后点 Dock（activate）：恢复上次的窗口布局；其它平台维持 window-all-closed 即退出。
- 「上次布局」只包含退出/崩溃时仍开着的窗口：用户主动关掉的窗口即时从布局记录中移除，不参与恢复。所以逐个关完所有窗口再点 Dock，得到的是一个默认窗口——这是设计行为。

### ③ 盯盘小窗（popout）

- `desktop/src/window/popoutWindow.ts`：`createPopoutWindow(symbol)`，默认约 520×420、最小 360×300，加载 `/popout/symbol/{SYMBOL}` 路由；无标签栏；⌘W 直接关窗。
- 渲染层新增 popout 路由壳：纯图表 + 顶部迷你报价条（复用现有实时图表与 `TopbarQuote` 能力），不渲染标签栏和全局导航。
- 入口两处：标签右键菜单「弹出盯盘小窗」（仅 symbol 类标签）、图表页顶栏弹出按钮。
- 不进标签列表、不写 `windows.json`、重启不恢复。
- 小窗数量不设上限；行情订阅走共享连接，成本只是多一个订阅。

### ④ 数据层

零改动。每个窗口（含小窗）各持一条 MessagePort 连接同一个 kernel 实例，实时通道按连接广播；行情始终共享一条长桥 WS。

## 不做的事（YAGNI）

- 标签拖拽跨窗口移动（B 模式下无此概念）。
- 小窗置顶（always-on-top）、透明度等盯盘增强——后续需要再说。
- 网页版多标签同步。

## 测试

- 主进程 store：变更函数与冲突规则（含并发关同一标签）、持久化与恢复的纯函数测试。
- 渲染层：`tabsController` 在 desktop 模式下用假 bridge 验证「广播驱动 tabs[]、activeTabId 本地规则、激活标签被外部关闭时的切换」。
- 窗口档案：`windows.json` 序列化/恢复往返测试。
- 手工验收：两窗口同步开关标签；重启还原窗口布局；弹出小窗盯盘并随手关闭。
