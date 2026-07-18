# 复盘仪表盘整页日期切换 — 设计文档

日期：2026-07-07

## 背景与目标

首页复盘视图（`RecapBoard`）里的「AI 活动」「当日结算」只能看当天：`GET /api/overview/recap` 写死 `easternDate()`，前端请求也不带日期。但 AI 评论和花费其实一直按美东日期持久化在 SQLite（`journal/charts/data/app.db` 的 `comments` / `ai_usage` 表），历史数据完整存在，只是没有入口读。

目标：首页提供**整页级**的日期切换。选中历史日期后，整页进入「历史复盘模式」，图表、结算表、AI 活动全部展示那一天的数据；实时板块（行情条、看盘、持仓）隐藏。

## 现状梳理

| 板块                           | 数据来源                                               | 历史可用性                    |
| ------------------------------ | ------------------------------------------------------ | ----------------------------- |
| 图表区 `CrossSectionCharts`    | `?date=` 已支持                                        | ✅ 现成                       |
| AI 活动（提醒 + 花费）         | SQLite `comments` / `ai_usage`，按 `eastern_date` 索引 | ✅ 数据在，接口没读           |
| 当日结算表                     | `buildRecap(date)` 按创建日筛 intraday 图表            | ✅ 逻辑本身支持任意日期       |
| 预测战绩 `GET /overview/stats` | 全部历史汇总                                           | 与日期无关，保持不变          |
| 行情条 / 看盘 / 持仓           | 券商实时（SSE / 轮询）                                 | ❌ 无历史快照，历史模式下隐藏 |

已知问题：结算表 `day_pct` 取实时报价（`overview.ts:79`），历史日期下会显示今天的涨跌，必须改。

## 设计

### 服务端（`apps/server/src/routes/overview.ts`）

1. `GET /overview/recap` 增加可选 querystring `date`（`YYYY-MM-DD`，用现有 `DATE_RE` 校验，参照同文件 `GET /usage` 的写法）；缺省为 `easternDate()`。
2. `buildRecap(date)` 不变地透传日期到 `listUsage` / `listComments` / 图表筛选（已支持）。
3. **`day_pct` 按日期取数**：
   - `date === 今天`：维持现状（实时报价 `regularPct ?? pct`）。
   - 历史日期：对每个 symbol 拉日 K（`getProvider().getKline(symbol, "1d", N)`），找到该日期的 bar，用 `(close - prevClose) / prevClose * 100` 计算；找不到该日 bar 则为 `null`（前端显示「—」）。
4. **缓存改为按日期分键**：`recapCache` 从单条改为 `Map<date, {at, data}>`；今天的条目 TTL 维持 60s，历史日期的数据不再变化，TTL 可放宽（如 1 小时）并限制 Map 大小（如保留最近 10 个日期）。`recapInflight` 同样按日期分键防止并发重复构建。
5. 历史日期的 outcome 判定沿用现有 `getResolvedOutcomes` 缓存；未缓存且 15m K 线窗口（300 根）已覆盖不到的旧日期，outcome 为 `null`，前端显示「无法判定」——可接受，不额外补历史 K 线。

### 前端（`apps/web/src/pages/`）

1. **日期状态提升到 `Home.tsx`**：读 `useQueryParam("date")`，缺省今天（`marketDate()`）。切换用 `navigate("/?date=...", { replace: true })`，与 `CrossSectionCharts` 现有方式一致。
2. **日期切换器提升为整页级**：把 `CrossSectionCharts` 里的日期 Chip 行上移到页面顶部（`QuoteBar` / `QuickBar` 附近）；`CrossSectionCharts` 不再自带切换器，改为接收 `date` prop。可选日期来源：flow/cohort 图表日期 ∪ 有复盘数据的日期（新增 `GET /api/overview/recap-dates`，取 `ai_usage` ∪ `comments` ∪ intraday 图表的不重复日期）∪ 今天 ∪ 当前选中日期——只靠图表日期会漏掉「那天只有 AI 活动、没跑资金流向图」的日子（实现期在真实数据上验证到 2026-07-06 正是这种情况）。
3. **历史复盘模式**（`date !== 今天`）：
   - 隐藏：`QuoteBar`、`WatchBoard`（含定格）、`PositionsCard`、盘面时段徽标。
   - 显示：`RecapBoard`（传入 `date`）+ `CrossSectionCharts`（同一 `date`），布局用现有盘后布局。
   - 页面副标题标明「YYYY-MM-DD · 历史复盘」。
4. **`RecapBoard` 接收 `date` prop**：
   - fetch 改为 `/api/overview/recap?date=...`。
   - 历史日期时轮询间隔关闭（`useIntervalFetch` 传 `null` 间隔或一次性 fetch）——数据不再变化。
   - 文案随日期变化：「今日复盘」→「MM-DD 复盘」，「今日 AI 花费」→「当日 AI 花费」。
   - 预测战绩块保持全历史汇总，不随日期变。
5. `date === 今天` 时行为与现在完全一致（实时刷新、看盘/持仓照常）。

## 错误处理

- 非法 `date` 参数：服务端返回现有 `ClientError`（同 `/usage`）。
- 历史日期无任何数据（无图表、无评论、无花费）：正常渲染空态（「没有跟踪中的标的」「没有 alert 级提醒」「还没有记录」），不视为错误。
- 日 K 拉取失败：`day_pct = null`，不阻塞整个 recap。

## 测试

- 服务端：`buildRecap` 传历史日期 → usage/alerts/结算按该日筛选；`day_pct` 历史分支用假 provider 的日 K 验证计算与缺 bar 时为 null；`date` 校验拒绝非法输入；缓存按日期分键不串。
- 前端：手动验证 —— 切到 2026-07-06 应看到当天的 AI 花费（有真实数据）与 alert 列表，实时板块隐藏；切回今天恢复实时视图。
- 跑 `pnpm test` 确认无回归。

## 不做的事（YAGNI）

- 跨天汇总视图（如最近一周 AI 花费趋势）——本次不做，留待以后。
- 看盘/持仓的历史快照持久化——不做。
- 为旧日期补拉 15m K 线以补判 outcome——不做。
