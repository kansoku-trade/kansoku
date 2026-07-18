# 标题栏更新徽章与一键安装

**日期：** 2026-07-14  
**状态：** 待实现  
**范围：** `apps/desktop`（主进程 updater、Sparkle bridge、主窗 focus）+ `apps/web`（`DesktopTitlebar`）

## 背景

桌面端已有两套更新能力：

- **Sparkle**（正式包优先）：`SPUStandardUpdaterController`，菜单「检查更新…」调用 `checkForUpdates`，走完整用户检查 UI。
- **弱检查**（Sparkle 不可用时回退）：拉 GitHub `releases/latest`，节流 1 小时，有更新时发系统通知并打开 Release 页。

标题栏是自定义 inset titlebar（`DesktopTitlebar`），右侧目前是「新建图表」与设置。用户希望主窗回到前台时静默检查；有更新则在标题栏给出入口，且一点即装，不再多点一次「安装更新」。

## 目标

1. 主窗**激活到前台**时触发一次**静默**检查更新（有节流）。
2. 发现有更新时，在标题栏右侧操作区**左侧**显示**图标按钮**（无可见文案）。
3. 点击该按钮：**跳过**「发现更新，是否安装」确认，直接进入下载/安装进度；菜单「检查更新…」行为不变。
4. 开发模式不检查、不显示徽章。

## 非目标

- 不改自动后台静默安装策略（不强制全局 `automaticallyDownloadsUpdates`）。
- 不跳过 macOS 授权框（如需管理员权限）。
- 不在弱检查路径实现真正的应用内安装（无 Sparkle 时只能打开 Release/下载页）。
- 不做「忽略此版本 / 关闭徽章」的持久偏好（有更新则显示，确认已是最新则隐藏）。
- 不改 Web 非 Electron 路径（无 `window.desktop.updater` 时不渲染）。

## 已确认产品决策

| 项                | 决策                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| 触发时机          | 主窗每次被激活到前台                                                                               |
| 节流              | 静默检查 1 小时内最多真正请求一次；节流期内若上次结果为「有更新」，徽章继续显示                    |
| 徽章形态          | 图标（lucide `ArrowUpCircle`），`aria-label` / `title` 为「有更新可用」                            |
| 徽章位置          | 标题栏右侧操作区最左：`[更新图标] [新建图表] [设置]`                                               |
| 点击徽章          | **直接安装路径**：跳过「有更新要装吗」；保留下载/解压进度；**保留**「安装并重启」确认              |
| 菜单「检查更新…」 | 仍走完整确认流（发现更新 → 用户点安装 → 下载 → 安装并重启）                                        |
| 静默路径通知      | focus 静默检查**不再**弹系统 Notification（避免与徽章重复）                                        |
| 探测有无更新      | 主进程 GitHub Releases 版本比较（与现弱检查同源），与 Sparkle appcast 理论上可能短暂不一致，可接受 |

## 架构

```
主窗 focus
  → updater.silentCheckOnActivate()
  → checkForUpdate(force=false, notify=false)   // 1h 节流
  → 更新内存状态 available | up-to-date | …
  → 推送给 renderer

renderer DesktopTitlebar
  → 订阅 desktop.updater.onStatus
  → status.kind === "available" 时渲染图标按钮

点击图标
  → desktop.updater.installNow()
  → Sparkle: installUpdateNow()  // 自动 reply Install 于「发现更新」
  → 弱检查: 打开 release htmlUrl（无法应用内安装）
```

**状态单一来源在主进程**；渲染进程只订阅与触发动作。

## 主进程：updater 状态与 API

### 状态

```ts
type UpdaterUiStatus =
  | { kind: 'unknown' }
  | { kind: 'up-to-date'; current: string; latest: string }
  | { kind: 'available'; version: string; htmlUrl: string }
  | { kind: 'error'; message: string }; // 可选；默认失败不覆盖已有 available
```

规则：

- `available` → 显示徽章。
- `up-to-date` → 隐藏徽章。
- `throttled`（检查层结果）→ 不改状态。
- `fetch-failed` / `no-release` → **不**把已有 `available` 清掉（避免网络抖动闪没徽章）。
- 成功 `up-to-date` 可清除 `available`。

### 静默检查

扩展现有 `checkForUpdate` / `UpdaterDeps`：

