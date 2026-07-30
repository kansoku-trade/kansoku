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
4. **命中带覆盖整条线的全宽**，接受它吃掉那三条横带上的图表平移手势。这正是 TradingView 的行为（按在订单线上是拖线，平移得找没线的地方按），且三条 9px 的带子在几百像素高的图上占比很小。这里让出去的只有 K 线面板自己的平移；右边的价格轴、左边的画笔工具栏都不在让步范围内，TradingView 的订单线同样停在面板边上。

## 一、canvas 层：区域填充

新增 `apps/web/src/features/charts/intraday/orderZonePrimitive.ts`。

**不复用 `positionBoxPrimitive`**，因为形状和生命周期都不对：它画三块而训练器只有一个 target；它的横向范围是固定的 `startTime → endTime`（一笔已完成的交易）而训练器要跟着光标走；它是只读快照而训练器要在拖动中每帧重画。往里加开关会让一个只读组件同时背两种生命周期。

骨架照抄它：`IPrimitivePaneView` / `IPrimitivePaneRenderer` / `ISeriesPrimitive` 三件套、`hexToRgb` + alpha 常量那套配色、以及用 `chart.paneSize().width` 而不是 `timeScale().width()`（后者在隐藏时间轴的图上返回 0，整个盒子会塌掉）。

### 数据

```ts
export interface OrderZoneData {
  startTime: number; // 横向起点，见下
  entry: number;
  stop: number;
  target: number | null; // 还没拖出 TP 时为 null，绿区不画
  filled: boolean; // 已成交 / 还是草稿
  rewardR: number | null; // 绿区中央写的 R；target 为 null 时同为 null
  riskR: number; // 止损那一块中央写的 R，可以为正，见下
  belowFloor: boolean; // 盈亏比不到 1.5
}
```

**`riskR` 是一个真实字段，不是恒等于 `-1` 的常量。** 设计初稿写的是「风险单位的定义就是止损那一段，所以红区恒写 `-1R`，不必进数据结构」——这句话只在止损还没被上移过时成立。持仓浮盈超过 1R 之后，止损被拖到成本价上方是允许的（TD-EXIT-01），这时那一块已经不是「会亏多少」而是「已经锁住多少」，写死 `-1R` 就是错的。所以 `riskR` 由上层算好传进来：为负时按风险色（红）画，带描边；大于等于 0 时换成紫色（`#8b5cf6`）纯填充、不画描边——这一块的一条边永远是入场线本身，再叠一层描边会把入场线糊掉。

`startTime` 传的是**基础周期**那根 K 线的时间戳（草稿是回放光标那根，已成交是建仓那根）。切到 15m / 1h 之后这个时间戳往往不是所显示那根 K 线的时间，`timeToCoordinate` 对它返回 `null`，所以 primitive 内部先把它对齐到「包含它的那根 K 线」（在 `series.data()` 上二分），再去换坐标。这跟 `replayBandPrimitive`、`payloadToIntradayBuilt` 里的 `snapToBar` 是同一个坑、同一种解法。

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

`.trainer-level` 下新增 `.trainer-level-hit`：线上下各 4px、共 9px、`pointer-events: auto`、`cursor: ns-resize`，和 pill 共用同一个 `startDrag(kind)`——同一个手势必须走同一条价格回调，否则两条路可能舍入不同。

**「全宽」指的是 K 线面板那一块的宽度，不是整个 overlay 的宽度。** 左右边界按测到的面板矩形逐帧算（`usePinnedPriceYs` 顺带把面板尺寸一起量出来），右边到价格轴为止：那条带子是看不见的，越界一点就会把价格轴自己的「拖着缩放」吃掉。同理，价格一旦被缩放到面板之外，整条线连同它的命中带一起不画——`priceToCoordinate` 这时仍然给得出一个坐标，照画就会画到下面那张 MACD 图上去。左侧画笔工具栏（`.trainer-overlay-rail`）比命中带晚一层，所以给它抬了 `z-index`，否则一条横穿工具栏的线会在按钮上盖一层看不见的 9px 带子。

**画笔工具开着的时候，命中带和 TP/SL 拖出钮整个撤掉。** 同一块面板上只能有一个东西吃 `pointerdown`：留着一条全宽的透明带子，画笔一落笔就变成拖线了，而且拖的是草稿，中间没有确认这一步。

### 标签两态

- **收起**：`⇅ 148.20`，约 70px 宽，只有 grip 和价格，颜色仍按 kind 分（target `--up` / entry `#4a8cff` / stop `--down`）
- **展开**：现在那一整排（badge、SL/TP 拖出钮、价格、R 值/成交状态、进场按钮组、关闭钮），以及改单待确认时的 `旧价 → 新价 [确认调整][撤销]`

**触发条件是 `hovered || dragging`，用 React state 而不是 CSS `:hover`**。拖动时鼠标早就离开标签跑到画布上去了，纯 CSS 会在拖到一半时把标签收起来。

**展开方向从右往左**：标签右边缘钉死在现有的 `margin-right: 70px` 处，向左生长，右边缘不动。

