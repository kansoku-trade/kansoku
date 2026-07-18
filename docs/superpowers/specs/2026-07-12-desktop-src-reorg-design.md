# apps/desktop/src 主进程目录重排设计

## 背景

`apps/desktop/src` 是 Electron 主进程代码。当前根目录平铺了约 20 个文件，职责混在一起（启动、凭据、外部 API、更新器、窗口导航、数据导入……）；`main.ts`（317 行）尤其臃肿，同时干了 kernel 启动编排、窗口工厂、外部 API 的 IPC 注册、数据导入的整套弹窗流程、菜单接线、致命错误窗口、dev dock 图标和一堆常量。真正属于「入口」的只有底部那段 `whenReady` 生命周期编排。

`ipc/`、`menu/` 两个子目录已经是「按域聚合」的清晰结构，不属于问题范围。

**目标**：把整个主进程重排成一套统一的「按领域切竖片」结构，让 `ipc/`、`menu/` 成为同一原则的既有实例；同时给 `main.ts` 瘦身，只保留组合根职责。

**硬约束**：全程**零行为变更**——纯文件移动 + import 路径更新 + 从 `main.ts` 抽函数，不改任何逻辑。

## 组织原则

按领域切竖片：每个能力一个文件夹，收纳它的全部零件（逻辑 + 通道常量 + IPC 注册 + 相关窗口）。新功能 = 新文件夹，「东西该放哪」一眼可答。

`main.ts`、`preload.ts` 留在 `src/` 根目录，因为它们是 `tsdown.config.ts` 点名的两个构建入口——留在根目录则 config 无需改动。

## 目标目录树

```
src/
  main.ts              入口：import 顺序守卫 + whenReady 编排 + app 事件（~70 行）
  preload.ts           renderer bridge（位置不动，构建入口）

  boot/                启动与环境
    env.ts             ← bootEnv.ts（必须最先 import 的环境根设置；顺带导出 IS_DEV）
    paths.ts           ← repoRoot.ts（repo root + data root scaffold）
    kernel.ts          【新】从 main.ts 抽出的 bootKernel()

  window/              原生窗口 + 导航约束
    mainWindow.ts      【新】createWindow()；导出 DEV_WEB_URL / PROD_APP_URL / WINDOW_BG / APP_ICON_PNG
    fatalErrorWindow.ts【新】showFatalErrorWindow()
    dockIcon.ts        【新】applyDevDockIcon()
    navigationGuard.ts ← navigationGuard.ts（原样迁入）

  protocol/            app:// scheme + 静态资源服务
    protocol.ts        ← protocolHost.ts；导出 WEB_DIST_ROOT

  credentials/         凭据（券商登录 + AI 主密钥）
    channels.ts        ← credentialsChannels.ts
    bridge.ts          ← credentialsBridge.ts
    store.ts           ← credentialStore.ts
    provider.ts        ← desktopCredentialProvider.ts
    secretBox.ts       ← desktopSecretBox.ts

  externalApi/         对外 HTTP + token
    controller.ts      ← externalApi.ts
    ipc.ts             【新】registerExternalApiIpc()

  dataImport/          从 repo 导入图表
    manifest.ts        ← dataImport.ts（纯逻辑）
    flow.ts            【新】runImportFromRepoFlow() + messageBox/openDialog 私有辅助

  updater/             自动更新
    updater.ts         ← updater.ts
    sparkle.ts         ← sparkle.ts

  tabs/                标签页命令
    channels.ts        ← tabsChannels.ts
    commands.ts        【新】sendTabsCommand()

  realtime/
    bridge.ts          ← realtimeBridge.ts

  ipc/                 不动（已是「按域聚合的 IPC 注册表」）
  menu/                不动
```

### 分叉点取法

1. **`protocol/` 独立成单文件夹**，不塞进 `window/`。app:// scheme 注册在 module 顶层跑（早于 `app.ready`），加上 139 行静态服务逻辑，是自成一体的子系统。单文件夹在此可接受，标记「资源服务住这」。
2. **channel 常量就近放在各自领域**（`credentials/channels.ts`、`tabs/channels.ts`），不集中成 `channels/`。这些常量本就是领域的一部分，`ipc/groups` 也一直在 `ipc/` 里；`preload.ts` 跨文件夹 import 完全可接受。领域内聚优先于契约集中。
3. **`realtime/`、`tabs/` 允许小文件夹**，换取原则统一，不设特例。

## `main.ts` 瘦身后的最终形态

`main.ts` 只保留组合根职责——**接线，不含实现**：

1. `import { dataRoot } from "./boot/env.js"` —— 仍是第一 import，顺序守卫注释保留
2. `registerAppScheme()` —— module 顶层调用（来自 `protocol/`）
3. 模块级 `externalApiController` 引用
4. `app.whenReady().then()` 编排，依次调用：
   - `applyDevDockIcon()` ← `window/dockIcon`
   - `bootKernel()` ← `boot/kernel`
   - `createServices(ipcServiceClasses)`
   - `registerAppProtocolHandler()` ← `protocol/`
   - `createExternalApiController` + `registerExternalApiIpc` + `boot` ← `externalApi/`
   - `initUpdater()` ← `updater/`
   - `installAppMenu(deps)` —— 内联接线，见下
   - `createWindow()` ← `window/mainWindow`
