# 桌面 titlebar 视觉重做（方向 B · Buffer 列表）

日期：2026-07-12
范围：`app/web/src/styles.css`、`app/web/src/desktop/DesktopTitlebar.tsx`（仅桌面 Electron 模式的视觉；web/浏览器模式不受影响）

## 背景

`2026-07-11-desktop-inset-titlebar-and-tabs-design.md` 第 4 节定的 tab 视觉是「扁平 VS-Code 风 tab + 活动态底部琥珀下划线 + 略亮背景」。这套形态落地后偏笨重、像旧浏览器标签页，跟整个 app 的暗色终端基调（`--bg-canvas` 画布、`--radius: 2px` 直角、`--fs-sm` 小字号、`--accent` 琥珀点睛）不够贴。

本次只重做 **titlebar 左侧 tab 区的视觉形态**，换成「Buffer 列表」语言。数据模型、路由、持久化、快捷键、桌面检测、右侧动作区、交通灯占位全部不动。

## 目标

- tab 区改为「无框文字列表」形态：零边框、零卡片背景，纯文字横排，靠间距 + 细竖分隔线切分。
- 守住现有终端基调（直角、小字号、琥珀只在活动态点睛），不引入圆角胶囊、不引入大面积色块。
- 交互态清晰：活动 / 悬停 / 普通三态一眼可分，关闭叉按需出现。
- 保留每个 tab 的类型图标（首页 / 走势 / 设置），暗色下图标 + 文字双重区分。

## 非目标

- 不动 `2026-07-11` spec 已实现的一切逻辑：`tabsStore` / `tabsController` / 路由 store 切换 / localStorage 持久化 / `⌘T`·`⌘W`·切换快捷键 / IPC 命令通道 / `isDesktopRealtime()` 分支。
- 不动右侧动作区（`.global-new-chart`「新建图表」+ `.global-settings-link` 设置齿轮）。
- 不动交通灯占位 `.desktop-titlebar-traffic-spacer`、titlebar 高度（40px）、拖拽区（`-webkit-app-region`）。
- 不动 web/浏览器模式（`GlobalTopbar` + 单路由 `Router`）。
- 不改 `DesktopTitlebar.tsx` 的组件接口、props、事件回调；改动仅限 DOM 结构微调 + className。

## 视觉规格

高度 40px、`--bg-surface` 底、下缘 1px `--border`，均沿用。以下为 tab 区（`.desktop-tabstrip` 内）新规格：

### 单个 tab（`.desktop-tab`）
- 布局：`inline-flex`，`gap: 7px`，横向内边距 14px，撑满 40px 高。
- 弹性宽度：`flex: 0 1 190px`，`min-width` 约 90px；标题 `.desktop-tab-title` 溢出省略号。
- 图标 `.desktop-tab-icon` 12px，`flex: 0 0 auto`。
- 三态：
  - **普通**：文字 + 图标 `--text-muted`，图标 `opacity .65`，无背景。
  - **悬停**：文字 `--text-secondary`，背景一层极淡提示（介于 surface 与 element 之间，约 `#1c1c1c`），关闭叉淡出到 `opacity .6`。
  - **活动**（`.desktop-tab--active`）：文字 + 图标 `--accent`，图标 `opacity 1`；**无背景色块**；左缘一条 3px × 14px 的琥珀竖标（`::before`，`border-radius: 0 2px 2px 0`，垂直居中）。
- 过渡：`color` / `background` / `opacity` 0.12s。

### 分隔线
- 每个 `.desktop-tab` 右缘 `::after` 画 1px × 15px 竖线（`--border`，垂直居中，非贯穿全高）。
- 隐藏规则：活动 tab 自身 `::after`、活动 tab 右邻 tab 的 `::after`、最后一个 tab 的 `::after` 均隐藏（活动项两侧与 tab/加号交界处不画线）。

### 关闭叉（`.desktop-tab-close`）
- 15px 方形、`--radius` 圆角、图标 11px。
- 默认 `opacity: 0`；tab 悬停或活动时淡出到 `.6`；叉自身悬停 `opacity 1` + 文字 `--text-primary` + 深一档背景（约 `#2a2a2a`）。

### 新建 tab（`.desktop-tab-new`）
- 跟在最后一个 tab 右侧，`--text-muted`，悬停 `--text-primary` + 极淡背景，无边框。尺寸沿用现值。

### 溢出
- `.desktop-tabstrip` 横向滚动 + 左右边缘 10px 渐隐遮罩（沿用现有 `mask-image`）。

## 涉及改动

- **`app/web/src/styles.css`**：重写 `.desktop-tab*` 相关规则段（去掉活动态底部下划线 + canvas 背景块，改为左竖标 + 三态色规则、分隔线的兄弟选择器隐藏逻辑、悬停淡背景）。仅涉及该段，其余样式不动。
- **`app/web/src/desktop/DesktopTitlebar.tsx`**：DOM 结构基本不变（图标 / 标题 / 关闭叉已在）。分隔线用纯 CSS `::after` + 兄弟选择器实现，**无需**在 markup 里插入分隔元素。若现有 className 已够用则本文件可零改动；如需为兄弟选择器命中而微调结构，改动限于 className / 元素嵌套，不碰逻辑与回调。

## 测试

- 无逻辑变化，无新增单元测试。既有 `tabsStore` / `router` 测试保持通过（不受视觉改动影响）。
- 视觉验证：`pnpm dev:desktop` 起桌面壳，肉眼核对活动 / 悬停 / 普通三态、长标题省略、多 tab 横向滚动、关闭叉行为，与本 spec 精修稿一致。
