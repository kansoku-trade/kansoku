# Web 双中心信息架构重构设计

日期:2026-07-06
状态:已确认方向,待实施

## 背景与问题

当前 web 端有四个页面:盘面首页 `/`、图表列表 `/charts`、图表详情 `/charts/:id`、个股驾驶舱 `/symbol/:sym`。其中图表详情页和驾驶舱高度重叠——都围绕一只股票展示图表、预测、AI 点评、历史,但入口不同、侧栏能力不同、数据链路各接各的,产生明显的割裂感。

割裂的直接恶果是一个已确认的 bug:驾驶舱 AI tab 点「重新分析」,后端 analyst 完成后通过 `submit_prediction` **新建**一个图表文档(`apps/server/src/ai/analyst.ts` 的 `createChart` 调用),而驾驶舱页面只在打开时一次性拉过 `/api/symbols/:sym/latest`,实时推送订阅的还是旧图表 id,新预测落库后页面不刷新就永远看不到。首次生成分析那条路(`GenerateAnalysis` → `markGeneratedReady`)接了回调,重估这条路没接——同一动作两条路径,一通一断。

用户使用场景是「盘面 + 个股」双中心,两者各占一半。

## 目标

1. 信息架构从「盘面 / 图表 / 个股」三份收敛为「盘面 / 个股」两份。
2. 预测数据流改为按「股票的最新分析」订阅,从机制上消灭重估不刷新 bug。
3. chart skill 的 API 合同(`POST /api/charts`)保持不变,旧链接全部重定向不作废。

## 设计

### 1. 信息架构:三页收敛成两页

**`/` 盘面页**(现 Home):

- 保留现有板块:行情条(QuoteBar)、快捷入口(QuickBar)、观察列表(WatchBoard)、持仓(PositionsCard)、复盘看板(RecapBoard)。
- 新增「横截面图表」区块 `CrossSectionCharts`:当天的 flow / cohort 图直接嵌入渲染(复用 `SimpleChartView`),带日期切换查看历史。现有 `TodayCharts` 组件被它取代。

**`/symbol/:sym` 个股页**(现驾驶舱吸收图表详情页):

- 图表(IntradayDashboard / SepaDashboard)是页面主体,侧栏 tab 保持:预测 / 环境 / 资金 / 消息 / 复盘 / AI / 笔记。
- 顶栏新增**分析时间轴选择器**:默认「最新」,可切到任意一次历史分析;URL 同步为 `/symbol/:sym?analysis=<chartId>`,可分享定位。数据源来自现有 `/api/symbols/:sym/analyses`(现 HistoryTab 的数据)。

**退役页面与重定向**(服务端处理):

- `/charts` → 重定向到 `/`。
- `/charts/:id` → 服务端查该图表文档:
  - 有 symbol 的(intraday / sepa)→ `/symbol/:sym?analysis=:id`
  - 横截面的(flow / cohort)→ `/?date=<该图创建日>`,首页按日期定位图表区块
  - 查不到 → `/charts` 同款 404 提示后回首页
- `POST /api/charts` 请求/响应结构不变,响应里的 `url` 字段由服务端生成为新地址。`.claude/skills/chart/SKILL.md` 及相关文档同步更新 URL 说明,脚本逻辑不动。

### 2. 预测数据流:按「最新分析」订阅

核心概念转换:个股页不再持有某个固定图表 id,而是订阅「这只股票的最新分析」。

- **服务端**:任何新的带 symbol 的分析图表落库时(来源不限:analyst 重估、web 首次生成、Claude 手动出图),通过现有多路复用 WebSocket 广播 `symbol-analysis-created { symbol, chartId }`。
- **个股页**:
  - 处于「最新」模式 → 收到本 symbol 的广播后自动切换:拉新文档、重新订阅该文档的实时重建流。
  - 钉在某次历史分析(URL 带 `?analysis=`)→ 只显示「有新分析」提示,不强制跳转。
- **动作链路统一**:「重新分析」(AiTab)与首次生成(GenerateAnalysis)完成后都依赖同一条广播链路刷新页面;删除 `markGeneratedReady` 专用回调。AiTab 现有的「看到新点评就停转圈」逻辑保留作为运行状态展示,但页面刷新不再依赖它。

### 3. 组件收编与删除

| 组件 | 处置 |
|---|---|
| `SymbolCockpit.tsx` | 成为唯一个股页,吸收 ChartDetail 的图表主体渲染与顶栏(时段切换、驾驶舱链接改为面包屑等) |
| `ChartDetail.tsx` / `ChartList.tsx` | 删除 |
| `HistoryTab` | 改造为时间轴选择器的数据源/展示 |
| `useIntradayDoc` | 增加「跟随最新」模式(接收外部切换 id + 广播触发) |
| `TodayCharts` | 被 `CrossSectionCharts` 取代 |
| `useReassessSymbol` | 保留,去掉完成后的特殊刷新逻辑 |
| `recentCharts`(最近图表记录) | 改为记录 symbol 维度;QuickBar 快捷入口逻辑不变 |

### 4. 边界情况

- 没有任何分析的股票:保留现有 `GenerateAnalysis` 空态(analyst 层未配置时按钮给出提示,现状不变)。
- 旧格式图表文档:保留现有「该图表格式已不再支持」降级提示。
- 钉在历史分析上时该文档不是 live 类型或已无重建流:按现状只读展示。
- 首页 `?date=` 参数无该日横截面图:区块显示空态。

### 5. 测试与验证

- `pnpm test` 全量通过。
- 新增用例:
  1. 旧链接重定向解析(有 symbol / 横截面 / 不存在 三种)。
  2. `symbol-analysis-created` 广播后,「最新」模式自动切换到新文档。
  3. 钉住历史分析时收到广播不被强切,仅出提示。
- 手动验证:驾驶舱点「重新分析」,完成后预测 tab 与图表主体自动更新(原 bug 场景)。

## 不做的事

- 并排/叠加对比历史分析(对照模式)。
- 各看板(WatchBoard / RecapBoard 等)的视觉改版。
- 图表类型本身的增减。
