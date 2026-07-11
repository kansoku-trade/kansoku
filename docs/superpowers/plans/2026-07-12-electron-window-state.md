# Electron 窗口状态恢复实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Electron 主窗口在下次启动时恢复上次普通状态下的尺寸与位置，但不恢复最大化或全屏状态。

**Architecture:** 使用 `electron-window-state` 负责状态文件读写、移动和缩放事件合并，以及显示器范围检查。主进程只负责初始化状态管理器、把边界传给 `BrowserWindow`，并在窗口创建后交由状态管理器托管。

**Tech Stack:** Electron 43、TypeScript、tsdown、electron-window-state、pnpm

---

## Chunk 1: 依赖与主窗口接入

### Task 1: 接入窗口状态管理

**Files:**
- Modify: `app/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `app/desktop/src/main.ts`

- [ ] **Step 1: 安装运行时依赖**

Run: `cd app && pnpm --filter @trade/desktop add electron-window-state@5.0.3`

Expected: `app/desktop/package.json` 和 `pnpm-lock.yaml` 只增加该库及其传递依赖。

- [ ] **Step 2: 在创建主窗口前读取状态**

在 `app/desktop/src/main.ts` 导入 `electron-window-state`，并在 `createWindow()` 开头初始化：

```ts
const windowState = windowStateKeeper({
  defaultWidth: 1440,
  defaultHeight: 900,
  maximize: false,
  fullScreen: false,
});
```

- [ ] **Step 3: 将保存的边界传给 BrowserWindow**

为主窗口构造参数加入：

```ts
x: windowState.x,
y: windowState.y,
width: windowState.width,
height: windowState.height,
```

保留现有 `minWidth`、`minHeight`、标题栏、背景色和延迟显示配置。

- [ ] **Step 4: 托管主窗口**

窗口创建后调用：

```ts
windowState.manage(win);
```

这必须只用于正常的主窗口，不接入启动错误窗口。

## Chunk 2: 验证

### Task 2: 静态与构建验证

**Files:**
- Verify: `app/desktop/src/main.ts`
- Verify: `app/desktop/package.json`
- Verify: `pnpm-lock.yaml`

- [ ] **Step 1: 检查格式与类型**

Run: `cd app && pnpm exec prettier --check desktop/src/main.ts desktop/package.json ../pnpm-lock.yaml`

Expected: 所有目标文件格式正确。

Run: `cd app && pnpm --filter @trade/desktop typecheck`

Expected: TypeScript 类型检查通过。

- [ ] **Step 2: 运行桌面包测试**

Run: `cd app && pnpm --filter @trade/desktop test`

Expected: 桌面包现有测试全部通过。

- [ ] **Step 3: 构建主进程**

Run: `cd app && pnpm --filter @trade/desktop build`

Expected: tsdown 成功生成 `dist-main/main.mjs`，`electron-window-state` 及其纯 JavaScript 依赖被打入产物。

- [ ] **Step 4: 手工验证启动恢复**

Run: `cd app && pnpm dev:desktop`

验证：调整普通窗口尺寸和位置，关闭并重新启动后恢复；从最大化或全屏状态关闭后，重新启动仍为普通窗口状态。
