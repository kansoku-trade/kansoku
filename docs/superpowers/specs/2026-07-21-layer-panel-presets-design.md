# 图层面板改版：预设档 + 分组折叠 + 标注范围开关

日期：2026-07-21
范围：intraday 面板（`apps/web/src/charts/intraday/`）及其标注数据链路。SEPA 面板只有少量开关，本次不动。
Mockup：https://claude.ai/code/artifact/717cec81-626e-4bcc-ba25-65c20a381b6e

## 背景与问题

intraday 图表的图层面板（`LayerPanel.tsx`）把 13 个标注开关平铺成一列 checkbox，
用户想快速切换显示密度时必须逐个勾选。后续标注类型还会继续增加，这个交互会越来越差。

另外，"老 K 线不显示标注"目前是服务端生成图表数据时写死的尾部截取——
背离/背驰/123 结构/SB 结构各保留最近 2 个（`timeframe.ts` 的 `slice(-2)`），
K 线形态保留最近 12 个（`orchestrator.ts` 的 `slice(-12)`），更早的出现点直接不进数据，
用户无法选择查看完整历史标注。

## 设计

### 面板结构（自上而下）

1. **标题行**：`图层 N/13`（保留现有计数），点击折叠/展开整个面板（保留现有行为）。
2. **预设档**：三个并排 chip——精简 / 标准 / 全部。点击即把全部图层切到该档的组合。
3. **标注范围**：独立开关一行——`近期 | 全部`，与预设档正交，控制标注显示的历史深度。
4. **自定义图层**：折叠区（默认收起），展开后按三组列出全部 13 个 checkbox：
   - 参照：EMA 均线、VWAP、价位线、日内参照位、期权墙
   - 结构：FVG 缺口、123 结构、SB 结构、K线形态
   - 信号：金叉死叉、自动背离、自动背驰、AI 标注

### 预设档定义

| 档位 | 打开的图层 |
| --- | --- |
| 精简 | ema、vwap、levels、daylevel |
| 标准 | ema、vwap、levels、daylevel、sb（即现有 `DEFAULT_ON`） |
| 全部 | 全部 13 项 |

### 标注范围（近期 / 全部）

- **服务端不再截取**：`timeframe.ts` / `orchestrator.ts` 里的尾部 `slice` 移除，
  全量标注进入图表数据。per-bar 去重与 `capMarkersPerBar` 上限保留（防单根 K 线爆炸）。
- **前端按设置过滤**："近期" = 沿用今天的规则，按 `OverlayGroup` 各保留最近 N 个
  （divergence / beichi / pattern123 / SB：2；candle：12）；"全部" = 不过滤。
  金叉死叉（MACD 副图）与 AI 标注今天就不截取，两档下都全量显示，不受此开关影响。
- 默认值为"近期"，即现状行为。
- 旧的已持久化图表 JSON 里只有截过的标注，切"全部"时显示的仍是存量数据——接受，不迁移。

### 状态规则

- 档位高亮是**派生态**：当前开关组合与某档完全一致时该档高亮，否则无档高亮，
  「自定义图层」行显示「已修改」标记。不单独持久化档位名。
- 手动勾选任意一项 → 组合偏离预设 → 档位取消高亮；再点任意预设即整组覆盖为该档。
- 标注范围与预设档互不影响：切预设不改范围，切范围不改图层组合。
- 持久化沿用现有 localStorage key `'intraday-indicators'`：布尔 map 结构不变，
  新增一个 `markerRange: 'recent' | 'all'` 字段，缺省视为 `'recent'`，老用户数据无迁移。

### 组件改动

- `LayerPanel.tsx`：新增可选的预设区渲染（props 传入 preset 定义与当前组合），
  分组标题沿用现有 `LayerGroup.title`。不破坏 SEPA 的无预设用法——不传 presets 时行为与现在一致。
- `useIndicatorToggles.ts`：新增预设常量（三档的 key 集合）与「整组覆盖」的 setter；
  `IndicatorToggleKey`、labels、colors、storage 逻辑不变。
- `IntradayDashboard.tsx`：把 13 项按上表三组组装传给 `LayerPanel`，接入预设与范围开关。
- `packages/core`（`timeframe.ts` / `orchestrator.ts`）：移除尾部 `slice`，全量输出标注。
- `useIntradayCharts.ts`：attach 标注前按 `markerRange` 过滤（近期档做 per-group 尾部保留）。

## 验收

- 点任一预设，13 个开关一次到位，图表图层即时增减，刷新后保持。
- 手动改一项后档位高亮消失、出现「已修改」；再点预设可恢复。
- 标注范围默认"近期"，显示效果与改动前一致；切"全部"后历史出现点全部可见，无需重新请求。
- 范围开关与预设档互不干扰，各自持久化，刷新后还原。
- SEPA 面板行为与现状完全一致。
