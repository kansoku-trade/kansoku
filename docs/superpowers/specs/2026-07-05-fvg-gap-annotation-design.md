# FVG 缺口标注设计

日期:2026-07-05
状态:待实现

## 背景

`intraday`(短线预测)仪表盘是整个 app 里唯一画蜡烛图的地方,主图基于 TradingView
Lightweight Charts(v4.2.3)。现在图上已经有 EMA 均线、MACD、金叉死叉、自动背离/背驰、
123 结构、K线形态、价位线等叠加层,但没有「缺口」这一类形态标注。

本设计给主图新增 **FVG(Fair Value Gap,公平价值缺口)** 标注:三根 K 线里中间那根
跳空、第 1 根和第 3 根之间留下一段没成交的价格区间。SMC(聪明钱概念)交易里常把这块
画成半透明矩形,当作价格后续可能回补的目标区 / 支撑阻力区。

本期**只做 FVG**。相邻两根之间的普通跳空(隔夜高开/低开)是相关但独立的形态,留待
后续再评估,不在本设计范围。

## 目标与非目标

**目标**

- 在 `intraday` 主图上,按 5m / 15m / 1h 三个周期各自识别并标注 FVG。
- 只显示**还没被回补**的活跃缺口。
- 用半透明矩形块呈现,看涨看跌两色区分,从缺口形成处横向延伸到当前最右 bar。
- 提供一个独立开关,和现有指标开关并列,默认开。

**非目标**

- 不做相邻两根的普通跳空 / 隔夜跳空标注。
- 不做已回补缺口的历史痕迹保留(不淡化显示,直接不画)。
- 不做 hover tooltip 的复杂命中检测。
- 不改动 SEPA / flow / cohort 等其它图。
- 不改后端 Longbridge 取数,只在已有 K 线数据上做纯计算。

## 缺口定义与检测

### 形态

以连续三根 bar `i-1, i, i+1` 为窗口:

- **看涨缺口(bullish)**:`bar[i-1].high < bar[i+1].low`
  - 缺口区间 `[bar[i-1].high, bar[i+1].low]`(下沿 = 第 1 根最高价,上沿 = 第 3 根最低价)。
  - 语义:向上跳空,缺口悬在价格下方,潜在支撑。
- **看跌缺口(bearish)**:`bar[i-1].low > bar[i+1].high`
  - 缺口区间 `[bar[i+1].high, bar[i-1].low]`(下沿 = 第 3 根最高价,上沿 = 第 1 根最低价)。
  - 语义:向下跳空,缺口悬在价格上方,潜在阻力。

缺口的**起点时间**取中间那根 `bar[i].time`(缺口所在位置)。

### 厚度过滤(两道门槛)

盘中 5m 图会出现大量只有几分钱的微小缺口,全画会很乱。用两道门槛剔除噪音缺口:

- **绝对百分比下限(主)**:缺口高度 / 中线价 小于 `FVG_MIN_PCT` 的丢弃。`FVG_MIN_PCT`
  默认 `0.003`(0.3%)。这是主判据——它按缺口占价格的比例衡量"厚薄",不受当时波动大小影响,
  能稳定滤掉视觉上薄薄一条的缺口(实测:0.21% 那种被剔除,0.3%+ 的保留)。
- **波动门槛(辅)**:再算 ATR(14)(平均真实波幅,反映最近一段的平均单根波动),缺口高度
  小于 `FVG_ATR_RATIO × ATR` 的丢弃。`FVG_ATR_RATIO` 默认 `0.25`。作为高波动时段的兜底,
  避免相对当时波动仍属噪音的缺口。
- 两道都是 `fvg.ts` 里的常量,方便后续调。
- ATR 数据不足(bar 少于 15 根、算不出 ATR14)时,**跳过波动门槛**——但百分比下限始终生效。
  此行为写进测试固定下来。

### 新鲜度过滤(保鲜期)

缺口的参考价值随时间衰减:刚形成时价格大概率会回补,放得越久还没补,说明市场已不在乎它,
再画就是横贯全图的噪音长条。因此加一道保鲜期:

- 缺口形成(中间 bar)到最新 bar 的跨度超过 `FVG_MAX_AGE` 根 K 线、仍未被回补的,判定过期、
  **直接不输出**。`FVG_MAX_AGE` 默认 `40`。
- 三个周期统一用同一根数:高周期每根 K 线代表的时间本就更长,同样 40 根自然对应更长的真实
  时间,"高周期缺口活得更久"的效果已内建,同时图上视觉长度一致。
- 效果:留下的框最多横跨 40 根,不再有拖到最右、贯穿全图的陈年缺口。因为老缺口不再进入数据,
  渲染端无需改动(框仍画到最右,但最老 40 根龄 ⇒ 最长 40 根宽)。

### 只留未补(活跃缺口)

缺口形成之后,从第 3 根之后的每一根 bar 检查是否**完全穿过**整块:

- 看涨:后续任意 bar 的 `low ≤ 缺口下沿` → 价格已跌穿下沿,缺口被完全填,剔除。
- 看跌:后续任意 bar 的 `high ≥ 缺口上沿` → 价格已升穿上沿,缺口被完全填,剔除。

