# 圆角 token 规范化 + chat 组件圆角改造

日期：2026-07-16
状态：已确认

## 背景

桌面端窗口是圆角的，而右侧栏底部的 AI 追问输入条（`.chat-dock`）贴在窗口右下角、全是直角，直角撞圆角很突兀。顺带发现样式表里散落着大量硬编码圆角值（5/6/7/8/999px），没有走 design token。本次一并规范。

## 目标

1. 建立圆角 token 体系，消灭 `apps/web/src/styles.css` 里的硬编码圆角。
2. chat dock 输入区改造：input 无边框、send button 大圆角贴合窗口边缘。
3. chat 浮动面板整体改圆角，内部元素跟随。

## 设计

### 1. 圆角 token（`styles.css` 的 `:root`）

```css
--radius:      2px;    /* 现有，不动 —— 全局默认直角语言 */
--radius-md:   6px;    /* 新增 */
--radius-lg:   10px;   /* 新增 —— 与 macOS 窗口边缘圆角一致 */
--radius-full: 999px;  /* 新增 —— 胶囊 */
```

### 2. 存量硬编码归并（纯替换，不改布局尺寸）

| 现值 | 归并到 | 涉及元素 |
|---|---|---|
| `5px` `6px` `7px` | `var(--radius-md)` | `.desktop-tab`、`.desktop-tab--active .desktop-tab-icon-wrap`、`.desktop-tab-new-visual`、`.palette-option`、`.onboarding-logo`、`.research-title-icon` |
| `8px` | `var(--radius-lg)` | `.modal-panel`、命令面板容器（约 721/744 行两处）、`.settings-device-code`、`.logs-viewer` |
| `999px` | `var(--radius-full)` | 全部胶囊徽章（约 6 处：`.chat-typing-dot` 容器、tool 计数、onboarding-rec-tag 等） |

**白名单（不动）**：`50%`（正圆语义）、`1px`（热力图小方块）、`typeset.css`（em 基准的独立排版体系）、`border-radius: 0`（显式清零）。

接受的视觉变化：5px→6px、7px→6px、8px→10px，均为 1–2px 级别，肉眼几乎无感。

### 3. chat dock（侧栏底部输入条）

- **input 无边框**：仅 dock 模式下，`ChatComposer` 里的输入框去掉边框、背景透明，靠 `.chat-dock` 已有的 `border-top` 分隔线界定区域。作用域用 `.chat-dock` 后代选择器实现，不改 `ChatComposer` 组件接口。
- **send button**：正圆（`var(--radius-full)`），composer padding 收紧为 `6px 6px 6px 12px`。依据同心圆角规则：实测窗口圆角约 20px，按钮距窗口边缘 6px，理想内圆角 = 20 − 6 = 14px，恰为按钮高度（28px）之半，即正圆。
- 浮动面板（float）与全屏（full）模式下的同一 composer **保留边框**——用户明确选择"无边框"只施于 dock；但其圆角跟随第 4 节改为 `var(--radius-md)`。

### 4. chat 浮动面板（`.chat-shell--float`）

- 外框：`border-radius: var(--radius-lg)`。
- 全屏模式 `.chat-shell--full` 保持 `border-radius: 0` 不动。
- 内部元素统一 `var(--radius-md)`：
  - 用户消息气泡 `.chat-bubble--user`
  - 工具调用卡片
  - 建议问题按钮 `.chat-suggestion`
  - 面板内输入框及其 send button

层级惯例：内层半径（md 6px）小于外层半径（lg 10px）。

## 不做的事

- 不改 `--radius: 2px` 的全局直角语言，非 chat 区域的按钮/输入框维持直角。
- 不动 `typeset.css`。
- 不做 dock 悬浮卡片化（讨论过，用户选择保持贴边 + 局部圆角）。

## 验证

1. `pnpm dev:desktop` 起桌面端，肉眼核对：dock 右下角 send button、浮动面板外框与内部元素、modal、命令面板、桌面 tab。
2. `grep -n "border-radius" apps/web/src/styles.css` 确认除白名单外无硬编码数值。
3. 现有测试不受影响（纯 CSS 变更 + 可能的少量 className 调整）。
