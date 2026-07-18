# 图表指标图层开关 UI 精简设计

日期：2026-07-09
状态：已确认

## 目标

日内图右上角目前平铺 **12 个** 指标开关按钮（`.chart-indicator-toggles`），默认全开、横向换行，遮挡 K 线且难扫。本设计只改前端显隐 UI/UX，不增删指标种类，不改服务端计算。

**要交付**

1. 把日内指标开关收成可折叠「图层」面板
2. 与 SEPA 共用增强版 `LayerPanel`，交互统一
3. 首次（无 localStorage）采用保守默认：只开参照类
4. 收起态显示 `图层 n/m`（已开数 / 总数）
5. 用户勾选仍写入 `localStorage`（key 不变：`intraday-indicators`）

**不做**

- 不新增 / 删除指标 key
- 不做「清爽 / 技术 / 全开」预设
- 不做分组标题 UI（平铺列表即可）
- 不改 `useIntradayCharts` 的过滤与绘制逻辑（仍按 `toggles[key]` 显隐）
- 不为 SEPA 图层加持久化（保持现状）

## 现状

| 入口 | 组件                                       | 行为                                                               |
| ---- | ------------------------------------------ | ------------------------------------------------------------------ |
| 日内 | `IndicatorToggles` + `useIndicatorToggles` | 12 个常驻 pill 按钮；默认全 `true`；localStorage 持久化            |
| SEPA | `LayerPanel`                               | 可折叠「图层」面板；分组 checkbox；状态在组件内非受控；无 n/m 计数 |

指标 key（保持不变）：

`crosses` · `divergence` · `beichi` · `pattern123` · `candle` · `ai` · `levels` · `fvg` · `ema` · `vwap` · `daylevel` · `optwall`

## 选型

**增强共用 `LayerPanel`（方案 A）**

- 扩展现有折叠面板，支持受控 checked、收起标题显示已开数、可选无分组
- 日内删掉平铺 `IndicatorToggles`（或薄封装后删除），直接用 `LayerPanel`
- SEPA 同步吃到 `图层 n/m`，两处视觉一致

备选 B（只改日内）改动更小但两套 UI 分叉；备选 C（新 Popover）多一套组件。均不采纳。

## 交互

### 位置

- 主图右上：`top: 8px; right: 8px`（与现 SEPA 图层一致）
- 与左侧 drawing 工具栏、时间框架切换不抢位
- 默认 **收起**，打开图表时不挡图

### 收起态

- 文案：`图层 n/m` + 右箭头（`ChevronRight`）
- `n` = 当前为 true 的项数，`m` = 列表总项数
- 点击整块标题行展开 / 收起

### 展开态

- 标题行：`图层 n/m` + 下箭头（`ChevronDown`）
- 下方平铺 checkbox 列表，**无分组标题**
- 每行：`checkbox` + 可选色点（`lp-swatch`）+ 中文标签
- 列表 `max-height ≈ 70vh`，超出可滚
- 勾选即时生效，无「应用」按钮

### 列表顺序（上 → 下）

偏「常开参照在上、信号在下」：

1. `ema` — EMA 均线
2. `vwap` — VWAP
3. `levels` — 价位线
4. `daylevel` — 日内参照位
5. `fvg` — FVG 缺口
6. `pattern123` — 123 结构
7. `optwall` — 期权墙
8. `crosses` — 金叉死叉
9. `divergence` — 自动背离
10. `beichi` — 自动背驰
11. `candle` — K线形态
12. `ai` — AI 标注

色点：有固定系列色的项（如 EMA、VWAP）传 `color`；纯标记类可用中性色或沿用现有主题 token。

### 无障碍

- 标题行可聚焦，Enter / Space 切换展开
- checkbox 用原生控件保焦点与读屏
- 面板 `aria-label="图层"`（或等价）

## 默认开 / 关

**仅当 localStorage 无有效记录时** 使用新默认；已有用户数据 **不强制覆盖**。

| 默认开                              | 默认关                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `ema`、`vwap`、`levels`、`daylevel` | `fvg`、`pattern123`、`optwall`、`crosses`、`divergence`、`beichi`、`candle`、`ai` |

合并规则（与现状一致并明确）：

- 坏 JSON / 读失败 → 回退完整默认对象
- 未知 key 忽略
- 缺 key 用该 key 的默认值（新加 key 时不丢旧偏好）

## 组件与数据流

### `LayerPanel` 增强（`apps/web/src/charts/LayerPanel.tsx`）

对外接口演进为支持受控用法，SEPA 可继续半非受控兼容：

