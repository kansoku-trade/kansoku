# 设计：ECharts 迁移到 Recharts

日期：2026-07-05
状态：已实现（2026-07-05）

## 目标

把 `app/` 里所有非 K 线图表从 ECharts 换成 Recharts，删掉 `echarts` 依赖。视觉上贴合现有暗色设计（GitHub 暗色底、绿 `#22c55e` / 红 `#ef4444`、细网格线、暗色悬浮提示框）。

**不动的部分**：SEPA 仪表盘和短线预测仪表盘的 K 线图继续用 lightweight-charts（Recharts 不支持蜡烛图）。不引入 Tailwind / shadcn。

## 现状

ECharts 有两条使用路径：

1. **图表详情页**（flow / cohort 类型）：服务端 `app/server/src/services/simple.ts` 把原始行数据拼成 ECharts option，存进图表 JSON 的 `built.option`，前端 `EChartsView.tsx` 无脑渲染。
2. **驾驶舱小图**：`FlowTab.tsx` / `EnvTab.tsx` 在前端自己拼 ECharts option，交给 `MiniEChart.tsx` 渲染。

## 方案：改数据契约，服务端只发数据，前端负责渲染

### 契约变更（shared/types.ts）

`EChartsBuilt` 替换为：

```ts
export interface SimpleBuilt {
  kind: "simple";
  chartType: "flow" | "cohort";
  rows: FlowRow[] | CohortRow[];
  subtitle: string;
}
```

- `FlowRow` / `CohortRow` 类型从 `simple.ts` 上移到 `shared/types.ts`。
- cohort 的数据清洗（label 解析、按数值升序排序、非法行报错）仍留在服务端，`rows` 存的是清洗后的结果；前端只做渲染。
- flow 的正负拆分（零点插值）属于渲染逻辑，随迁到前端组件里。

### 服务端（app/server）

- `simple.ts`：删掉 `buildFlowOption` / `buildCohortOption`，保留并导出 cohort 清洗函数；flow 只做行校验。
- `build.ts`：flow / cohort 分支产出 `SimpleBuilt` 而非 option。
- **旧数据兼容**：读取图表 JSON 时若 `built.kind === "echarts"`，用现有 `rebuild()` 从 `input` 重建成新格式再返回（`input.rows` 一直都有，不需要手工迁移文件）。SSE 的 60 秒重建走同一条路径，自然产出新格式。

### 前端（app/web）

新建 `src/charts/simple/` 目录：

- **`FlowChart.tsx`** — 净流入曲线。Recharts `AreaChart`：平滑曲线、面积透明度 0.18、零轴上绿下红（用 SVG `linearGradient` 按零点位置设置 offset 实现单序列变色，替代原来的双序列拆分）、灰色虚线零轴 `ReferenceLine`、时间横轴、暗色 tooltip、底部 `Brush` 替代 dataZoom 滑块。
- **`CohortChart.tsx`** — 横向带符号柱状对比。Recharts 竖排 `BarChart`（layout="vertical"）：每根柱按正负着色（`Cell`）、柱端标注数值、暗色 tooltip。高度随行数自适应。
- **`SimpleChartView.tsx`** — 替代 `EChartsView`，按 `chartType` 分发到上面两个组件，保留 subtitle 与渲染错误提示的现有行为。

驾驶舱：

- **`FlowTab.tsx`** — 手拼 option 改为 Recharts `BarChart`（带符号柱、按正负着色、零轴参考线），沿用现有配色 `#26a69a` / `#ef5350`。
- **`EnvTab.tsx`** — 基准对照改为 Recharts `LineChart` 多序列折线（配色 `#58a6ff` / `#ffc107` / `#ba68c8`）、顶部图例、y 轴百分比格式、零轴参考线。
- 删除 `MiniEChart.tsx`。

依赖：`package.json` 移除 `echarts`，加入 `recharts`。

### 视觉对齐基准

- 轴标签 `#8b949e`~`#aaa`、网格线 `#1f242c`/`#21262d`、轴线 `#666`。
- tooltip：暗底 `rgba(20,24,30,0.92)`、边框 `#333`、浅色文字（与现有 cohort tooltip 一致，统一用到所有图）。
- 详情页图表高度与现在 `.echarts-host` 一致；驾驶舱小图保持 180px。

### 测试与文档

- `cd app && pnpm test`：更新断言 `built.option` 的服务端测试为断言 `SimpleBuilt` 形状；补一条旧格式（`kind:"echarts"`）读取时自动重建的用例。
- 更新 `.claude/skills/chart/SKILL.md` 与 `CLAUDE.md` 中提到 ECharts 的描述。

## 错误处理

- cohort 行缺 `label`/`symbol`：服务端继续抛 `ClientError`（行为不变）。
- 前端渲染异常：`SimpleChartView` 保留现有"渲染失败"错误框。
- 旧格式重建失败（input 损坏）：返回明确错误而非白屏，详情页显示错误框。

## 验收标准

1. 全库搜不到 `echarts` 引用，依赖已删除。
2. 新建 flow / cohort 图表渲染正确：flow 正绿负红分色 + 零轴虚线 + 缩放；cohort 排序、着色、数值标注与迁移前一致。
3. 迁移前创建的旧图表 JSON 打开不报错，自动以新格式渲染。
4. 驾驶舱资金流小图与基准对照小图渲染正确，60 秒轮询刷新正常。
5. `pnpm test` 与改动文件的 typecheck 通过。
