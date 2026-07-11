# Electron App Menu Manager 设计

日期：2026-07-12  
状态：已与用户对齐，待写实现计划

## 背景与目标

桌面端 `app/desktop` 目前只有 `main.ts` 里内联的 `buildAppMenu()`：App 菜单含「从 repo 导入数据…」和退出，Window 菜单含标签页快捷键。没有独立的 menu manager，也缺少 macOS 常见的编辑 / 显示 / 标准窗口项，以及关于、检查更新、设置。

目标：

1. **架构抽离**：菜单从 `main.ts` 拆成可组装、可测的 manager。
2. **补齐标准菜单**：Edit / View / 标准 Window role + 现有标签页项。
3. **常用桌面项**：关于、检查更新…、设置…（⌘,）。

## 已确认约束

| 决策点 | 结论 |
|---|---|
| 实现路径 | 分区 builder + 薄 Manager（方案 B） |
| 文案 | 自定义项全中文；系统 `role` 项不硬编码中文，跟系统本地化 |
| 范围 | 标准 role + 现有项 + 关于 / 检查更新 / 设置；Help 不做 |
| 平台 | 只发 macOS；不做 Win/Linux 特殊菜单 |
| 动态菜单 | 第一版固定模板；预留 `rebuild()`，不做 renderer 注册或按路由 enabled |
| 关于 | Electron `role: "about"`，不写自定义 About 窗口 |
| 关闭标签 | 继续自定义「关闭标签页」+ ⌘W，**不用** `role: "close"`（避免关整个窗口） |

## 非目标

- 从 renderer 注册菜单项
- 按当前 tab / 路由动态 enabled / visible
- Help 菜单
- Windows / Linux 菜单差异
- 自定义 About HTML
- 打包版隐藏 DevTools 菜单项（第一版保留 `toggleDevTools`）

## 架构

### 文件布局

```
app/desktop/src/menu/
  appMenuManager.ts      # createAppMenuManager(deps) → { install(), rebuild() }
  types.ts               # MenuActionDeps
  sections/
    appSection.ts        # App 菜单
    editSection.ts       # 编辑（全 role）
    viewSection.ts       # 显示（全 role）
    windowSection.ts     # 窗口（标签页 + 标准 role）
```

`main.ts` 只组装 `MenuActionDeps` 并调用 `manager.install()`，不再内联 template。

### 依赖方向

```
main.ts
  ├─ 业务（import flow / updater handle / sendTabsCommand / dialog）
  └─ createAppMenuManager(deps)
         └─ sections 只通过 deps 回调触发副作用
```

sections **不**直接 import `dialog`、`dataImport`、`sparkle`、kernel。所有副作用经 `MenuActionDeps` 注入，便于单测。

### 生命周期

| 时机 | 行为 |
|---|---|
| `app.whenReady` 且 kernel 起来后 | `install()` 一次 |
| 第一版 | 不按状态动态改菜单 |
| 预留 | `rebuild()` 与 `install()` 同一实现，供以后刷新 |

## 菜单树

### App 菜单（`label: app.name`）

| 顺序 | 项 | 类型 | 快捷键 | 行为 |
|---|---|---|---|---|
| 1 | （关于） | `role: "about"` | — | 系统 About 面板 |
| 2 | — | separator | | |
| 3 | 检查更新… | 自定义 | — | `deps.checkForUpdates()` |
| 4 | — | separator | | |
| 5 | 从 repo 导入数据… | 自定义 | — | 现有 `runImportFromRepoFlow` |
| 6 | 设置… | 自定义 | `CmdOrCtrl+,` | 发 tabs 命令 `open-settings` |
| 7 | — | separator | | |
| 8 | （服务） | `role: "services"` | — | macOS 标准 |
| 9 | — | separator | | |
| 10 | （隐藏 / 隐藏其他 / 显示全部） | `role: "hide"` 等 | — | macOS 标准 |
| 11 | — | separator | | |
| 12 | （退出） | `role: "quit"` | — | 系统本地化 |

### 编辑（Edit）

全 role：`undo` / `redo` / sep / `cut` / `copy` / `paste` / `pasteAndMatchStyle` / `delete` / `selectAll` / `speech` 子菜单。  
无自定义 deps。

### 显示（View）

全 role：`reload` / `forceReload` / `toggleDevTools` / sep / `resetZoom` / `zoomIn` / `zoomOut` / sep / `togglefullscreen`。  
无自定义 deps。打包版也保留 DevTools 项。

### 窗口（Window）

