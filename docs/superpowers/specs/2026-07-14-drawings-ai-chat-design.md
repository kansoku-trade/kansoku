# 绘图工具扩展 + AI Chat 双向联动 设计

日期：2026-07-14（美股交易日）
状态：已与用户确认方向，待实现

## 背景与目标

当前 intraday 图表（`apps/web/src/charts/drawings/`）有 6 个绘图工具（选择、测量、趋势线、水平线、矩形、斐波那契），样式固定、画一条就退回选择状态。AI Chat（`packages/core/src/ai/chat.ts`）只能读行情数据，完全看不到用户画的线，也不能在图上画任何东西。

本设计做三件事：

1. 绘图工具扩展：样式编辑 + 连续绘制。
2. AI 读线：聊天 agent 能看到当前图上所有画线，结合它们回答。
3. AI 画线：聊天 agent 分析后直接把关键价位/形态画到图上（专属样式、可撤销），通过新增的 annotations 实时通道即时出现在打开的页面上。

已确认的取舍：

- 联动方向：双向（读 + 写）。
- AI 画线方式：直接画、可撤销，不走「提议 → 采纳」流程。
- 实时方案：新增 annotations WebSocket 通道（方案 A），不借用聊天事件流。理由：AI 画的线和手画的线走同一条持久化路径；其他 AI 子系统（analyst 等）以后也能复用；顺带修复双窗口画线不同步。

## 一、数据模型

`packages/shared/types.ts` 的 `Annotation` 增加三个可选字段，老 JSON 文件无需迁移：

```ts
interface Annotation {
  id: string;
  kind: AnnotationKind;
  points: AnnotationPoint[];
  createdAt: number;
  source?: 'user' | 'ai'; // 缺省按 "user" 处理
  label?: string; // 一句话说明，悬停显示，≤120 字
  style?: AnnotationStyle;
}

interface AnnotationStyle {
  color?: string; // 只接受预设色板内的值
  width?: 1 | 2 | 3;
  dash?: boolean;
}
```

- 预设色板（6–8 色）定义在 `packages/shared/drawings.ts`，客户端样式面板和服务端校验共用同一份。
- `annotations.service.ts` 校验收紧：`label` 限长 120 字；`style.color` 必须在色板白名单内；`source` 只允许 `"user" | "ai"`；点数校验规则不变。
- 渲染优先用 `style`，缺省落回现有按 kind 的主题色（`drawingsRender.ts` 的 `KIND_COLORS`）。

## 二、annotations 实时通道

- `packages/core/src/realtime/channelProtocol.ts` 新增 `annotations` 通道，按代号订阅（现有通道：quotes/chart/comments/analyses/position/benchmark/board/chat/preview）。
- 服务端 `annotationsService.replace` 成功落盘后，向该代号的订阅者广播全量 `Annotation[]`（画线数据量小，全量最简单，与现有 PUT 全量覆盖语义一致）。
- 回声处理：
  - PUT 请求体增加可选 `clientId`（页面随机生成、会话内不变），广播帧原样带回。
  - 页面收到广播：`clientId` 是自己 → 忽略；正在拖动/绘制中 → 挂起，操作结束后应用；否则直接替换本地数组。
- `useDrawings.ts` 挂载/切换代号时通过 `wsHub` 订阅，卸载时退订。

## 三、工具条扩展

### 样式编辑

- 选中一条线后，工具条旁浮出小面板：预设色板、实线/虚线切换、三档粗细。
- 修改实时写入该条线的 `style`，走现有 1s 防抖保存。

### 连续绘制

- 画完一条线后当前工具保持激活，可连续画下一条。
- 按 Esc 或点「选择」退出，回到 cursor。
- 对趋势线、水平线、矩形、斐波那契统一生效；测量工具行为不变（本就是临时覆盖层）。

### AI 线的呈现

- `source: "ai"` 且自身无 `style` 的线，用专属默认样式（紫色虚线）与手画线区分。
- 悬停显示 `label`（tooltip）。
- 清空按钮拆成两个：「清除全部」「只清 AI 画的」，均保留现有 3 秒二次确认。

## 四、AI Chat 接入

`chat.ts` / `dataTools.ts` 新增两个工具，均限定在当前图表的代号内：

### `read_drawings`

