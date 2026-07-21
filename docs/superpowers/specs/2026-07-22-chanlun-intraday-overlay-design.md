# 缠论 · Intraday 结构与三类买卖点自动标注

日期：2026-07-22
状态：已通过讨论确认（方案 A · 嵌入现有 `intraday` 图 · 全套覆盖到三类买卖点）

## 背景与问题

用户在系统学习缠论（缠中说禅的技术分析体系）。`intraday` 图表已经自动识别 MACD 背驰（`autoBeichi`）、Pin Bar、123 结构，走的是"服务端算 → JSON → LWC marker/connector"管线，但**缠论本身的骨架结构**（分型 / 笔 / 线段 / 中枢 / 三类买卖点）完全空白。手动看 K 线判读容易漏、容易错，尤其是中枢的划定和买卖点的定位对新手来说是硬关卡。

## 目标

- 在 `intraday` 图的 5m / 15m / 1h 三级别 K 线上自动画出缠论完整结构：**分型 → 笔 → 线段 → 中枢 → 一/二/三类买卖点**
- 每个结构 hover 出教学 tooltip（📖 定义 + 💡 含义 + 简化标记），学习中直接对照
- 复用现有 marker/connector 管线和 toggle 惯例，不新增图类型
- 保持"简化算法，仅供参考"的诚实标签（沿用 `autoBeichi` / `pattern123` 的 UX 惯例）

## 方案总览

新增 `packages/core/src/analysis/chanlun/` 子系统，独立于现有 MACD 层面的背驰/背离检测。服务端在 `coerceIntradayTimeframe` 末尾对每个时间级别调用 `computeChanStructure(candles)`，输出全套结构挂到 `IntradayTfData.chanStructure`；orchestrator 把结果转成 marker / connector / rectangle 与现有 auto 层并列合流；前端 `useIndicatorToggles` 新增两个独立 indicator 分组控制显隐。

```
K 线 → inclusion 合并 → 分型 → 笔 → 线段 → 中枢 → 段间背驰 → 三类买卖点
                                                                     ↓
                                        orchestrator 合并到 markers / connectors / rectangles
                                                                     ↓
                                        前端按 toggle 分组显隐（缠论结构 · 缠论买卖点）
```

服务端**始终计算 Chan**（跟现有 `autoBeichi` 一致），前端只管显隐——避免 toggle 触发额外 round-trip。三级别 × ~1000 根 K 线的总耗预算 < 100ms，不影响 `POST /api/charts` 响应。

### 1. 检测算法（服务端 TypeScript 实算）

#### 1.1 包含关系合并（`inclusion.ts`）

上升方向留高、下降方向留低——缠论算法必备预处理，保证分型判定不被中间的"包含"K 线干扰。

#### 1.2 分型（`fenxing.ts`）

滑动 3-K 窗口：
- 顶分型：中间 K 高点严格最高、低点也不低于两侧
- 底分型镜像
- 最后一根 K 线的分型 `confirmed: false`（下一根 K 线来才能确认；沿用现有 MACD 结构标注 `?` 模式）

#### 1.3 笔（`bi.ts`）

连接相邻反向分型，规则：
- 两分型间至少 **5 根 K 线**（含分型自身；主流缠论算法惯例）
- 同向连续分型合并为极值分型（保留更极端的）
- 分型价格必须严格突破前笔的对应端

#### 1.4 线段（`xianduan.ts` · 简化版）

至少 3 笔构成，简化破坏判定：
- 反向笔突破前"同向笔"极值 → 段可能终结
- 再一反向笔不回补 → 段确认终结
- 完整教科书版本的特征序列分类跳过；tooltip 明确标"简化"

#### 1.5 中枢（`zhongshu.ts`）

连续 3 段线段的价格重叠区：
- 区间 = `[max(3 段各自最低), min(3 段各自最高)]`
- 若 `max_lows < min_highs` → 中枢成立
- 后续线段留在重叠区 → 延续；跳出且不回 → 终结
- 前端用**矩形**画出（x = 时间起讫，y = 重叠区上下沿）

#### 1.6 段间背驰（`beichi.ts` · 一类点前置件）