- 增加 `silent?: boolean` 或 `notify` 可控：静默路径 **`notify` 不调用**。
- 仍写 `lastCheckIso`、仍用 `THROTTLE_MS`（1h）与 `userData/updater.json`。
- `force: false`。

入口：`silentCheckOnActivate()`，供主窗 `focus`（必要时 `show`）调用。

### 防抖 / 连点

- 短时间多次 `focus`：节流挡住重复网络请求。
- `installNow` 若 Sparkle `sessionInProgress`：不重复开 session，可 `showUpdateInFocus` 或 no-op 打日志。

### 开发模式

`initUpdater` 在 dev 返回的 handle：

- `silentCheckOnActivate` → no-op
- `getStatus` → `unknown`
- `installNow` → 可提示「开发模式不检查更新」（与 `checkNow` 一致）或静默 no-op；与菜单一致即可。

### `UpdaterHandle` 扩展

```ts
type UpdaterHandle = {
  checkNow: () => void; // 菜单：完整用户检查
  silentCheckOnActivate: () => void; // focus：静默 + 节流
  getStatus: () => UpdaterUiStatus;
  onStatus: (cb: (s: UpdaterUiStatus) => void) => () => void;
  installNow: () => void; // 标题栏：跳过「发现更新」确认
};
```

## Sparkle bridge 改动

现有导出：`init` / `checkForUpdates` / `setAutomaticChecks`。

新增：

```ts
// SparkleBridge
installUpdateNow(): void;
```

### 行为

`installUpdateNow` 走**用户主动更新 session**（与 `checkForUpdates` 同级入口），但在 user driver 层：

- 收到 `showUpdateFoundWithAppcastItem:state:reply:` 时，**立即** `reply(SPUUserUpdateChoiceInstall)`，不展示「发现更新」标准确认窗。
- 其余 UI **转发给** `SPUStandardUserDriver`（下载进度、解压、错误、**安装并重启确认**等）。

### 实现要点

当前用 `SPUStandardUpdaterController` 默认标准 user driver，难以插入自动 Install。建议：

1. 改为自建 `SPUStandardUserDriver` + `SPUUpdater`（或 controller 若支持注入 userDriver；以框架 API 为准），用 **代理 `SPUUserDriver`** 包一层标准 driver。
2. 代理上设标志位 `autoAcceptFoundUpdate`：仅在 `installUpdateNow` 路径开启；`checkForUpdates` 路径关闭。
3. `showUserInitiatedUpdateCheckWithCancellation`：可转发（短暂「检查中」可接受）；若易关掉且不影响 session，可再优化，非必须。
4. `showReadyToInstallAndRelaunch:`：**必须转发**给标准 driver，保留用户确认。
5. 主线程调用；与现有 `checkForUpdates` 同样注意 `canCheckForUpdates` / `sessionInProgress`。

菜单路径继续调用现有 `checkForUpdates()`，**不**开 auto-accept。

## 弱检查路径 `installNow`

无 Sparkle 时：

- 若状态为 `available`：`shell.openExternal(htmlUrl)`。
- 若状态未知：可 `force` 再查一次；有更新则打开链接；否则 dialog 提示（与 `checkNow` 类似）。
- 无法应用内安装——在日志与可选提示中说明即可，不必强弹教程式文案。

## 主窗 focus 接线

在创建主窗** `BrowserWindow` 上监听 `focus`：

```ts
win.on('focus', () => updater.silentCheckOnActivate());
```

注意：

- 仅主内容窗，不含 fatal error 窗。
- `app.on("activate")` 只负责无窗时 `createWindow`，静默检查挂在窗的 `focus` 上即可。
- 启动后首次 `show`/`focus` 会触发一次；与现有弱检查启动 delay 可并存，靠 1h 节流合并。

## IPC 与 preload

通道建议（命名可微调，保持 `desktop:` 前缀一致）：

| 通道                                | 方向                                                      | 用途           |
| ----------------------------------- | --------------------------------------------------------- | -------------- |
| `desktop:updater:get-status`        | invoke                                                    | 拉取当前状态   |
| `desktop:updater:status`            | main → renderer event                                     | 状态变更推送   |
| `desktop:updater:install-now`       | invoke / send                                             | 标题栏一点安装 |
| （可选）`desktop:updater:check-now` | 若菜单也改走 IPC；当前菜单在主进程直接调 handle，可不暴露 |