初稿在这里还多写了一句「价格数字也不横向位移」，实现出来并不是这样：展开时价格右边还会接上 R 值、进场按钮组、关闭钮，价格并不是这一排的最后一个，所以数字会往左挪一段。**这里定的是改文档不改代码。** 要让数字真的钉住，得把价格挪到展开态的最右边，读起来就成了 `SL TP │ -1.0R │ 进场 1/4 1/2 全仓 │ 100.00 │ ×`——价格跟它自己的 R 值、跟「进场」这个动作全被拆散了，比「hover 时数字挪一下」难读得多。而且这一下位移是用户自己把鼠标移上去触发的，不是自己跳的。

### 避让

`LANE_STEP_PX` 从 200 降到 80（一个收起标签的宽度加间隙）。收起后只有 70px 宽，三条线挤在一起也未必重叠，退让幅度不需要那么大。`PILL_MIN_GAP_PX = 26` 不变。

展开的那一个抬 `z-index` 盖在邻居上面，而不是把邻居推走——推走会让三个标签在 hover 时集体位移。

## 三、拖动行为

### 跟手更新的三样

标签里的价格、canvas 区域块的形状、块中央的 R 值，同一帧内一起变。

### 价格轴跟随标签

用 lightweight-charts 原生的 `createPriceLine`（`apps/web/src/features/charts/lw.ts` 已封装为 `addPriceLine`），只在拖动期间存在，`pointerup` 时 remove。用原生的而不是自己在 DOM 里画，是为了让它和价格轴上其它标签样式天然一致——那本来就是 TradingView 的库。

### 穿越 entry：不加钳制（原设计作废）

初稿在这里写了一条「新行为」：拖动时把止损钳在入场线的正确一侧，拖不过去。**这条最后没做，而且初稿对现状的描述本身就是错的**，两点都记在这里，免得以后有人照着初稿再实现一遍。

- 事实层面：`orderDraft.ts` 一直导出 `MIN_GAP` / `clampStop` / `clampTarget`，两条拖动路径也一直在用（下单草稿走 `useEntryDraft.setLevel`，改单走 `TrainerOrderPanel.applyAmend`）。所以「现在的代码允许拖过去」不成立，本来就拖不过去。
- 规则层面：这两个 clamp 的参照物是**现价**，不是入场价，这是对的；再叠一层以入场价为墙的钳制会直接违反 TD-EXIT-01——持仓浮盈过 1R 之后，止损必须能被上移到成本价甚至更上面锁利，一堵墙立在入场线上就永远够不着了。所以那一层钳制写出来又整个删掉了。
- 画面层面：初稿担心的「区域块翻转成自己包住自己的怪形状」不会发生。止损越过入场之后那一块的两条边还是入场价和止损价，只是含义从「会亏多少」变成「已锁多少」，靠 `riskR` 换色处理（见上）。

### 被引擎拒绝的改单

`useAmendCheck` 干跑 `validateAmend` 的结果直接染在线上——线变红，标签里写明拒绝理由，「确认调整」置灰。这是现在就有的行为，原样保留，只是从 pill 里的一行小字升级成整条线的状态。

### 性能

`pointermove` 在 120Hz 屏上一秒来一百多次，每次都会 setState → 重渲染 → primitive `setData` → 整图 `requestUpdate`。现有实现已经是每次 move 都 setState，所以不是新增负担，但多了一层 canvas 重绘。先直接做；如果拖动掉帧，用 `requestAnimationFrame` 把一帧内的多次 move 合并成一次。这个优化留到量出问题再加，不预先写进去。

## 测试

- `orderZonePrimitive.test.ts`——几何计算，照 `positionBoxPrimitive.test.ts` 的路子测纯坐标换算：草稿 / 成交两种横向起点、`target` 为 `null` 时只画红区、`belowFloor` 的样式切换、区块高度随价格变化、`riskR` 转正时换成锁利那一套配色
- 同一个文件里还要测周期对齐：一份真正分层的 K 线网格 + 一个「不在网格上就返回 `null`」的 `timeToCoordinate`，起点落在两根 K 线之间时区块照画；以及目标价换不出坐标时两块都不画，而不是只剩红的那一块
- 标签收起 / 展开两态的渲染：收起时只有价格、展开时仓位按钮可点、`dragging` 期间即使鼠标移开也保持展开
- 命中带能触发拖动，且与 pill 走同一条价格回调；命中带的左右边界等于 K 线面板而不是整个 overlay；价格被缩放到面板之外时整行不画
- 拖动纪律测试一律从命中带上按下去，不从画布上按——命中带是真实鼠标唯一能落到的地方，走别的路径测出来的结论不代表线上行为
- TD-EXIT-01：浮盈过 1R 的持仓，止损能被拖过入场价（多头拖到上方、空头拖到下方）并停在那里，没有任何一层把它挡回来
- 画笔工具开着时，命中带和 TP/SL 拖出钮都不存在，pill 上按下去也不动线

## 不做的事

- 不把线和按钮画进 canvas（见取舍 1）
- 不去掉「确认调整」（见取舍 3）
- 不动 `TrainerEntryLane` 底栏的方向按钮和备注框——它们不在这次范围内
- 不预先加 rAF 节流（见性能一节）
- 不做多组订单并存：训练器一局只有一组线，TradingView 收起标签是因为图上可能挂十几个订单，这个动机在这里不存在，收起是为了观感而不是为了容纳数量