| 顺序 | 项 | 快捷键 | 行为 |
|---|---|---|---|
| 1 | 新建标签页 | `CmdOrCtrl+T` | `new-tab` |
| 2 | 关闭标签页 | `CmdOrCtrl+W` | `close-tab`（不用 `role: "close"`） |
| 3 | — | | |
| 4 | 下一个标签页 | `CmdOrCtrl+Shift+]` | `next-tab` |
| 5 | 上一个标签页 | `CmdOrCtrl+Shift+[` | `prev-tab` |
| 6 | — | | |
| 7 | （最小化） | `role: "minimize"` | 系统 |
| 8 | （缩放） | `role: "zoom"` | 系统 |
| 9 | — | | |
| 10 | （前置全部窗口） | `role: "front"` | macOS |

## 接口

### MenuActionDeps

```ts
export type MenuActionDeps = {
  importFromRepo: () => void;
  openSettings: () => void;
  checkForUpdates: () => void;
  newTab: () => void;
  closeTab: () => void;
  nextTab: () => void;
  prevTab: () => void;
};
```

### Manager

```ts
export type AppMenuManager = {
  install: () => void;
  rebuild: () => void; // 第一版与 install 同实现
};

export function createAppMenuManager(deps: MenuActionDeps): AppMenuManager;
```

内部：`Menu.setApplicationMenu(Menu.buildFromTemplate(template))`。

### 标签页命令扩展

```ts
// tabsChannels.ts
export type TabsCommand =
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "open-settings";
```

- 主进程：`openSettings` → `sendTabsCommand("open-settings")`
- preload：`TabsCommand` 类型同步扩展，`onCommand` API 不变
- 渲染进程：`tabsController` 收到 `open-settings` 时调用已有 `focusOrOpenSettings()`（与 titlebar 齿轮同一路径）

## 检查更新

现有 `initUpdater()` 只在启动时静默检查，无菜单入口。小改 `updater.ts`：

```ts
export type UpdaterHandle = {
  checkNow: () => void;
};

export function initUpdater(options?: InitUpdaterOptions): UpdaterHandle;
```

| 模式 | `checkNow()` 行为 |
|---|---|
| Sparkle 可用（打包且桥 init 成功） | `sparkleBridge.checkForUpdates()`（原生更新 UI） |
| 弱更新兜底 | 强制查 GitHub Releases（**用户手动触发绕过 24h 节流**）；有新版本 → 通知；已最新 → dialog「已是最新版本」；失败 → dialog 提示失败 |
| 开发模式（`ELECTRON_DEV=1`） | dialog：开发模式不检查更新 |

「检查更新…」菜单项始终可见，不按模式 disabled。`main` 持有 `UpdaterHandle`，塞进 `MenuActionDeps.checkForUpdates`。

弱更新路径需要把「是否绕过 throttle」从现有 `checkForUpdate` 逻辑里拆出可测开关（例如 `force?: boolean`，或单独 `checkForUpdateNow`），避免菜单与启动静默检查缠在一起。

## 关于

`role: "about"`。应用名来自现有 `app.setName`（`bootEnv`）；版本用 Electron 默认 `app.getVersion()`。第一版不接自定义 About HTML。

## main.ts 变更

- 删除内联 `buildAppMenu`
- `whenReady` 中：`const updater = initUpdater()` → 组装 deps → `createAppMenuManager(deps).install()` → `createWindow()`
- import flow、window 创建、kernel boot 逻辑位置不变

## 测试

| 测什么 | 怎么测 |
|---|---|
| sections 结构 | 单测 builder 输出的 template：含预期 `role`、中文 label、accelerator |
| click 接线 | mock deps，调用带 `click` 的项，断言对应 dep 被调用 |
| `open-settings` | 渲染侧：command 映射到 `focusOrOpenSettings`（扩现有 tabs 相关测，或轻量映射测） |
| updater `checkNow` | sparkle 路径调 `checkForUpdates`；weak 路径绕过 throttle；dev 不发网络请求 |

优先测纯函数 builder 输出的 template 数组；`install` 对 `Menu.setApplicationMenu` 做 mock。沿用 `app/desktop/test` 的 vitest 模式。

## 文档

- 更新 `app/desktop/README.md`：说明菜单里设置、检查更新、导入的位置与行为
- 本设计文档：`docs/superpowers/specs/2026-07-12-electron-app-menu-manager-design.md`

## 实现顺序建议

1. `menu/types.ts` + 四个 section builder + `appMenuManager`（可先 mock deps 单测）
2. 扩展 `TabsCommand` + preload 类型 + `tabsController` 处理 `open-settings`
3. `updater` 暴露 `UpdaterHandle.checkNow` + 弱更新 force 路径单测
4. `main.ts` 接线，删除旧 `buildAppMenu`
5. README 更新 + desktop 测试全绿
