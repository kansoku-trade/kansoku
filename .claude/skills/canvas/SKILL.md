---
name: canvas
description: >
  现场拼一份自定义画布（图表/面板），写成 journal/canvases/<slug>.canvas.tsx。
  只从 @kansoku/canvas 取组件，数据先用工具取回再内嵌进 TSX。适合「这一问才需要」的
  对比、多图并排、结论+数字，而不是四种固定图表。Triggers: 画布、自定义面板、
  拼一张图、canvas、save_canvas、自定义图表、并排对比。
---

# canvas

给用户一份**能继续改的具名画布**，不是聊天气泡里的表格。四种固定图（flow / cohort / sepa / intraday）走 `chart` skill；这里是「按这一个问题现场拼」。

> 回复语言跟用户：简体 / 繁體 / English。

## 什么时候用

- 用户要看「多周期 + 对比 + 一段结论」这种现成类型盖不住的东西。
- 已经取到数，需要一张可重开、可改的面板。
- 同一份再改：先 `read_canvas`，再 `save_canvas` 覆盖同一个 slug。

别用：只要一个数字或一行 sparkline；只要标准驾驶舱（走 `chart`）。

## 流程

1. 先取数：`fetch_kline` / `read_data_pack` / bash `longbridge` / 研究库文件。
2. 把数字**写进 TSX**。画布不能 `fetch`、不能拉活行情。
3. 改已有画布必须先 `read_canvas`。
4. `save_canvas({ slug, title, source })`。slug 只能是 kebab-case：`mu-15m-compare`。

保存失败会返回 `rejected:` 加逐条原因，改完再交。编译/运行时错误会写回检查记录，下次 `read_canvas` 能看到。

## 源码规矩

必须有且只有一个 `export default`。只能：

```tsx
import { Canvas, Text } from '@kansoku/canvas';
```

禁止：相对路径、`react`、`node:`、`fetch(`、`XMLHttpRequest`、`import(`、`require(`、`setTimeout` / `setInterval`、`document.`、`window.`。体积上限 64 KB。

数据内嵌。指标（MACD / EMA）服务端算好再写进去，`CandleChart` 只画不算。`ema={[9,21,55]}` 这种只有周期、没有点的写法不会画出均线，要传 `{ label, points }`。

## 组件

布局：`Canvas`（必须作根，`title` 必填，`caption` 写来源·周期·截止时间）、`Section`、`Grid`、`Row`、`Stack`、`Card`、`Divider`。

文字：`H1` `H2` `H3`、`Heading`、`Text`、`Link`、`Callout`、`Pill`、`Badge`。

数字：`Stat`、`Metric`、`Table`。

对照（多标的横排，别用 Table 手搓）：`Compare` —— `metrics={[{key,label,align,signed,suffix}]}` + `rows={[{symbol,label?,values,trend?,note?}]}`，`sortBy` 指定按哪列降序。`trend` 给一串数就在行内画 `Sparkline`。

覆盖度：`Coverage` —— `items={[{label, status: 'ok'|'partial'|'missing', note}]}`。取不到的数据必须列进来（TD-DATA-01）。

出处：`Source` —— `{ from, at, note }`，行内标数据来源和时间戳（TD-DATA-02）。

结论（对应纪律，别用 Table 手搓）：
- `Scenarios` —— Bull/Base/Bear，`items` 每项 `{ label, probability, trigger, note? }`。概率合计不是 100 会被标红（TD-SCENARIO-01）。
- `RRPlan` —— `{ entry, stop, targets }`，盈亏比自动算，低于 1.5 标红（TD-RR-01）。`targets` 可以是数组，会显示 T1/T2。
- `Timeline` —— `items={[{at, label, price?, detail?, tone?, current?}]}`，事件轴。

交互：`Toggle`、`Select`。

分析图（Recharts）：`LineChart`、`BarChart`（`signed` 正负分色）、`AreaChart`、`PieChart`，外加行内迷你走势 `Sparkline`（`data={number[]}`，无轴无标题）。多序列写 `series={['mu','tsm']}` 即可，要改颜色或显示名再写成 `{key,label,color}`。每张图都要有 `title`，轴写单位（`xUnit` / `yUnit`）。缺 title 会显示 Untitled，不要交这种。

交易图：`CandleChart`。一根图一个标的一个周期。多周期就并排多个。`bars` 是 OHLCV；`volume` / `macd` / `ema.points` / `priceLines` / `zones` / `markers` 都是算好再传入。

交互只限 SDK 给的 `useState` / `useMemo` 和 `Toggle` / `Select`。没有 `useEffect`。

## 最小例子

```tsx
import { Canvas, Callout, Stat, Text } from '@kansoku/canvas';

export default function App() {
  return (
    <Canvas title="MU 15m 读数" caption="Longbridge · 2026-08-28 15:00">
      <Stat label="最新价" value="61.20" delta="+1.4%" tone="up" />
      <Callout tone="warn">反弹到位再动，别追。</Callout>
      <Text>盈亏比不够，先等回踩。</Text>
    </Canvas>
  );
}
```

全部组件铺满的示例：`apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx`，应用里在 `/canvases/demo` 打开。

保存后告诉用户画布 slug，让他们在旁边打开。同一问里改同一份，不要新开 slug。