5. app 事件：`activate` / `window-all-closed` / `before-quit`
6. 顶层 `catch` 调 `showFatalErrorWindow()` ← `window/fatalErrorWindow`

**`installAppMenu` 的归属**：纯接线（把 menu deps 连到各子系统），留在 `main.ts` 内联，每个 dep 委托给领域模块——`importFromRepo → dataImport/flow`、tabs 四个命令 → `tabs/commands`、`checkForUpdates → updater`。这是组合根的职责，不外移。

**`bootKernel` 内的 credentials IPC 注册**：`registerCredentialsIpc` 依赖 kernel 就绪后的 `credentialsService`，随 `bootKernel` 一起留在 `boot/kernel.ts`，不再拆。

### 新增文件的导出契约

| 文件 | 导出 | 承载内容 |
|---|---|---|
| `boot/kernel.ts` | `bootKernel(): Promise<Kernel>` | secretBox 装配、`initServerRuntime`、`attachRealtimeBridge`、credentials IPC 注册、health self-test |
| `window/mainWindow.ts` | `createWindow()` + 窗口常量 | windowState、will-navigate/openHandler 守卫、loadURL |
| `window/fatalErrorWindow.ts` | `showFatalErrorWindow(error)` | data: URL 错误页 + `dialog.showErrorBox` |
| `window/dockIcon.ts` | `applyDevDockIcon()` | dev 模式 macOS Dock 图标 |
| `externalApi/ipc.ts` | `registerExternalApiIpc(controller)` | 4 个 `desktop:external-api:*` handler |
| `dataImport/flow.ts` | `runImportFromRepoFlow(win)` | 目录选择 + 校验 + 冲突弹窗 + 复制汇总，`messageBox/openDialog` 为私有辅助 |
| `tabs/commands.ts` | `sendTabsCommand(command)` | 向 focused window 发 `TABS_COMMAND_CHANNEL` |

### 常量下沉

- `DEV_WEB_URL / PROD_APP_URL / WINDOW_BG / APP_ICON_PNG` → `window/mainWindow.ts` 导出（dock 与窗口共用 icon 路径）
- `WEB_DIST_ROOT` → `protocol/protocol.ts`（只有协议注册用）
- `IS_DEV` → `boot/env.ts` 导出（已在算 `dataRoot`，顺带导出）

## 命名约定（确立「以后新文件放哪/叫啥」）

- 文件夹 = 领域名（`credentials`、`externalApi`、`dataImport`）。
- 文件夹内文件用**角色名去掉领域前缀**：`credentialStore.ts → credentials/store.ts`、`desktopCredentialProvider.ts → credentials/provider.ts`。领域已在路径里，不再重复。
- 通道常量统一叫 `channels.ts`；IPC 注册统一叫 `ipc.ts`；命令发射统一叫 `commands.ts`。
- **不加 barrel（`index.ts`）**：现状全是直接路径 import。`ipc/index.ts` 是 electron-ipc-decorator 的注册清单（例外，保留）；领域文件夹不引入 barrel。

## 测试

- `test/` 从平铺改为镜像 `src/` 子目录：`test/credentials/store.test.ts`、`test/window/navigationGuard.test.ts` ……一一对应。
- 每个测试文件顶部的 `../src/...` import 路径同步更新。
- 特例改名：`bootEnvOrdering.test.ts → test/boot/envOrdering.test.ts`、`ipcGroups.test.ts → test/ipc/groups.test.ts`。
- **验收基线**：迁移后 `pnpm --filter @trade/desktop test` 全绿。

## 构建

- `tsdown.config.ts` 的两个 entry（`src/main.ts`、`src/preload.ts`）**不变**——这两个文件留在根目录。
- `preload.ts` 的三处 import 改新路径：`./credentials/channels.js`、`./tabs/channels.js`、`./ipc/groups.js`。
- `repoRoot.ts → boot/paths.ts`：其中锚定 `dist-main/main.mjs` 产物路径的 path math **不受影响**（`main.ts` 仍是 `dist-main` 入口，产物路径不变），但注释里「this module」的措辞需顺带核对。

## 迁移执行方式

- 按领域文件夹逐个搬（`git mv` 保历史）+ 改 import + 跑该域测试，**一个域一个 commit**。
- 顺序：先搬无被依赖的叶子（`updater/`、`realtime/`、`dataImport/`），再搬 `credentials/`、`externalApi/`，最后抽 `main.ts` 相关（`boot/`、`window/`、`protocol/` + 瘦身）。
- 全程零行为变更：纯移动 + 改路径 + 抽函数，不改逻辑。

## 非目标

- 不动 `ipc/`、`menu/` 内部结构（已合规）。
- 不改任何运行时行为、不重构逻辑、不加/删功能。
- 不引入 barrel 文件（`ipc/index.ts` 除外，保留现状）。
```
