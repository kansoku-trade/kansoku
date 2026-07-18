# 无分析 symbol 直接进 K 线图（预览驾驶舱）设计

日期：2026-07-13

## 背景与目标

现状：打开一只没有任何 intraday 分析的股票，`SymbolCockpit` 渲染一个空态页（"这只股票还没有 intraday 分析" + AI 生成按钮 + 返回列表），用户看不到任何行情。

目标：删掉这个空态页。无分析时直接进入和正式驾驶舱同款的 K 线图界面，图表走实时 WS 推送；右侧面板保留完整 tab 结构，「预测」tab 变成生成分析的 CTA。分析生成完毕后自动切换到正式分析图。

## 关键决策（已确认）

1. **预览图不落盘**。不自动创建 chart doc，避免污染分析时间线和复盘记录。服务端现拉现算，纯内存。
2. **右侧完整侧栏**。「环境」「消息」「复盘」「AI 点评」照常可用（数据源都按 symbol 现拉，不依赖 doc）；只有「预测」tab 换成 CTA 卡片。
3. **实时走 WS**，不用前端轮询。复用现有的长桥 K 线推送 + 轮询兜底机制。

## 服务端设计

### 新增 `preview` WS 频道

- `packages/core/src/realtime/channelProtocol.ts`：`WsSub` 增加 `kind: "preview"`，必带 `symbol`；`parseWsMessage` 和 `attachChannel` 各加一个分支。桌面端 IPC 与 Web WS 共用这套协议，改一处两端同时生效。
- `packages/core/src/realtime/charts.ts`：新增 `subscribePreview(symbol, push)`。

### subscribePreview 行为

1. key 为 `preview:${normalizeSymbol(symbol)}`，同一 symbol 的多个订阅共享一份状态；最后一个订阅者断开时整体拆除（沿用 poller 的 onStop 机制）。
2. 首次订阅：调 `buildChart({ type: "intraday", symbol, session: "intraday" })` 现建一张无预测图（`prediction: null`，`session: "intraday"` 与 intraday-signal 的预览约定一致，去掉盘前/夜盘 bars），把返回的 `input` 留在内存，推初始 `{ type: "data", data: { built } }`。
3. 之后完全复用现有 candle-state 机制：订阅长桥 5m/15m/1h candlestick 推送、`mergeCandleBar` 合并、250ms 防抖重建、轮询兜底（`mergeFreshBars` 收敛）。
4. 重构点（唯一）：现有 `runPushRebuild` 与轮询 task 每次重建前 `loadChart(state.id)` 读磁盘 doc。把"取当前 doc"抽象为状态上的数据源——持久图继续走 `loadChart`，预览图走内存里保存的 `input`（含最初拉到的 news / options_levels / event_risk，重建时 options 与 event risk 照旧现刷）。
5. 预览推送的 data 不带 `prediction_updated_at` / `prediction_stale`（无预测可言）。

### 不新增 HTTP 端点

初始数据直接由 WS 首推送达，前端无需先 GET。

## 前端设计

### 新 hook `useIntradayPreview(sym)`

订阅 `{ kind: "preview", symbol: sym }`（经 `wsHub.subscribeChannel`），返回：

- `built`：最新重建结果（`IntradayBuilt`）
- `error`：频道报错信息（非法 symbol、行情拉取失败）
- `degraded`：连接降级标记（沿用 useSSE 的语义）
- 周期切换状态复用 `resolveIntradayTf` 的现有逻辑

### 新组件 `web/src/pages/cockpit/PreviewCockpit.tsx`

`SymbolCockpit` 中 `latestChecked && !latestId && !latestError` 分支改为渲染此组件（`SymbolCockpit.tsx` 已近 300 行，预览态独立成文件）：

- 布局与正式态同款 `fullpage`：顶栏含返回列表、symbol 标题、`IntradayTimeframeSwitch`、`TopbarQuote`。
- 主体 `IntradayDashboard` 吃预览 `built`。
- 右侧侧栏 tab：
  - 「预测」→ CTA 卡片：一句"这只股票还没有 AI 分析"说明 + 现有 `GenerateAnalysis` 组件（按钮 + 运行中 spinner + 错误提示逻辑原样复用）。
  - 「环境」「消息」「复盘」「AI 点评」与正式态一致（复盘的历史分析列表为空是正常态）。
- 预览态没有的元素自然隐藏：`AnalysisTimeline`、「加载后续 K 线」按钮、`ChatDock`（聊天挂在 chartId 上）、「有新分析」badge。
- 与正式态共用的侧栏 tab 构建逻辑抽成可复用的函数/组件，避免两处复制。

### 生成完成后的切换

无需新逻辑：AI 分析写盘后服务端广播 `analysis-created`，`useLatestAnalysis` 已订阅该频道并 `reloadLatest()`，`latestId` 出现即从预览分支切到正式 doc 分支，预览 WS 订阅随组件卸载拆除。

## 错误处理

- 预览建图失败（非法 symbol、provider 报错）：WS 报错 → 页面显示 `ErrorBox` + 返回列表链接（沿用现有错误分支样式）。
- 行情降级（推送断、轮询失败重试中）：沿用现有脉冲小圆点提示。
- `latestError`（查询最新分析本身失败）分支维持现状，不进预览。

## 测试

- core：`parseWsMessage` 的 `preview` 分支单测；`subscribePreview` 单测（mock provider——初始 build 推送、push 合并后重建、多订阅共享、最后退订拆除）。
- 跑 `pnpm test`。

## 不做的事

- 不做预览图落盘、不进分析时间线。
- 不改 `GenerateAnalysis` 的启动/超时/轮询逻辑。
- 不动 SEPA 图与其他 chart 类型。
