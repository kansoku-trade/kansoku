# 高级 K 线标注移入 Pro（auto-patterns + options-walls）

日期：2026-07-21
范围：`packages/core` / `packages/pro-api` / `apps/pro`（私有仓库，单独提交）/ `apps/server` / `apps/web`。
关联：2026-07-21-layer-panel-presets-design.md（图层面板预设档，本设计在其上加锁）。

## 目标

把六类标注的算法从公开 core 移入私有 `apps/pro`，做成 Pro 功能：

| feature key | 覆盖图层 | 说明 |
| --- | --- | --- |
| `auto-patterns` | 自动背离、自动背驰、123 结构、SB 结构、K线形态 | 自研检测算法五层 |
| `options-walls` | 期权墙 | CBOE 拉取 + 聚合 |

保持免费：EMA、VWAP、价位线、日内参照位、FVG、金叉死叉、AI 标注。
`.claude/skills/options-levels/`（Python 独立实现）保持公开不动——收费边界只在 GUI。
已知并接受：算法在公开仓库的 git 历史中仍可见，墙的对象是官方构建版用户，不是自行编译者。

## 架构：检测器注册表

沿用 ProHooks 的 seam 模式，新增 `packages/core/src/pro/detectors.ts`：

```ts
interface ProDetectors {
  findPriceDivergence?, findMacdBeichi?, detect123Patterns?,
  detectSecondBreakouts?, detectCandlePatterns?, enrichCandlePatterns?,
  getOptionsLevels?,
}
registerProDetectors(d) / currentProDetectors()
```

- 类型签名放 `packages/pro-api`（公开契约），输出数据类型留在 `packages/shared/types.ts` 不动（web 仍要用）。
- `timeframe.ts` / `orchestrator.ts` / `charts/build.ts` / `realtime/charts.ts` / `datapack.ts` 改为经注册表调用；槽位为空时输出空数组 / null，消费方零改动自然降级。
- 算法文件整体搬到 `apps/pro/src/analysis/`：`timeframe.ts` 内的 `findPriceDivergence`/`macdPushes`/`findMacdBeichi`、`pattern123.ts`、`secondBreakout.ts`、`candlePatterns/`、`patternScoring.ts` 的 `enrichCandlePatterns` 及打分部分、`optionsLevels.ts`。
- 留在 core：`offSessionSignalKeeper`（1-4 类共用的过滤器，泛用工具）、session 分类、`AUTO_SIGNAL_META`、markers/overlay 组装（`markers.ts`）、`capMarkersPerBar`。pro 依赖 core，可直接 import 这些。
- 注册点：`pro.pro.ts` 的 `loadProComposition()` 返回值加 `detectors`，`runtimeInit.ts` 的 `activateProComposition` 里 `registerProDetectors`。

## 授权语义

- 两个 key 进 `pro-api/src/features.ts`，`tier: 'pro'`，走现有 `resolveState`（absent / locked / active）。
- **调用点检查**：注册表调用前查 `featureStates`——非 `active` 时不执行检测（bundle 在但未激活 = locked，同样不算），而非算了不显示。
- **出口剥离**：server 在 `GET /api/charts/:id/built` 与 WS 推送出口，按 feature 状态剥掉：
  - `IntradayTfData` 的 `autoDivergence` / `autoBeichi` / `pattern123` / `secondBreakouts` / `candlePatterns` 字段；
  - `markers` / `priceConnectors` / `macdConnectors` 中 group ∈ {divergence, beichi, pattern123, candle} 的条目及 SB 相关数据；
  - `sidebar.optionsLevels` 与 summary 中的 `divergence_candidates` / `beichi_candidates` / `candle_patterns` / `pattern_123` / `second_breakouts`。
  旧的已落盘图表 JSON 含这些字段，剥离在出口做，免费端拿不到存量数据。桌面 IPC 通道同样处理。
- 免费 AI（datapack / prompt）拿到的对应字段为空，属预期降级。

## Web UI

- `useIndicatorToggles` 的 6 个 key 标注 feature 归属；图层面板对 locked 层显示 🔒，点击走 `useFeature().guard` 弹 license modal，不可勾选。
- 预设档「全部」在免费态只覆盖免费层；「标准」档含 SB（pro 层），免费态自动剔除。locked 层不计入 `N/13` 计数分母（免费显示为 `N/7`）。
- `PredictionTab` 等侧栏读这些字段的位置对空值已有容错，逐一确认即可。

## 测试与验收

- 单测搬家：`pattern123` / `secondBreakout` / `candlePatterns` / `patternScoring`（打分部分）/ `optionsLevels` 移到 `apps/pro/test/`（pro 自有 vitest）。
- core `intraday.test.ts`：golden 比对改为免费路径（检测字段为空）；pro 侧新增注册后的端到端测试沿用原 golden 数据。
- 验收：
  1. 免费 clean checkout（无 `apps/pro`）：build / 测试全绿，图表六层缺失，面板显示 🔒，capabilities 报 absent。
  2. bundle 在但未激活：六层 locked，检测不执行，出口剥离生效，点 🔒 弹激活。
  3. 激活后：六层与现状行为一致（含本次的近期/全部范围开关）。
  4. 旧图表在免费端打开看不到六类标注。

## 提交拆分

public（kansoku）：seam + 出口剥离 + UI 锁 + 算法删除；private（kansoku-pro）：算法落地 + 注册 + 测试。两边分别提交，最后 pin 一个组合。注意 public 提交删除算法后，中间态不可用——两边需在同一个组合里 pin。
