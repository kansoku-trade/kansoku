# 盲牌训练绘图工具补齐 + 撤销/重做 设计

日期：2026-07-28
状态：已与用户对齐（范围 C：完全对齐主图表；撤销/重做只加训练侧）

## 背景

训练侧的绘图核心（几何、命中、渲染、指针交互）本来就复用 `features/charts/drawings/` 的共用层，但工具栏只露出了 4 个工具（选择、趋势线、水平线、矩形）。主图表有 7 个工具外加样式面板。本次把缺的三个工具（测量、多段线、斐波那契）和样式面板补进训练侧，并给训练侧的绘图加撤销/重做。

不变的前提：训练的线是本局临时的，不持久化、不进标注存储（匿名代号 + 打包体积的原因见 `useTrainerDrawings.ts` 顶部注释），一局一清。

## 改动清单

### 1. 抽出共用 StylePanel

- 新文件 `apps/web/src/features/charts/drawings/StylePanel.tsx`：把 `DrawingToolbar.tsx` 里的私有 `StylePanel` 原样移出并导出，props 增加可选 `className`（追加在根元素 `drawing-style-panel` 之后，训练侧用来改定位）。
- `DrawingToolbar.tsx` 改为 import，主图表行为零变化。

### 2. 扩展 `useTrainerDrawings`

`TrainerDrawingsApi` 新增：`selected`、`updateStyle(id, patch)`、`draftStyle`、`updateDraftStyle(patch)`、`undo()`、`redo()`、`canUndo`、`canRedo`。

- **选中态**：`selectedIdRef` 之外加 `selectedId` state，`setSelected` 两个都写（样式面板要跟着选中的线刷新）。
- **样式**：`draftStyleRef` 从冻结的空对象改为可变 ref + state；`updateDraftStyle` 合并 patch（交互层画新线时已经会读 `draftStyleRef`，不用动它）。`updateStyle` 按 id 合并 patch 后走 `commitAnnotations`。默认样式只活在本局内存，换局重置。
- **修测量**：`pushState` 照 `useDrawings.ts` 的写法补分支——画测量中把 `{p1, p2}` 当 measure 传给 primitive，其余时候传 `measureRef.current`（现在硬编码 `null`，测量永远不显示）。`applyTool` 补上 `keepMeasure: boolean` 参数：交互层量完会调 `applyTool('cursor', true)` 带着结果切回选择，`keepMeasure` 为 false 时清掉 `measureRef`。工具栏 `setTool` 也清 `measureRef`。

### 3. 撤销/重做（只在训练侧）

- **历史模型**：`useTrainerDrawings` 内存两个 ref——快照数组 `Annotation[][]` 和游标。初始为 `[[]]`、游标 0（第一步撤销回到空图）。每次落笔把新数组引用推进历史（落笔都是整数组替换，无拷贝成本），上限 100 步，超了丢最旧。游标不在末尾时落笔，截断后面的重做分支。
- **什么算一步**：画完一个形状、拖动/拉伸松手、Delete/Backspace 删除选中、改一次样式（点一下颜色/粗细/虚线/箭头各算一步）、清空全部。画到一半 Esc 取消不算。
- **挂点**：落笔只有两个口子，都在训练 hook 自己手里，共用交互层不改——
  1. `commitAnnotations`（画完、删除、清空、updateStyle）；
  2. 拖动松手时交互层调 `scheduleSave(next)`，训练侧现在传 noop，换成"推一步历史"。推历史前先比对：跟当前游标处是同一个数组引用就跳过（防重复）。
- **undo/redo**：游标移动后把快照写回 `annotationsRef` + state + `pushState`；快照里找不到当前选中 id 就取消选中。
- **快捷键**：`useTrainerDrawings` 挂 window keydown——Cmd/Ctrl+Z 撤销、Cmd/Ctrl+Shift+Z 重做，命中时 `preventDefault`；焦点在 input/textarea/contentEditable（下单面板、笔记）时不劫持。画图模式和下单模式都生效（只动画的线，无副作用）。
- **换局**：caseId 变化的现有重置块里同时重置历史。

### 4. `TrainerDrawingTools` 工具栏

- 工具组加 3 个按钮：测量、多段线、斐波那契，沿用现有内联 SVG path 图标风格（不引 lucide，保持 rail 一致）。
- 工具组后接分隔线，然后撤销/重做按钮（走到头 disabled），再分隔线，最后清除。
- 样式面板显隐与主图表一致：选中了线 → 显示该线样式；激活的工具不是 off/选择/测量 → 显示默认样式；其余（含下单模式）不显示。`showArrow` 同主图表：趋势线/多段线才有箭头开关。
- 面板经 `TrainerOverlayPortal` 的 `pinned` 槽渲染，类名 `trainer-style-panel`。

### 5. CSS（`styles.css`）

`.trainer-style-panel` 覆盖定位：贴在 rail 右侧（`left: 44px; top: 50%; transform: translateY(-50%)`），`pointer-events: auto`（overlay 根是 `pointer-events: none`）。

## 非目标

- 主图表的撤销/重做（多端同步会改写历史，需要单独设计冲突规则）。
- 训练绘图持久化、跨局保留。
- 新的绘图形状。

## 验证

1. 改动文件的 lint + 现有 drawings 测试（`useDrawings.test.ts`、`drawingsRender.test.ts` 不该受影响）。
2. `pnpm dev:desktop` 进一局盲牌训练实测：三个新工具各画一遍；测量结果在松手后仍显示、切工具消失；样式面板改颜色/粗细/虚线/箭头；撤销/重做走完整个链路（画→拖→删→清空→一路撤回→重做→中途落笔截断）；快捷键在下单输入框聚焦时不劫持；换局后线、历史、默认样式全清。
3. 主图表回归：工具栏和样式面板行为不变。