与现有 K 线级 `autoBeichi` 分开——Chan 严格背驰是**同向线段间**比较：
- 段 B 创方向新极值
- 段 B 的 MACD hist 面积（段区间 `sum(|hist|)`）< 段 A
- → 背驰。标"简化背驰面积法"

#### 1.7 三类买卖点（`buysellpoints.ts`）

**一类**：出现底/顶背驰的下跌/上涨线段结束点

**二类**：一类点后，一笔反弹（反向）→ 一笔回调（同向），若回调终点严格未破一类点 → 二类点

**三类**：中枢确定终结后，价格向对应方向突破中枢边沿并形成一段远离线段，后续一笔回调终点严格未破中枢边沿 → 三类点。简化：跳过"新线段严格确认"

### 2. 数据模型

新增到 `packages/shared/src/types/` 相应模块（跟 `IntradayTfData` 定义同侧）：

```ts
interface Fenxing {
  time: number;
  price: number;
  kind: 'top' | 'bottom';
  confirmed: boolean;
  barIndex: number;
}

interface Bi {
  start: Fenxing;
  end: Fenxing;
  direction: 'up' | 'down';
  bars: number;
}

interface Xianduan {
  bis: Bi[];               // ≥3
  direction: 'up' | 'down';
  startTime: number;
  endTime: number | null;  // null = pending
  broken: boolean;
}

interface Zhongshu {
  coreSegments: Xianduan[];   // 首 3 段
  extendedBy: Xianduan[];      // 后续延续段
  priceLow: number;            // 重叠区下沿
  priceHigh: number;
  startTime: number;
  endTime: number | null;      // null = still active
  isActive: boolean;
}

type BuySellPointKind = 'buy1' | 'sell1' | 'buy2' | 'sell2' | 'buy3' | 'sell3';

interface BuySellPoint {
  time: number;
  price: number;
  kind: BuySellPointKind;
  timeframe: TimeframeKey;
  refBeichi?: { fromSegmentIdx: number; toSegmentIdx: number };  // 一类
  refFirstPoint?: { time: number; price: number };               // 二类
  refZhongshu?: { startTime: number; endTime: number };          // 三类
  confirmed: boolean;
}

interface ChanStructure {
  fenxings: Fenxing[];
  bis: Bi[];
  xianduans: Xianduan[];
  zhongshus: Zhongshu[];
  buySellPoints: BuySellPoint[];
}
```

`IntradayTfData` 增加可选字段：`chanStructure?: ChanStructure`。

`SeriesMarker.group` union 扩展 10 值：`'fenxing' | 'bi' | 'xianduan' | 'zhongshu' | 'chan-buy1' | 'chan-sell1' | 'chan-buy2' | 'chan-sell2' | 'chan-buy3' | 'chan-sell3'`。

新增 `PriceRectangle` 类型（起讫 time + 上下沿 price + color + group）供中枢用。

### 3. UI · Toggle 与 Tooltip

**Toggle**（`apps/web/src/features/charts/intraday/useIndicatorToggles.ts`）新增两个**独立顶层 indicator 条目**（folded group），默认全部 OFF，持久化沿用现有指标 toggle store：

- **缠论结构**（4 子层）：分型 / 笔 / 线段 / 中枢 · Badge `(N/4)`
- **缠论买卖点**（3 子层）：一类 / 二类 / 三类 · Badge `(N/3)`

两个开关独立；即使结构关闭，买卖点仍可单独显示（只画点，不画中枢矩形）。

**Tooltip**（`chanlun/tooltip.ts` 生成，前端拼装）——每类结构含 `📖 定义` + `💡 含义` + 简化标记：

```
🔺 顶分型｜m15 · 14:30 $102.5（未确认）
三 K 高点：$100.2 / $102.5 / $101.8
📖 定义：中间 K 高点严格最高、低点也不低于两侧
💡 含义：局部反转信号——但分型只是"结构材料"，单个分型不足以判定方向，
　　需等下一笔配合确认。未确认状态下，若下一根 K 线创新高，此顶分型作废
简化算法，仅供参考
```