- 返回该代号全部画线：kind、各点的时间与价格（时间转成可读格式）、label、source、createdAt。
- 用户问「我画的这条线还有效吗」这类问题时，agent 先读线再结合行情回答；涉及方向性判断仍走现有核验闸门（`verify_directional_read` / `submit_chat_answer`，TD-VERIFY-01）。

### `draw_annotations`

- 入参：`{ annotations: Array<{ kind, points, label, style? }> }`，`label` 必填。
- 服务端强制 `source: "ai"`、生成 id 与 createdAt，校验后**合并**进现有数组（只追加，绝不改动或删除已有条目），落盘并广播。
- 工具说明里写明：`label` 用中文白话（TD-LANG-02），坐标用时间 + 价格。

### 提示词守则（`prompts.ts` 追加）

- 只在分析出关键价位/形态时画，单次不超过 4 条。
- 画之前先 `read_drawings`，不重复画已有的线。
- 不修改、不删除用户画的线；AI 只能新增自己的线。
- 画完在聊天回复里说明画了什么、为什么。

## 错误处理

- `draw_annotations` 校验失败 → 工具返回错误说明（哪条、哪个字段），agent 可修正重试；不部分写入。
- WS 断线重连后，`useDrawings` 重新拉一次 HTTP 全量，保证不丢中间更新。
- 广播与本地防抖保存竞争：以「挂起远端更新直到本地操作结束」为准，最后一次落盘的全量为最终状态。

## 测试

- core 单元测试：新字段校验（label 长度、色板白名单、source 枚举）；AI 合并逻辑（只追加、不动用户线、强制 source）。
- chat 工具测试：`draw_annotations` 请求 → 落盘 JSON 内容断言；`read_drawings` 输出格式。
- 现有几何/序列化测试（`drawings-geometry.test.ts`）不受影响。
- 全部通过 `pnpm test` 验证；前端交互（样式面板、连续绘制、实时出现）手工在 `pnpm dev` 下验证。

## 增补（2026-07-14 第二轮，用户确认）

### 多段趋势线（polyline）

- `AnnotationKind` 新增 `"polyline"`：点数 2–20，相邻点依次连成折线段。
- 绘制交互：点一下放第一个点，之后每点一下接一段，虚线预览跟随光标；**双击放下最后一个点并结束**；Esc 随时收尾（已有 ≥2 个点则保留成形，否则取消）。结束后工具保持激活（连续绘制约定不变）。
- 双击不得产生重复的收尾点（双击的第一击已放点，第二击只负责结束）。
- 命中检测 = 逐段线段距离；拖动整体平移；每个点都有手柄可单独拖。
- 样式、实时同步、AI 读写对 polyline 一视同仁（同一个 `Annotation` 数组，无新管道）。

### 箭头开关

- `AnnotationStyle` 新增 `arrow?: boolean`。
- 仅对 `trendline` 和 `polyline` 生效：开启时在最后一个点画箭头头部指示方向；样式面板只在这两种图形选中时显示箭头开关。默认关，存量线不受影响。
- AI 的 `draw_annotations` 同步支持 polyline 类型与 arrow 样式。

### 画笔预设与状态记忆（2026-07-14 第三轮，用户实测反馈后修正）

- **画笔预设**：样式面板不再只服务于「已选中的线」——选中绘图工具（趋势线/多段线/水平线/矩形/斐波那契）且没有选中任何线时，面板编辑的是「接下来要画的线」的预设样式（颜色/粗细/虚线/箭头），新画的线自动带上预设。有选中时行为不变（编辑选中那条）。
- **状态记忆**：工具选择和画笔预设按代号记忆在页面会话内。之前存在一个问题：最新图表文档 id 变化（如盘前 AI 调度器新建图表）会让仪表盘整体重挂载，绘图工具被重置回「选择」，体感是「画着画着工具自己弹回去」。现在重挂载后自动恢复上次的工具和预设。刷新页面仍会回到初始状态。

## 不做的事（本期范围外）

- 文字标注、平行通道等新图形（箭头已按上文以样式开关实现）。
- 磁吸对齐（吸附到 K 线高低点）。
- AI 修改/删除任何已有画线。
- 「提议 → 采纳」式的确认流程。
- analyst / deepDive 等其他 agent 的画线接入（通道与服务已就绪，后续加工具即可）。
