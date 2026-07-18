# 全局入口重排（研究库 / AI 对话 / 设置）设计

日期：2026-07-15
状态：已确认

## 背景

Web 端右上角有一个固定悬浮栏（`apps/web/src/App.tsx` 中的 `GlobalTopbar`），包含三个链接：研究库（`/research?view=journal`）、AI 对话（`/chat`）、设置（`/settings`）。它悬浮在所有页面之上，个股页的 detail-topbar 还要靠 `--web-global-topbar-safe-area` 给它让位。桌面端（Electron）的自绘标题栏 `DesktopTitlebar` 右侧另有 研究库、设置 两个按钮，且缺少 AI 对话入口。

用户决定：右上角的三个全局入口全部挪走，两端各按平台惯例重新安置。

## 范围

- 只处理 研究库 / AI 对话 / 设置 三个入口的放置。
- AI Chat 从全屏 `/chat` 页改回右侧栏是后续单独的设计，本次入口仍指向现有 `/chat` 页。
- 个股页的「日K」等周期切换按钮不动。

## 方案

### 1. 删除 Web 全局悬浮栏

- 删除 `App.tsx` 中的 `GlobalTopbar` 组件及其渲染。
- 删除 `.global-topbar` 相关样式和 `--web-global-topbar-safe-area` 变量，个股页 detail-topbar 不再预留右上角空隙。
- 设置页 / 日志页原有的「隐藏全局栏」判断一并删除。

### 2. Electron 标题栏只留系统件

- 删除 `DesktopTitlebar` 右侧的 研究库、设置 按钮；保留标签条、红绿灯留白和更新提示徽章。
- 原生菜单补上「AI 对话」菜单项（当前缺失），打开或聚焦 `/chat` 标签页。
- 快捷键：设置 `⌘,`（已有）、AI 对话 `⌘L`、研究库 `⌘⇧L`。实现时核对现有菜单加速键，冲突则调整。

### 3. 命令面板开放给 Web（`⌘K`）

- `CommandPalette` 目前只在 `DesktopShell` 渲染，命令绑定 `tabsController`（标签页语义）。
- 把命令定义抽象出「导航器」接口：桌面端实现走标签页（`focusOrOpenResearch` 等），Web 端实现走 `router.ts` 的 `navigate()`。
- Web 端在根布局渲染命令面板，绑定 `⌘K`；命令至少覆盖 首页 / 研究库 / AI 对话 / 设置 / 日志，桌面端已有命令中不依赖标签页的部分也一并可用。

### 4. 首页 QuickBar 追加三项

- 首页现有 QuickBar 追加 研究库 / AI 对话 / 设置 三个入口，两端共享，作为不依赖快捷键的显式通道。

## 改造后各入口的可达路径

| 入口    | Web               | Electron                |
| ------- | ----------------- | ----------------------- |
| 研究库  | 首页 QuickBar、⌘K | 菜单、⌘⇧L、⌘K、QuickBar |
| AI 对话 | 首页 QuickBar、⌘K | 菜单、⌘L、⌘K、QuickBar  |
| 设置    | 首页 QuickBar、⌘K | 菜单、⌘,、⌘K、QuickBar  |

## 涉及文件（定位参考）

- `apps/web/src/App.tsx` — `GlobalTopbar` 删除
- `apps/web/src/styles.css` — `.global-topbar`、`--web-global-topbar-safe-area` 清理
- `apps/web/src/desktop/DesktopTitlebar.tsx` — 右侧按钮删除
- `apps/web/src/palette/` — 命令定义抽象导航器，Web 端接入
- `apps/web/src/pages/Home.tsx`（QuickBar）— 追加三项
- `apps/desktop/src/menu/` — 菜单项与快捷键