```
↗ 上笔（第 7 笔）｜m15
起 12:00 $98.50（底分型） → 止 14:30 $102.30（顶分型）
跨 18 根 K 线｜幅度 +3.86%
📖 定义：相邻反向分型之间的连接，至少 5 根 K 线间隔
💡 含义：短线方向已定——当前为上笔说明短线多头占优。笔本身不是趋势，
　　随时可能被反向笔打断；只有多笔累积成线段才具备趋势意义
```

```
⤴ 上线段（第 3 段）｜m15
由笔 #5 → #6 → #7 构成｜起 09:45 → 讫 15:30
📖 定义：至少 3 笔组成，有价格覆盖
💡 含义：中期趋势成型——上线段进行中即中期力量偏多。线段的"破坏"
　　（反向段确立）通常是趋势反转的第一信号，也是构成中枢的组件
简化判定（未做特征序列分类），仅供参考
```

```
⬛ m15 级别中枢｜盘整中
由线段 #3 / #4 / #5 构成｜+2 段延伸
重叠区 [$98.20, $100.50]｜已延续 42 根 K 线
📖 定义：连续 3 段线段的价格重叠区
💡 含义：多空分歧区——市场在此形成阶段性平衡。三种走向决定后市：
　　▲ 上破 + 回踩不破 → 三类买点，趋势向上升级
　　▼ 下破 + 反抽不破 → 三类卖点，趋势向下升级
　　⬜ 继续震荡 → 中枢延续，等待方向选择
```

```
🎯 一类买点｜m15 · 14:30 $98.50（已确认）
背驰段：段 #7 (下) vs 段 #5 (下)
　　　段 #7 低 $98.50 < 段 #5 低 $99.20（新低）
　　　段 #7 MACD 面积 -12.4 < 段 #5 -18.6（动能弱）
📖 定义：下跌线段末端出现段间底背驰
💡 含义：趋势转折的最强信号——价格新低但动能不足。
　　风险："背驰不是终点"，严格执行需等次级别买点确认
简化背驰面积法，仅供参考
```

```
🎯 二类买点｜m15 · 15:15 $99.30（已确认）
一类点：14:30 $98.50
反弹至 $101.20 → 回调低 $99.30 > 一类点 ✓
📖 定义：一类点后反弹回调不破一类点
💡 含义：一类点的确认——多头接手有效。相比一类点安全，
　　代价是错过初始反弹段
```

```
🎯 三类买点｜m15 · 16:00 $101.80（已确认）
中枢：[$98.20, $100.50]（终结于 15:20）
突破后回调低 $101.80 > 中枢上沿 $100.50 ✓
📖 定义：中枢向上突破后回调不破中枢上沿
💡 含义：中枢升级信号——多头彻底接管旧盘整区，
　　常预示新的更高中枢形成，是"趋势中的最强买点"
简化判定（跳过新线段严格确认），仅供参考
```

一类卖 / 二类卖 / 三类卖为对应 mirror（顶背驰 / 反抽不破 / 中枢向下突破）。

Tooltip 里的 `📖 定义` 与 `💡 含义` 文本作为常量放在 `tooltip.ts`，方便后续统一 review 措辞。

### 4. 中枢 rectangle 渲染

前端在 `apps/web/src/features/charts/intraday/` 里新增中枢矩形渲染。实现阶段视 LWC 版本挑最省：
- 首选：LWC v4+ 的 series primitive API（如可用）
- 退路：canvas overlay layer 自绘（跟 marker 层同 z-index）
- 两种方案的接口对上层透明：orchestrator 只输出 `PriceRectangle[]`

## 改动清单

