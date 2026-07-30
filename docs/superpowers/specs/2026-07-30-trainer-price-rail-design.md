# 盲盘训练价格拉杆改造设计（对齐 TradingView）

日期：2026-07-30
状态：已确认

## 背景

训练器图上的入场 / 止损 / 目标三条线由 `apps/web/src/features/training/TrainerOrderLevels.tsx` 渲染，是一层 DOM overlay：`.trainer-level` 绝对定位到价格对应的 y，内含一条虚线和一个右对齐的 pill。

现状的几个问题：

- **只有 pill 能拖**。`.trainer-level` 是 `pointer-events: none`，`.trainer-level-pill` 才是 `auto`。线本身不是热区，手要精确移到右侧那个小药丸上才抓得住。
- **入场 pill 塞了十样东西**：grip、badge、SL/TP 拖出钮、价格、分隔、R 值/成交状态、分隔、「进场」标签、三个仓位钮、关闭钮，一字排开横压在 K 线上。
- **没有区域感**。三条孤立的线，风险和回报谁大要靠读数字算，判断成本高。
- **避让太粗暴**。三条价格挨得近时（`PILL_MIN_GAP_PX = 26`）pill 逐级往左退 `LANE_STEP_PX = 200`，直接退到图中间去挡行情。

同时项目里已经有一块 TradingView 式的东西没被训练器用上：`apps/web/src/features/charts/intraday/positionBoxPrimitive.ts`，用 lightweight-charts 的 series primitive 在 canvas 上画三段盈亏区块（entry↔stop 红、entry↔T1 浅绿、T1↔T2 深绿），带变暗态和「已止损」标签——但它只服务短线预测图的**只读**展示。

本次改造的目标是把这两条路合并：可拖的线，拖到哪儿区块跟到哪儿。

## 已确认的四个取舍

1. **架构走「区域下沉 canvas，线和标签留 DOM」**。不把线和按钮也画进 canvas——那要自己实现命中测试、hover 态、键盘可达性，`aria-label` 全部作废，工作量数倍，换来的只是一帧对齐。TradingView 自己也是这个分法：区域是 canvas，订单标签是 DOM。
2. **仓位按钮留在标签上，但收起，hover 才展开**。不搬到底栏——现有注释写明「一个地方下单，不要两个地方要同步」，搬走等于推翻这个决定并多一次视线转移。收起拿到了干净观感，也保住了一处下单。
3. **保留「确认调整」两步**。TradingView 是松手即生效，但训练器是练纪律的工具，改止损前的那一次停顿本身就是训练内容。顺手拖一下和停下来想清楚为什么要改，是两种不同的练习。
4. **命中带覆盖整条线的全宽**，接受它吃掉那三条横带上的图表平移手势。这正是 TradingView 的行为（按在订单线上是拖线，平移得找没线的地方按），且三条 9px 的带子在几百像素高的图上占比很小。

## 一、canvas 层：区域填充

新增 `apps/web/src/features/charts/intraday/orderZonePrimitive.ts`。

**不复用 `positionBoxPrimitive`**，因为形状和生命周期都不对：它画三块而训练器只有一个 target；它的横向范围是固定的 `startTime → endTime`（一笔已完成的交易）而训练器要跟着光标走；它是只读快照而训练器要在拖动中每帧重画。往里加开关会让一个只读组件同时背两种生命周期。

骨架照抄它：`IPrimitivePaneView` / `IPrimitivePaneRenderer` / `ISeriesPrimitive` 三件套、`hexToRgb` + alpha 常量那套配色、以及用 `chart.paneSize().width` 而不是 `timeScale().width()`（后者在隐藏时间轴的图上返回 0，整个盒子会塌掉）。

### 数据

```ts
export interface OrderZoneData {
  startTime: number;        // 横向起点，见下
  entry: number;
  stop: number;
  target: number | null;    // 还没拖出 TP 时为 null，绿区不画
  filled: boolean;          // 已成交 / 还是草稿
  rewardR: number | null;   // 绿区中央写的 R；target 为 null 时同为 null
  belowFloor: boolean;      // 盈亏比不到 1.5
}
```

红区的文字恒为 `-1R`（风险单位的定义就是它），所以不进数据结构，由 renderer 直接写死。

### 画什么

最多两块，横向都铺到画布右边缘（`paneSize().width`）：

- `entry ↔ stop` 用 `theme.down`，只要有 entry 和 stop 就画
- `entry ↔ target` 用 `theme.up`，`target` 为 `null` 时整块不画——SL 先拖出来、TP 还没拖的中间状态下，图上只有红区，这本身就是「这单还缺一半」的提示

**横向起点分两种**：

- 草稿（`filled: false`）：从回放光标那根 K 线起，也就是当前可见的最后一根。未来还没发生，区域回答的是「如果按这个计划进场，赢面和输面各占多大」
- 已成交（`filled: true`）：从建仓那根 K 线起。这样能直接看出持仓这段里价格在红区绿区之间怎么走的

**块中央写 R 值**：绿区 `+2.3R`、红区 `-1R`，拖动时实时变。这是把盈亏比从底栏搬到眼睛正在看的地方——现在要判断这单值不值，视线得在图和底栏之间来回跑。R 值搬走后标签收起态就只剩一个价格。