```ts
interface LayerItem {
  key: string;
  label: string;
  color: string;
  toggle: (v: boolean) => void;
}

interface LayerGroup {
  title?: string; // 可选；无 title 时不渲染分组标题行
  items: LayerItem[];
}

interface LayerPanelProps {
  groups: LayerGroup[];
  /** 受控：key → 是否开启。传入则由外部管状态 */
  checked?: Record<string, boolean>;
  /** 未传 checked 时内部 state 的缺省（默认 true，兼容 SEPA） */
  defaultChecked?: boolean;
  /** 收起/标题文案前缀，默认「图层」 */
  title?: string;
  /** 初始是否收起，默认 true */
  defaultCollapsed?: boolean;
}
```

行为：

- 标题展示：`${title} ${onCount}/${totalCount}`（total = 所有 group items 数；on = checked 为 true 的数；未出现在 checked 的 key 按 `defaultChecked` 计）
- 受控：点击 checkbox 调用 `item.toggle`，显示值读 `checked`
- 非受控（SEPA 现状）：内部 `useState` 记勾选，并调用 `item.toggle`

### 日内接线

- `useIndicatorToggles`：
  - `defaultToggles()` 改为上表保守默认
  - 导出有序列表常量（如 `INDICATOR_TOGGLE_ORDER`）供面板渲染顺序
  - `STORAGE_KEY`、`toggle`、merge 逻辑保持
- `IntradayDashboard`：用 `LayerPanel` 替换 `IndicatorToggles`，传入单 group（无 title）、`checked={toggles}`、每项 `toggle` 映射到 `onToggle(key)`
- 删除 `IndicatorToggles.tsx`（若无其它引用）
- CSS：移除 `.chart-indicator-toggles*`；统一用 `.layer-panel`

### SEPA 接线

- `useSepaCharts` / `SepaDashboard`：继续传 `groups`；可选把内部 checked 抬成受控以便标题计数正确，或依赖 `LayerPanel` 在非受控模式下自行统计内部 state
- 要求：SEPA 收起态同样显示 `图层 n/m`
- 不引入 localStorage

### 不改动的路径

- `useIntradayCharts.ts` 中按 `toggles` 过滤 marker / series 的逻辑
- 服务端 `indicators` / build 管线
- drawing 工具栏

## 边界情况

| 情况                | 处理                                         |
| ------------------- | -------------------------------------------- |
| localStorage 损坏   | 回退保守默认                                 |
| 旧存储为「全 true」 | 尊重用户已存偏好，不迁移覆盖                 |
| 新用户 / 清缓存     | 保守默认（4 开 8 关 → 收起显示 `图层 4/12`） |
| 极窄屏              | 面板 max-height 滚动；不改为底部 sheet       |
| SEPA 无项           | `groups.length === 0` 时不渲染（现状）       |

## 验收

1. 打开任意日内图：右上角默认收起，文案含 `图层 n/m`，不铺 12 个 pill
2. 展开后 12 项顺序与「列表顺序」一致，无分组标题
3. 勾选即时显隐对应图层；刷新后偏好仍在
4. 清除 `intraday-indicators` 后：EMA / VWAP / 价位线 / 日内参照位为开，其余为关
5. SEPA 图层面板仍可折叠开关各系列，标题带 n/m
6. drawing 工具栏与主图操作不受影响

## 测试

- 单测（若 web/server 已有同类 hook 测试基建则加；否则以手工验收为准）：
  - `defaultToggles` 仅 4 项为 true
  - `loadToggles`：部分存储 merge、坏 JSON 回退
- 手工：日内 + SEPA 各走一遍验收列表

## 文件触点（实现时）

| 文件                                                             | 动作                                                |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/charts/LayerPanel.tsx`                             | 增强 API + 标题计数                                 |
| `apps/web/src/charts/intraday/useIndicatorToggles.ts`            | 保守默认 + 顺序常量                                 |
| `apps/web/src/charts/intraday/IntradayDashboard.tsx`             | 换接 LayerPanel                                     |
| `apps/web/src/charts/intraday/IndicatorToggles.tsx`              | 删除                                                |
| `apps/web/src/charts/sepa/SepaDashboard.tsx`（及 groups 构造处） | 对齐标题计数 / 受控若需要                           |
| `apps/web/src/styles.css`                                        | 去掉 indicator-toggles 样式；必要时微调 layer-panel |

## 后续（明确不在本次）

- 指标预设（清爽 / 全开）
- 按分组批量开关
- 图层偏好云同步
- 与 drawing 工具合成统一「图上工具条」