`preload.ts` 在 privileged origin 下：

```ts
desktop.updater = {
  getStatus: () => ipcRenderer.invoke('desktop:updater:get-status'),
  onStatus: (cb) => {
    /* on + removeListener */
  },
  installNow: () => ipcRenderer.invoke('desktop:updater:install-now'),
};
```

若项目对 IPC channel 有白名单，需把上述通道登记进去。

## 标题栏 UI

文件：`apps/web/src/desktop/DesktopTitlebar.tsx`（及对应 CSS）。

- 仅当 `desktop.updater` 存在且 `status.kind === "available"` 时渲染按钮。
- 图标：`ArrowUpCircle`（lucide-react，与现有 titlebar 图标一致）。
- `aria-label="有更新可用"`，`title` 同文案。
- 样式：与设置齿轮同级的小图标按钮；可用轻微 accent，避免抢 tab。
- 点击：`void desktop.updater.installNow()`。
- 挂载时 `getStatus` + `onStatus` 订阅；卸载时取消订阅。

## 与菜单的职责划分

| 入口              | 行为                                                                |
| ----------------- | ------------------------------------------------------------------- |
| 菜单「检查更新…」 | `checkNow()` → Sparkle 完整 UI / 弱检查 force + 对话框              |
| 标题栏更新图标    | `installNow()` → 跳过「发现更新」确认，直接下载；弱检查打开 Release |
| 主窗 focus        | `silentCheckOnActivate()` → 只更新状态与徽章，无弹窗无通知          |

## 错误与边界

| 场景                        | 处理                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| 开发模式                    | 无徽章；静默 no-op                                                           |
| 节流 + 上次有更新           | 徽章保持                                                                     |
| 检查失败                    | 不清除已有 available                                                         |
| 用户已升级                  | 下次成功 up-to-date → 隐藏徽章                                               |
| Sparkle 安装 session 进行中 | 不重复启动；可前置已有 UI                                                    |
| GitHub 有更新但 appcast 无  | 徽章可能亮，点安装后 Sparkle 可能「无更新」——罕见；可接受，错误走标准错误 UI |
| 多窗                        | 状态广播所有 webContents 或仅主窗；当前产品单主窗                            |

## 测试

### 单元（desktop）

- 静默检查：`available` / `up-to-date` / `throttled` 保持 / 失败不降级 available。
- 静默路径不调用 `notify`。
- `createUpdaterHandle`：`installNow` 在 sparkle 模式调 `installUpdateNow`；weak 模式打开 `htmlUrl`。
- 版本比较与节流沿用现有用例。

### bridge

- 若有可测的 C++/ObjC 层则补；至少文档化手动验收：正式包有更新时点徽章应直接进下载进度，不出现「是否安装」确认，且会出现「安装并重启」。

### web

- 有 `available` 状态时标题栏渲染更新图标；非 available 不渲染。
- 点击调用 `installNow`（mock）。

## 实现顺序建议

1. 扩展 `checkForUpdate` 静默/`notify` 开关 + 状态机 + 单元测试。
2. Sparkle bridge：`installUpdateNow` + 代理 user driver。
3. IPC + preload + `main`/`mainWindow` focus 接线。
4. `DesktopTitlebar` 图标按钮与样式。
5. 打包路径手动点验（有/无更新、菜单 vs 徽章）。

## 风险

- **Sparkle user driver 代理**是本需求最大实现面；需在真机正式包验证 session 与自动 Install 是否破坏标准 driver 内部状态。
- GitHub 与 appcast 双源：徽章用 GitHub，安装用 Sparkle；不一致时体验略怪，换用 `checkForUpdateInformation` 做探测可作为后续优化，本版不做。

## 验收标准

1. 正式包：主窗从后台回前台后，若远程有新版本，约在检查完成后标题栏出现更新图标（1h 内重复 focus 不反复打网）。
2. 点击图标：直接出现下载（或等价进度）UI，**不**出现「发现新版本请确认安装」那一层。
3. 下载完成后仍出现「安装并重启」类确认。
4. 菜单「检查更新…」仍为完整确认流。
5. 开发模式无徽章。
6. 已是最新时徽章消失。