只有从形成到最新 bar 都没被完全穿过的缺口才输出。(触及边缘但没穿透的保留。)

## 数据结构

`packages/shared/types.ts` 新增:

```ts
export interface IntradayFvgZone {
  startTime: number; // 缺口所在中间 bar 的时间戳
  low: number; // 缺口下沿价
  high: number; // 缺口上沿价
  kind: 'bullish' | 'bearish';
}
```

`IntradayTfData` 增加一个字段:

```ts
fvgZones?: IntradayFvgZone[];
```

设为可选,兼容已持久化的旧 chart JSON(`journal/charts/data/`)——旧文件没有该字段时
前端按空数组处理。

## 后端实现

新建 `apps/server/src/services/fvg.ts`,和 `candlePatterns.ts` 同层,导出:

```ts
export function detectFvgZones(candles: Candle[]): IntradayFvgZone[];
```

纯函数,输入某一周期的 candles,输出活跃缺口数组。内部:

1. 算 ATR(14)。
2. 三根窗口扫描,套用看涨/看跌判定 + 波动门槛。
3. 对每个候选缺口做「未补」检查(向后扫描)。
4. 返回活跃缺口。

在 `intraday.ts` 组装 `IntradayTfData` 的地方,对每个周期调用 `detectFvgZones` 填入
`fvgZones`。复用 `indicators.ts` 里已有的工具(若已有 ATR/true range 计算就复用,没有
就在 `fvg.ts` 内实现一个局部的,不污染公共模块)。

## 前端实现

### 渲染:Lightweight Charts Primitive

新建 `apps/web/src/charts/intraday/fvgPrimitive.ts`,实现一个 series primitive
(`ISeriesPrimitive`),挂到蜡烛 series 上:

- 每个缺口画一个矩形:
  - 横向:`startTime` → 最右当前 bar(用 `timeScale` 的 `timeToCoordinate`,右边界取
    可视区右端或最后一根 bar 坐标)。
  - 纵向:`low` / `high` 用 series 的 `priceToCoordinate` 换算。
  - 看涨用主题涨色(`theme.up`)、看跌用跌色(`theme.down`),半透明填充 + 细边框。
  - 左端内嵌一个极小价格标签(缺口中线价 `(low+high)/2` 保留两位小数),不做 hover。
- primitive 在缩放 / 平移时随 chart 重绘(实现 `paneViews` + renderer,读实时坐标)。

参考现有 `lw.ts` 的封装风格,能复用的坐标 / 主题工具尽量复用。

### 接线:useIntradayCharts

在 `useIntradayCharts.ts`:

- 建图时创建 FVG primitive 实例并 `attachPrimitive` 到 `candle` series(仅一次)。
- 数据更新的 effect 里,把 `d.fvgZones`(经开关过滤)喂给 primitive 的 `setData`,
  primitive 内部触发重绘。
- 开关关闭时喂空数组。
- 清理时 `detachPrimitive`。

FVG 不分 group 子类,直接受 `toggles.fvg` 单一开关控制(不走 `filterByGroup`,因为
它是整层开关而非 per-marker group)。

### 开关:IndicatorToggles

`useIndicatorToggles.ts`:

- `IndicatorToggleKey` 加 `"fvg"`。
- `INDICATOR_TOGGLE_LABELS` 加 `fvg: "FVG 缺口"`。
- 默认全开的逻辑不变,新开关自动默认开。
- localStorage 合并逻辑不变,旧用户没有该键时默认开。

`IndicatorToggles.tsx` 若是遍历 `INDICATOR_TOGGLE_KEYS` 渲染的,则无需改动,新开关
自动出现;若有硬编码顺序则补一项。

## 测试

新建 `apps/server/test/fvg.test.ts`,覆盖:

- 看涨缺口识别:构造 `bar[i-1].high < bar[i+1].low` 的三根,确认产出 `bullish`、
  区间正确、`startTime` 是中间 bar。
- 看跌缺口识别:对称用例。
- 无缺口:三根有重叠,产出空。
- 波动门槛:缺口高度小于 `0.25 × ATR` 的被过滤掉。
- 已补剔除:缺口形成后有 bar 完全穿过,不再输出;只触及边缘的仍保留。
- 多缺口:一段序列里多个缺口,部分已补部分未补,只留未补的。

前端 primitive 的视觉正确性通过 preview 工具人工验证(截图 + inspect),不写单测。

## 影响范围

改动文件:

- `packages/shared/types.ts` — 加 `IntradayFvgZone`、`IntradayTfData.fvgZones`。
- `apps/server/src/services/fvg.ts` — 新建,检测逻辑。
- `apps/server/src/services/intraday.ts` — 组装时调用检测填字段。
- `apps/web/src/charts/intraday/fvgPrimitive.ts` — 新建,矩形 primitive。
- `apps/web/src/charts/intraday/useIntradayCharts.ts` — attach / 喂数据 / 清理。
- `apps/web/src/charts/intraday/useIndicatorToggles.ts` — 加 `fvg` 开关。
- `apps/server/test/fvg.test.ts` — 新建单测。

无破坏性改动:新字段可选,旧持久化 JSON 与旧开关配置向后兼容。
