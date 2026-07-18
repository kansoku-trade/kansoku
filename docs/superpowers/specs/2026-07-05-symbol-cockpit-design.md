# 标的驾驶舱（Symbol Cockpit）设计

日期：2026-07-05
状态：已批准，进入实现

## 背景

`intraday` 图表目前是"服务端算指标 + AI 写预测 JSON + 仪表盘渲染"，配套 `intraday-signal` 工作流。用户希望把项目里的各路分析能力（资金流、多源新闻、持仓、大盘环境、历史预测沉淀、AI 综合结论）都汇聚到 intraday 场景里，同时改造两个 UI 痛点：右侧栏信息过载、左侧图表指标不能按需开关。

## 核心决定

1. **驾驶舱以标的为锚**：新增 `/#/symbol/<SYM>` 页面，是"活数据模块 + 该标的最新一次 intraday 分析"的聚合视图。现有 `/#/charts/<id>` 存档页保留不动，作为每次分析的冻结快照。
2. **两类数据、两种新鲜度**：
   - 机械类（资金流、大盘对比、持仓浮盈浮亏、历史分析列表、实时报价）——server 按 symbol 现取，不落盘，页面打开即新鲜。
   - 判断类（预测、新闻打标、AI 综合结论）——`intraday-signal` 工作流生成，写进 chart JSON 冻结，带时间戳，沿用现有 stale 机制。
3. **分工线**：server 只做确定性计算和数据搬运，永远不做判断、不调 AI；AI 产出全部进 chart JSON 存档。
4. **多源消息分层拉取**（工作流侧）：
   - 必拉：`longbridge-news`
   - 默认拉：`twitter-reader`（X 情绪）
   - 按需拉：`trump-truth-monitor` / `sec-edgar` / `gdelt` / `fred`，由 AI 按当天情况决定，拉了什么记进 `sources_used`

## 页面布局

### 驾驶舱页 `/#/symbol/<SYM>`

顶部报价条（现有 SSE 实时报价 + 分析时间 / stale 徽章），下面左图右栏。

**左侧图表区**：
- 现有 m5 / m15 / h1 周期 tab，K线 + MACD 副图。
- 新增指标开关栏（图表顶部一排按钮），每项单独显示/隐藏：金叉/死叉、自动背离（紫）、自动背驰（橙）、123 反转结构、AI 信号标注（Pin Bar / 手动背离线）、入场/止损/目标价位线、swing 高低点。
- 开关状态存 localStorage，默认全开。

**右侧栏**：
- 最上方固定"AI 综合结论"卡（不进 tab）：方向徽章 + 一两句"现在该怎么办" + 生成时间。
- 下方五个 tab：
  1. **预测**（默认）——锚点、情景推演、震荡打法、入场计划 R/R、支撑信号列表（现有内容）
  2. **资金流** —— 当天大/中/小单净流入曲线 + 三档分布（活数据）
  3. **消息** —— AI 打标的新闻/公告/X 情绪，每条标来源和时间（冻结）
  4. **持仓 & 环境** —— 浮盈浮亏、离止损/目标距离、纪律提示；SMH/QQQ 同期归一化对比小图（活数据）
  5. **历史** —— 该标的过去每次分析：日期、方向、锚点价、事后判定，点击跳存档页
- 数据缺失的 tab 自动隐藏（如无持仓则不显示持仓段）。

### 存档页 `/#/charts/<id>`

吃到同样的组件升级（tab 侧栏 + 指标开关），但数据全冻结、无活数据模块。

## server 新 API

新增 `apps/server/src/routes/symbols.ts`，全部按 symbol 现取、不落盘：

| 路由 | 内容 | 来源 |
|---|---|---|
| `GET /api/symbols/:sym/flow` | 当天资金流曲线 + 大中小单分布 | longbridge CLI `capital` |
| `GET /api/symbols/:sym/benchmark` | SMH/QQQ 同期分时对比（归一化涨跌幅） | longbridge CLI `kline` |
| `GET /api/symbols/:sym/position` | 持仓、成本、浮盈浮亏、离止损/目标距离 | longbridge CLI `positions` + 最新分析的 entry_plan |
| `GET /api/symbols/:sym/analyses` | 历史 intraday 分析列表 + 事后判定 | `listCharts({symbol})` + kline 复核 |
| `GET /api/symbols/:sym/latest` | 最新一次 intraday 分析全文 | store 现有能力 |

**事后判定（机械算）**：取分析锚点时间之后的 K 线，按方向判断先触及止损还是目标，得 `hit_target / hit_stop / open` 三态 + 锚点至今涨跌幅。server 计算，非 AI 回忆。

## chart JSON：`context` 字段

schema_version → 2。`context` 为可选字段，旧文档（v1）照常读、照常渲染。

```jsonc
"context": {
  "generated_at": "2026-07-06T14:30:00Z",
  "conclusion": {
    "stance": "short",              // long | short | neutral
    "summary": "一句话综合判断",
    "action": "现在该做什么（挂单/等待/减仓）"
  },
  "news": [
    { "time": "...", "source": "longbridge|x|trump|sec|gdelt",
      "tag": "catalyst|regulatory|sentiment|macro",
      "title": "...", "note": "AI 一句话解读", "url": "可选" }
  ],
  "sources_used": ["longbridge-news", "twitter-reader"]
}
```

stale 判定沿用现有机制，`context.generated_at` 与 `prediction_updated_at` 一并纳入。

## `intraday-signal` 工作流升级

1. Step 2 改为分层多源拉取（见"核心决定"第 4 条）；持仓、资金流按需照旧。
2. Step 4 在 prediction 之外新增写 `context`：每条消息打标 + 综合结论卡。
3. Step 5 的 PATCH 一并带 `context`。
4. 报告和 journal 的主链接改为驾驶舱 `/#/symbol/<SYM>`，存档链接附后。

## 落地文件

- `packages/shared/types.ts` —— `context` 类型、schema_version 2
- `apps/server/src/routes/symbols.ts`（新）—— 5 个活数据路由
- `apps/server/src/services/cockpit/`（新）—— flow 转换、benchmark 归一化、持仓计算、事后判定；顺手把 `intraday.ts`（24K）中可复用部分拆出
- `apps/web/src/pages/SymbolCockpit.tsx`（新）+ 现有 intraday 侧栏拆成 tab 化小组件（每个 <300 行）+ 指标开关栏（localStorage）
- `.claude/skills/chart/SKILL.md`、`.claude/skills/intraday-signal/SKILL.md` —— 文档更新

## 测试

- 单测（`pnpm test`）：事后判定方向感知逻辑、benchmark 归一化、`context` 校验、v1 文档向后兼容。
- 手动：起服务用真实 symbol 跑通驾驶舱页与存档页。

## 不在范围内

- 不动 flow / cohort / sepa 三种图表类型。
- 不做全局首页/多标的汇总页（将来另立项）。
- server 不做任何 AI 调用；判断类内容只能由工作流写入。
- 不做"页面上一键让 AI 重新分析"按钮。
