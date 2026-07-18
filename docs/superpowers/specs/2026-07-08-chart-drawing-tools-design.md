# intraday 图表标注工具设计

日期：2026-07-08
状态：已确认

## 目标

给 chart web app 的 intraday 仪表盘（TradingView Lightweight Charts v4，单块 K 线主图 + 5m/15m/1h 周期切换）增加手动标注工具，对齐 TradingView 的基础画图体验：

- 测量工具（价差、涨跌 %、K 线根数、时间跨度）
- 趋势线
- 水平线 / 价格线
- 矩形区域
- 斐波那契回调

范围只限 intraday 仪表盘，sepa 页不做。

## 选型结论

自研 drawing primitive（方案 A）。理由：

- Lightweight Charts 开源版不带画图工具，只提供 primitive 插件 API；官方 plugin-examples 里的 trend line / rectangle / delta tooltip 只是参考实现，交互简陋。
- TradingView Advanced Charts（闭源）带完整画图工具，但需申请授权，且是黑盒 iframe 组件，会推翻现有"服务端算指标、前端 primitive 渲染"的架构（session 背景、FVG、锚点区等自定义画层全部重做）。
- 仓库已有三个自定义 primitive（`sessionPrimitive` / `fvgPrimitive` / `anchorPrimitive`），路径已验证，标注工具沿用同一模式。

## 数据模型与存储

每个股票一份标注文件：`journal/charts/annotations/{SYMBOL}.json`。

标注用真实时间戳 + 价格两个绝对坐标存，与周期无关——切 5m/15m/1h 只是重新换算屏幕坐标：

```ts
type AnnotationKind = "trendline" | "hline" | "rect" | "fib";

interface AnnotationPoint {
  time: number;   // Unix 秒
  price: number;
}

interface Annotation {
  id: string;
  kind: AnnotationKind;
  points: AnnotationPoint[];   // hline 存 1 个点（只用 price），其余存 2 个点
  createdAt: number;
}
```

测量工具是临时的：点别处、按 Esc 或切换工具即消失，不进数据模型、不落盘。

## 服务端

新增路由文件 `apps/server/src/routes/annotations.ts`：

- `GET /api/annotations/:symbol` → `{ok: true, data: Annotation[]}`；文件不存在返回空数组。
- `PUT /api/annotations/:symbol` → 请求体为完整 `Annotation[]`，整份替换写回文件。

不做增量合并、不做多设备冲突处理——单人使用，整存整取，前端防抖（改动停 1 秒后）保存。

## 前端结构

三个新文件，放 `apps/web/src/charts/drawings/`：

### `drawingsPrimitive.ts`

沿用 `FvgPrimitive` 的模式挂在 K 线 series 上，负责渲染：

- 已保存的全部标注
- 绘制中的实时预览
- 选中标注的端点手柄

坐标换算：时间 → K 线序号（logical index）再外推。原因：`timeToCoordinate` 对数据范围之外的时间返回 null，趋势线要能延伸到最新 K 线右侧的空白区，必须基于序号线性外推。primitive 自己持有标注数据，60 秒实时重建 series 数据不影响标注。

### `useDrawings.ts`

状态机：`idle`（光标模式）/ `drawing`（绘制中）/ `dragging`（拖动中）。职责：

- 指针事件（在图表容器上监听 pointerdown / pointermove / pointerup）
- 命中检测：点击落在线身 6px 内算选中；纯函数实现，可单测
- 键盘：Delete 删除选中标注，Esc 取消绘制并回到光标模式
- 按 symbol 加载标注（GET），防抖保存（PUT）
- 绘制工具激活时通过 `chart.applyOptions({handleScroll: false, handleScale: false})` 临时关掉图表自身的拖动平移，画完或取消后恢复

### `DrawingToolbar.tsx`

图表左侧一列窄工具栏，从上到下：光标、测量、趋势线、水平线、矩形、斐波那契、清空全部。当前工具高亮。

## 交互细节

- **两点工具（趋势线 / 矩形 / 斐波那契 / 测量）**：点第一下定起点，移动实时预览，点第二下完成。画完自动切回光标模式（对齐 TradingView 默认行为）。
- **水平线**：点一下即放置，右侧价格轴显示价格标签。
- **测量**：完成后在框旁浮层显示价差、涨跌 %、K 线根数、时间跨度；点别处 / Esc / 切工具即消失。
- **编辑**（光标模式）：点选标注显示端点手柄，拖手柄改形状，拖线身整体平移，Delete 删除。
- **斐波那契**：两点定 0 和 1，渲染 0 / 0.236 / 0.382 / 0.5 / 0.618 / 0.786 / 1 七条水平层级线，右端标比例与对应价格。层级计算为纯函数，可单测。
- **跨周期**：同一 symbol 的标注在 5m/15m/1h 三个周期都渲染（绝对坐标换算）。标注时间早于当前周期数据起点时落在屏幕外，属正常。
- 每种工具一个固定主题色（取自 `theme.ts`），不提供自定义。

## 本版不做（YAGNI）

- 颜色 / 线宽 / 线型自定义
- 撤销 / 重做
- sepa 页标注
- 多设备 / 并发写冲突处理
- 磁吸（吸附到 K 线高低点）
- 更多线型（射线、通道、文字标注等）

## 测试

- 服务端：`annotations` 路由 GET（空 / 有数据）与 PUT 往返各一条测试。
- 前端：命中检测、斐波那契层级计算、时间→序号外推换算拆成纯函数单测。
