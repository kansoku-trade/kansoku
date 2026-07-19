# 桌面端 IPC 统一为 decorator 体系 + src 目录按业务归组

日期:2026-07-20
范围:仅 `apps/desktop` 与 `apps/web` 的桌面 bridge 模块,不碰 `apps/pro`。

## 背景与问题

`apps/desktop/src` 现有两套 IPC 体系并存:

1. `ipc/` 目录:14 个业务 service class,走 `electron-ipc-decorator`,由 `createServices(ipcServiceClasses)` 批量注册,renderer 经 `desktop.rpc.invoke('group.method')` 白名单通道调用。
2. 8 个 feature 目录各带一个 `ipc.ts`(onboarding、appControl、dataRoot、tabs、window、logging、contextMenu、updater):裸 `ipcMain.handle` + 手写 `registerXxxIpc`,在 `main.ts` 逐个调用,preload 里各自有一段具名 `desktop.xxx` 桥。

问题:两套注册风格并存、preload 桥样板膨胀、`main.ts` 里 8 行手工注册、8 行 `ipc.ts` 的碎片文件(如 `appControl/ipc.ts`)。另外 src 下 16 个目录平铺,业务壳层与基础设施混在一层。

## 决策

### 1. 壳层 IPC 全部迁入 decorator class(invoke 部分)

8 个 `registerXxxIpc` 原地改写为 class,文件位置不动(保持 colocation):

| class(groupName) | 方法 | 构造依赖 |
| --- | --- | --- |
| `OnboardingIpc`(`onboarding`) | getState / complete | OnboardingStore |
| `AppControlIpc`(`appControl`) | relaunch | 无 |
| `DataRootIpc`(`dataRoot`) | get / pick / reset | 无 |
| `TabsIpc`(`tabs`) | getSnapshot / mutate | TabsService |
| `WindowsIpc`(`windows`) | getContext / openPopout / openWindow / reportActiveTab | WindowManager |
| `LogsIpc`(`logs`) | getInfo / tail / reveal / openDir | FileLogger |
| `ContextMenuIpc`(`contextMenu`) | popup | 无 |
| `UpdaterIpc`(`updater`) | getStatus / installNow | Updater |

要点:

- **构造函数 DI,不走库的 `createServices`**。库的 `IpcServiceConstructor` 要求零参构造,但 base class 在构造时即自动注册方法(已核实 `electron-ipc-decorator@1.0.1` 源码),所以 `main.ts` 作为 composition root 在依赖造好后直接 `new TabsIpc(tabsService)` 即可。`super()` 先于字段赋值执行没有问题:注册只做 `method.bind(this)`,依赖在调用时才被读取。
- 需要区分调用方窗口的方法(`windows.getContext` / `reportActiveTab`)用库的 `getIpcContext()` 取 sender。
- `windows.reportActiveTab` 从 `ipcRenderer.send` 改为 invoke,消掉一条裸 send 通道。
- 壳层方法返回裸值,**不套业务侧的 envelope**(envelope 是 core contract 的错误映射,壳层不适用)。库对 handler 异常的行为是 log + rethrow,renderer 收到 rejected promise,与现状语义一致。
- 业务域 14 个 service 仍走 `createServices(ipcServiceClasses)`,不改。

### 2. 推送/事件通道保留 preload 手工桥

以下形状装不进 invoke 体系,维持现状:

- `tabs.onCommand` / `tabs.onSnapshot`(main → renderer 推送)
- `updater.onStatus`(推送)
- `rendererCalls`(main 反调 renderer)
- `credentials`(含 MessagePort bridge)
- MessagePort kernel bridge(`desktop-rt-connect`)

对应 feature 的 `channels.ts` 只保留推送通道常量,invoke 通道常量删除。

### 3. preload 收缩

- `IPC_GROUPS` 增加 8 个壳层组名:`onboarding`、`appControl`、`dataRoot`、`tabs`、`windows`、`logs`、`contextMenu`、`updater`。实现上拆成 `KERNEL_IPC_GROUPS`(与 core contract 的组一一对应,有测试守着)与 `SHELL_IPC_GROUPS` 两个常量,`IPC_GROUPS` 是两者拼接。
- 删除 preload 中 `desktop.onboarding` / `appControl` / `dataRoot` / `logs` / `contextMenu` / `windows` 整段;`desktop.tabs` 只剩 `onCommand` / `onSnapshot`,`desktop.updater` 只剩 `onStatus`。

### 4. web 侧:bridge 模块内部改走 rpc,上层 API 不变

新增 3 行 helper `apps/web/src/desktop/shellInvoke.ts`:

```ts
export function shellInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const rpc = (window as DesktopGlobal).desktop?.rpc;
  if (!rpc) throw new Error('desktop rpc unavailable');
  return rpc.invoke(channel, ...args) as Promise<T>;
}
```

改动点(各模块本地类型声明不动,只换调用):`desktopTabsBridge`、`desktopUpdater`、`desktopWindowsBridge`、`settings/desktopDataRoot`、`settings/desktopAppControl`、`ui/contextMenu/electronBridge`、onboarding 调用点、logs 页面,及对应测试。

### 5. src 目录按业务维度归组(四域制)

组内子目录名不变,只加一层:

```
src/
  main.ts  preload.ts  global.d.ts
  boot/           (env, kernel, paths, proActivationWatch, proRelaunch, skills)
  kernel/
    ipc/          (14 个业务 service + envelope + groups)
    realtime/     (MessagePort kernel bridge)
  shell/
    window/  tabs/  menu/  contextMenu/
    appControl/  onboarding/  updater/
  data/
    dataRoot/  dataImport/  credentials/
  platform/
    protocol/  logging/  rendererCall/
```

移动用 `git mv`,同步修正全部相对 import(desktop 包内自引 + preload/main 的引用)。

## 验证

1. 只对改动文件跑 lint(含 typecheck),desktop 与 web 两侧。
2. 更新并跑受影响的 web 测试(tabs / updater / windows bridge、contextMenu adapters、ipc client 不受影响)。
3. `pnpm dev:desktop` 手动过一遍:onboarding 流程、标签页增删切换、弹出窗口、更新器状态显示、日志页、设置页的数据目录与重启按钮、右键菜单。

## 不做的事

- 不把推送通道硬塞进 invoke 体系。
- 不给壳层套 envelope、不把壳层类型并进 core contract。
- 不动 `apps/pro` 与业务 14 个 service 的注册方式。
