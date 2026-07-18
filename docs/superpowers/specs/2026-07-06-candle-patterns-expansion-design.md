# 裸 K 形态检测扩展与修复 — 设计稿

日期:2026-07-06
状态:已确认(方案 B:修好现有判定 + 新增形态)

## 背景与问题

`apps/server/src/services/candlePatterns.ts` 已实现 16 种形态,但用户在 intraday 图上从未见过任何形态标记。排查结论(链路证据见下):

1. **Pin bar 判定苛刻到几乎不触发**:要求影线 ≥ 2 倍实体、另一侧影线 ≤ 0.3 倍实体、扎出最近 5 根新低/新高、整根振幅 ≥ 14 根平均振幅,且排在锤子/射击之星之后兜底。实测 MU 5m/15m/1h 三个周期命中数全为 0,仅 MRVL 日线出过 1 个。
2. **非 strong 形态在图上无文字标签**(`intraday.ts` patternMarkers 的 `text` 仅 strong 形态非空),只画无标签小箭头,与其他标记混杂,肉眼无法识别。
3. **影线判定以实体为倍数基准**:实体很小时"上影 ≤ 0.3 倍实体"近似要求零影线;实体为 0(十字星)的 K 线被 `b <= 0` 直接跳过。与教科书按整根振幅分段的定义不符,漏检标准形态。

链路验证(均正常,问题不在这些环节):

- 检测函数对真实数据有产出:MU 5m/15m/1h 每 150 根命中 11–14 个形态(但 pin bar 为 0);
- `buildIntraday` 完整链路每个周期产出 11–12 个 `group: "candle"` 标记;
- 前端 `useIndicatorToggles` 的 "candle" 开关存在且默认开启,`filterByGroup` → `setMarkers` 渲染路径正常。

## 变更范围

涉及文件:

- `apps/server/src/services/candlePatterns.ts` — 判定重写 + 新形态
- `apps/server/src/services/intraday.ts` — 标记文字、neutral 样式
- `packages/shared/types.ts` — `CandlePatternKind` 扩充、`bias` 加 `"neutral"`
- `apps/server/test/candlePatterns.test.ts` — 新用例 + 真实数据回归
- 前端如有对 `bias` 的二值假设需同步(检查 `useIntradayCharts.ts` / tooltip 组件)

## 设计

### 1. 判定基准重写(现有 16 种)

影线/实体判定从"以实体为倍数"改为按**整根振幅(range = high - low)分段**:

- 锤子 / 上吊 / 下影针线:下影 ≥ 60% 振幅、实体 ≤ 30% 振幅、上影 ≤ 15% 振幅;
- 倒锤子 / 射击之星 / 上影针线:镜像(上影 ≥ 60%、实体 ≤ 30%、下影 ≤ 15%);
- 实体为 0 的 K 线不再整体跳过(十字星系需要);原 `b <= 0 continue` 仅对需要实体方向的形态保留;
- 趋势判定 `trendInto`、多根形态(吞没/星/孕线/三兵三鸦/乌云/刺透)的实体对比逻辑保持现状不动——本次只改单根形态的影线基准。

Pin bar 放宽:

- 删除"振幅 ≥ 14 根平均振幅"(`PIN_BAR_MIN_RANGE_RATIO`)条件;
- 局部极值从"严格低于/高于前 5 根"放宽为"≤ 前 3 根最低价 / ≥ 前 3 根最高价"(允许相等);
- 保留分流逻辑:有趋势背景 → 锤子/上吊/倒锤/射击之星;无趋势背景且处局部极值 → 针线。

### 2. 新增 8 种形态

| kind | 中文名 | 根数 | bias | 触发要点 |
|---|---|---|---|---|
| `doji` | 十字星 | 1 | neutral | 实体 ≤ 5% 振幅;仅在趋势末端标注(uptrendInto 或 downtrendInto 成立),横盘中不标 |
| `long_legged_doji` | 长腿十字 | 1 | neutral | 十字 + 上下影各 ≥ 35% 振幅;同样仅趋势末端 |
| `gravestone_doji` | 墓碑十字 | 1 | bearish | 十字 + 上影 ≥ 70% 振幅,上涨末端 |
| `dragonfly_doji` | 蜻蜓十字 | 1 | bullish | 十字 + 下影 ≥ 70% 振幅,下跌末端 |
| `tweezer_top` | 镊子顶 | 2 | bearish | 上涨末端,两根高点差 ≤ 10% 平均振幅,前阳后阴 |
| `tweezer_bottom` | 镊子底 | 2 | bullish | 下跌末端,两根低点差 ≤ 10% 平均振幅,前阴后阳 |
| `bullish_marubozu` | 光头大阳 | 1 | bullish | 阳线,实体 ≥ 85% 振幅且 ≥ 1.3 倍平均实体 |
| `bearish_marubozu` | 光头大阴 | 1 | bearish | 阴线,实体 ≥ 85% 振幅且 ≥ 1.3 倍平均实体 |

不加 inside bar(与孕线重复)。

十字星系内部优先级:墓碑/蜻蜓 > 长腿 > 普通十字(一根 K 线只标最具体的一种)。全局优先级沿用 `taken` map:三根形态 > 两根 > 单根,先检测者占位。

每种新形态在 `CANDLE_PATTERN_META` 补 label / bias / strong / implication(中文白话,口径与现有条目一致:形态含义 + 确认条件)。strong 定级:全部 8 种均为非 strong(单根/两根警示信号,可靠性有限)。

### 3. 中性方向支持

- `shared/types.ts`:`CandlePattern["bias"]` 与 `CANDLE_PATTERN_META` 的 bias 扩为 `"bullish" | "bearish" | "neutral"`;
- `intraday.ts` patternMarkers:neutral → 灰色(`#9e9e9e`)圆点 `circle`、位置 `inBar`;bullish/bearish 沿用绿/红箭头;
- 排查前端及其他消费方(deep-dive tools、tooltip)对 bias 二值的假设并同步。

### 4. 可见性修复

- 所有形态标记 `text` 一律显示中文标签(去掉仅 strong 显示的限制);
- tooltip、`slice(-12)` 截断、去重窗口(同 kind 相邻 ≤ 2 根去重)保持现状。

### 5. 测试

- `candlePatterns.test.ts`:8 种新形态各至少 1 个构造用例(正例 + 关键反例,如横盘中的十字星不标、高点差过大的镊子顶不标);
- 现有单根形态用例按新振幅基准调整;
- 真实数据回归:用 `test/fixtures/mu-5m/15m/1h.json`、`mrvl-day.json`、`spy-day.json` 断言总命中数落在合理区间(防刷屏:每 150 根 ≤ 25 个)且 pin bar / 新形态在至少一个 fixture 上有命中;
- 若 `intraday.test.ts` 有形态相关快照/expected fixture 受影响,同步更新。

## 验收标准

1. MU 5m/15m/1h fixture 上 pin bar 或其替代单根形态命中数 > 0;
2. 图上每个形态标记都有可读的中文标签;
3. 新增 8 种形态在构造用例下全部可触发,横盘十字星等反例不触发;
4. `pnpm test` 全绿;lint 通过(仅改动文件)。