| 文件 | 改动 |
|---|---|
| `packages/shared/src/types/*.ts` | 新增 `Fenxing / Bi / Xianduan / Zhongshu / BuySellPoint / ChanStructure / PriceRectangle`；`SeriesMarker.group` union 扩展 10 值 |
| `packages/core/src/analysis/chanlun/inclusion.ts`（新增） | K 线包含关系合并 |
| `packages/core/src/analysis/chanlun/fenxing.ts`（新增） | 顶/底分型识别（含未确认态） |
| `packages/core/src/analysis/chanlun/bi.ts`（新增） | 笔识别（5 K 间隔 + 同向合并 + 突破约束） |
| `packages/core/src/analysis/chanlun/xianduan.ts`（新增） | 线段识别（简化破坏判定） |
| `packages/core/src/analysis/chanlun/zhongshu.ts`（新增） | 中枢识别（3 段重叠 + 延续 + 终结） |
| `packages/core/src/analysis/chanlun/beichi.ts`（新增） | 段间背驰（MACD 面积法） |
| `packages/core/src/analysis/chanlun/buysellpoints.ts`（新增） | 一/二/三类买卖点识别 |
| `packages/core/src/analysis/chanlun/tooltip.ts`（新增） | 缠论语义 tooltip 文本构造 |
| `packages/core/src/analysis/chanlun/index.ts`（新增） | 出口 `computeChanStructure(candles): ChanStructure` |
| `packages/core/src/analysis/intraday/timeframe.ts` | `coerceIntradayTimeframe` 尾部调 chan 计算并挂 `chanStructure` |
| `packages/core/src/analysis/intraday/markers.ts` | 新增 `chanOverlay(chan)` 生成 marker / connector / rectangle |
| `packages/core/src/analysis/intraday/orchestrator.ts` | 每级别合并 chan overlay，与 `autoDiv` / `autoBei` / `auto123` 并列 |
| `apps/web/src/features/charts/intraday/useIndicatorToggles.ts` | 新增两个独立分组（缠论结构 4 层 + 缠论买卖点 3 层） |
| `apps/web/src/features/charts/intraday/IntradayDashboard.tsx` | 中枢 rectangle 渲染注入（LWC series primitive 或 canvas overlay） |
| `packages/core/src/analysis/chanlun/*.test.ts`（新增） | 各层单元测试（inclusion / fenxing / bi / xianduan / zhongshu / beichi / buysellpoints） |
| `packages/core/src/analysis/intraday/chanlun-integration.test.ts`（新增） | 真实历史 K 线跑全套 pipeline 的 snapshot |

## 测试策略

**TDD 顺序**自上而下依赖：inclusion → fenxing → bi → xianduan → zhongshu → beichi → buysellpoints。每层依赖上层已通过。

**单元测试**用 golden fixtures（JSON 固化的 K 线输入 + 期望输出），便于回归。每层覆盖典型正面 + 至少一个反面（不成立场景 + 边界）：

- `inclusion.test.ts`：上升方向留高 / 下降方向留低 / 连续包含
- `fenxing.test.ts`：标准顶底 / 包含后判分型 / 尾部未确认 / 中间 K 非极值场景
- `bi.test.ts`：标准笔 / 5 K 间隔不足过滤 / 同向连续分型合并
- `xianduan.test.ts`：标准 3 笔段 / 破坏终结 / 破坏被反笔取消
- `zhongshu.test.ts`：3 段成中枢 / 4 段无重叠不成 / 延续 / 终结
- `beichi.test.ts`：新极值 + 面积衰减 / 新极值 + 面积相等（不算）/ 单段
- `buysellpoints.test.ts`：
  - 一类：背驰 → 报点 / 无背驰 → 不报
  - 二类：回调不破一类 → 报 / 破位 → 不报（等新一类）
  - 三类：中枢终结 + 回抽不破 → 报 / 破位 → 不报
  - 时序：一类必先于二类；三类必须中枢终结先

**Integration snapshot**：取 NVDA 或 MU 一段 5m 历史（约 300 根），跑完整 `buildIntraday` with Chan 开启，snapshot 六类点 + 全套结构。

**无 E2E**：indicator toggle UI 沿用现有单元测试模式（`useIndicatorToggles.ts` 目前也没 E2E 覆盖）。

## 不做的事

- **不做**日 K 级别缠论（`intraday` 图不含日 K）
- **不做**严格版特征序列 + 线段分类破坏（用简化 break 判定）
- **不做**交互 quiz / 用户手动标注对照
- **不做**独立 `chan` 图类型（嵌入 `intraday`）
- **不做**服务端 toggle 优化（Chan 每次都算，不看请求参数）——避免 round-trip
- **不做**多市场特化（沿用 `intraday` 图已有的市场支持，US / HK / A 一视同仁）
- **不做**新增外部依赖（缠论算法全部本地 TS 实算，跟现有指标一致）
- **不做**跨级别联立分析（如"m15 一买对齐 m5 一段线段完成"）——留待后续观察需要
