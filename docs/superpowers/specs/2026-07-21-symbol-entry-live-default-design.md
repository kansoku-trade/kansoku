# Symbol 页默认实时视图 + 最新分析标注叠加 — 设计

日期：2026-07-21
状态：已确认（方案 B）

## 背景与问题

进入 `/symbol/<SYM>` 时，只要这只票有历史分析，页面默认显示「最新一份分析」的冻结快照（`useLatestAnalysis` 默认 `latest` 模式 → `useIntradayDoc` 加载 `doc.built`）。只有当该分析属于今日美东盘时才会开实时订阅（`isCurrentSessionId` 门，客户端 `useIntradayDoc.ts`，服务端 `charts.ts` 的 `subscribeChart`）。最新分析是昨日或更早时——这是常态——K 线永远停在分析时刻，只有一个手动「加载后续 K 线」按钮。

用户期望：进入标的看到的是当下的实时状态；历史分析的结论和标注作为叠加保留。

已有基础：`PreviewCockpit` + `useIntradayPreview` + 服务端 `subscribePreview` 已经是一套跟随行情更新的实时盘面，目前只在「无任何分析」或 `?view=live` 时出现，且构建时不带任何 prediction/context，图上没有分析标注。

## 目标行为

| 入口 | 行为 |
| --- | --- |
| 直接进 `/symbol/<SYM>`，最新分析属今日美东盘 | 照旧显示该分析（本就实时更新、标注齐全） |
| 直接进 `/symbol/<SYM>`，最新分析是旧的（或没有） | 实时预览视图，叠加最新分析的标注与结论 |
| `?analysis=<id>` | 快照回放，原样保留（含「加载后续 K 线」、一键切实时） |
| `?view=live` | 强制实时视图，原样 |
| 盘中生成新分析 | `analyses` WS 广播刷新 latest，新 id 属今日 → 自动切回分析视图 |

实时视图（含 `?view=live` 与弹出小窗）也会叠加最新分析标注，「原样」仅指路由行为不变。

## 设计

### 1. 默认路由（前端）

- `apps/web/src/pages/cockpit/analysisMode.ts` 新增纯函数 `resolveEffectiveMode(mode, latestId, todayEastern)`：当 `mode === 'latest'` 且 `latestId` 的日期前缀（`id.slice(0, 10)`）不等于今日美东日期时，返回 `'live'`；其余原样返回。
- 今日美东日期判定与 `useIntradayDoc.ts` 私有的 `isCurrentSessionId` 逻辑相同——把该判定抽成共享工具（客户端一份即可；服务端已有 `marketdata/session.ts` 的同名函数，不动）。
- `useLatestAnalysis` 返回生效 mode：`latest` 请求照发（判定依赖它返回的最新 id），拿到 id 后按上面的函数降级。降级为 `live` 时 `SymbolCockpit` 现有的 `mode === 'live'` 分支自然接管，渲染 `PreviewCockpit`。
- 判定前（`symbols.latest` 未返回）维持现有「加载中…」；旧分析场景随后进入 preview 构建加载，属可接受的过渡，不做预取优化。

### 2. 标注叠加（服务端）

图上的锚点、入场/止损/目标线、AI 信号标记、侧栏 prediction 全部由 `buildIntraday`（`packages/core/src/analysis/intraday/orchestrator.ts`）根据 `input.prediction` / `input.context` 生成，客户端只消费成品 `built`，因此叠加必须在服务端做：

- `subscribePreview`（`packages/core/src/realtime/charts.ts`）在首次构建 preview 时，查询该 symbol 的最新分析 doc（复用 symbols 服务的 latest 查询），把其 `input.prediction` 与 `input.context` 合并进 preview 的构建输入。
- 轮询/推送重建路径（`state.loadDoc`）每次重新解析最新分析，使盘中产生的新分析在下一次重建时自动换新叠加。
- preview 推送信封的 `data` 分支加 `prediction_updated_at` / `prediction_stale`（复用 `predictionFields` 的口径，基于被叠加的那份分析 doc 计算）。
- 旧分析的信号标记引用历史 K 线时刻，超出 preview 拉取窗口的自然不渲染，不做特殊处理。
- 无任何分析时行为不变（prediction/context 为 null，纯净预览）。

### 3. 侧栏（前端）

- `useIntradayPreview` / `decodePreviewEnvelope` 扩展解码 `prediction_updated_at` / `prediction_stale` 并透出。
- `PreviewCockpit` 的「预测」页：`built.sidebar.prediction` 存在时改用现有 `PredictionTab` 渲染结论（沿用其「生成于 X / 可能过时」stale 提示），下方保留 `GenerateAnalysis`；无分析时维持现在的空态文案。

### 4. 不做的事

- 不加「无标注纯净视图」开关：preview poller 按 symbol 共享，叠加对所有订阅者一致；需要看某份分析的原貌走时间线 → `?analysis=<id>`。
- 不动 `subscribeChart` 的日期门、冻结区间机制、pinned 快照行为。

## 测试

- `resolveEffectiveMode` 单测：今日分析 / 昨日分析 / 无分析 / pinned / 强制 live 五种情况，日期参数注入，不依赖真实时钟。
- 服务端 preview 输入合并单测：有最新分析 → prediction/context 进入构建输入且信封带 stale 字段；无分析 → 保持 null。
- `decodePreviewEnvelope` 新字段单测（已是导出纯函数）。

## 风险

- 入口感受变化：习惯「进来先看最新分析结论」的用户，现在看到的是实时图 + 叠加结论；结论仍在侧栏预测页与图上标注中，时间线一直在右上角。
- `loadDoc` 每次重建多一次最新分析查询，为本地存储读取，成本可忽略。