**两种状态的视觉区别**沿用现有语汇：草稿是淡填充 + 虚线边（对应现在 `.trainer-level-line` 的 `border-top: dashed`），成交后加深 + 实线边（对应 `.trainer-level--filled`）。

**`belowFloor` 时绿区转灰色斜纹，R 值标红**。不阻止拖动——先放着看看也是判断的一部分，真正的拦截在提交那一刻（`meetsRewardRiskFloor` 现在也只挡提交）。

`zOrder` 取 `'bottom'`，压在 K 线底下，不挡蜡烛。

### 接线

新增 `apps/web/src/features/training/useOrderZone.ts`：拿 `DrawingChartHandle` 和一份 `OrderZoneData | null`，挂载时 attach primitive、数据变化时 `setData`、卸载时 detach。

区域块只是现有 draft 的第四个消费者，从同一份数据派生，不引入第二条状态通路——`onDrag(kind, price)` 已经把价格推给上层，标签、底栏、校验、区域块四者读的是同一个源。

## 二、DOM 层：命中带与标签两态

### 命中带

`.trainer-level` 下新增 `.trainer-level-hit`：线上下各 4px、共 9px、横跨全宽、`pointer-events: auto`、`cursor: ns-resize`，和 pill 共用同一个 `startDrag(kind)`——同一个手势必须走同一条价格回调，否则两条路可能舍入不同。

### 标签两态

- **收起**：`⇅ 148.20`，约 70px 宽，只有 grip 和价格，颜色仍按 kind 分（target `--up` / entry `#4a8cff` / stop `--down`）
- **展开**：现在那一整排（badge、SL/TP 拖出钮、价格、R 值/成交状态、进场按钮组、关闭钮），以及改单待确认时的 `旧价 → 新价 [确认调整][撤销]`

**触发条件是 `hovered || dragging`，用 React state 而不是 CSS `:hover`**。拖动时鼠标早就离开标签跑到画布上去了，纯 CSS 会在拖到一半时把标签收起来。

**展开方向从右往左**：标签右边缘钉死在现有的 `margin-right: 70px` 处，向左生长。这样展开的瞬间价格数字不横向位移——否则每次 hover 数字都跳一下，读价格会很难受。

### 避让

`LANE_STEP_PX` 从 200 降到 80（一个收起标签的宽度加间隙）。收起后只有 70px 宽，三条线挤在一起也未必重叠，退让幅度不需要那么大。`PILL_MIN_GAP_PX = 26` 不变。

展开的那一个抬 `z-index` 盖在邻居上面，而不是把邻居推走——推走会让三个标签在 hover 时集体位移。

## 三、拖动行为

### 跟手更新的三样

标签里的价格、canvas 区域块的形状、块中央的 R 值，同一帧内一起变。

### 价格轴跟随标签

用 lightweight-charts 原生的 `createPriceLine`（`apps/web/src/features/charts/lw.ts` 已封装为 `addPriceLine`），只在拖动期间存在，`pointerup` 时 remove。用原生的而不是自己在 DOM 里画，是为了让它和价格轴上其它标签样式天然一致——那本来就是 TradingView 的库。

### 穿越 entry 的钳制（新行为）

做多时止损不得越过入场线上方，目标不得越过下方；做空反之。现在的代码允许拖过去，再靠 `entryHint` 的 `stale` 分支提示纠正。区域块一旦允许翻转会画出自己包住自己的怪形状，所以改成拖动时钳制：止损最多贴到入场价下方一个最小报价单位，拖不过去，手上就知道那是墙。

### 被引擎拒绝的改单

`useAmendCheck` 干跑 `validateAmend` 的结果直接染在线上——线变红，标签里写明拒绝理由，「确认调整」置灰。这是现在就有的行为，原样保留，只是从 pill 里的一行小字升级成整条线的状态。

### 性能

`pointermove` 在 120Hz 屏上一秒来一百多次，每次都会 setState → 重渲染 → primitive `setData` → 整图 `requestUpdate`。现有实现已经是每次 move 都 setState，所以不是新增负担，但多了一层 canvas 重绘。先直接做；如果拖动掉帧，用 `requestAnimationFrame` 把一帧内的多次 move 合并成一次。这个优化留到量出问题再加，不预先写进去。

## 测试

- `orderZonePrimitive.test.ts`——几何计算，照 `positionBoxPrimitive.test.ts` 的路子测纯坐标换算：草稿 / 成交两种横向起点、`target` 为 `null` 时只画红区、`belowFloor` 的样式切换、区块高度随价格变化
- 标签收起 / 展开两态的渲染：收起时只有价格、展开时仓位按钮可点、`dragging` 期间即使鼠标移开也保持展开
- 命中带能触发拖动，且与 pill 走同一条价格回调
- 钳制边界：做多把止损拖到入场价上方，落点被钳在入场价下方一个 tick

## 不做的事

- 不把线和按钮画进 canvas（见取舍 1）
- 不去掉「确认调整」（见取舍 3）
- 不动 `TrainerEntryLane` 底栏的方向按钮和备注框——它们不在这次范围内
- 不预先加 rAF 节流（见性能一节）
- 不做多组订单并存：训练器一局只有一组线，TradingView 收起标签是因为图上可能挂十几个订单，这个动机在这里不存在，收起是为了观感而不是为了容纳数量
