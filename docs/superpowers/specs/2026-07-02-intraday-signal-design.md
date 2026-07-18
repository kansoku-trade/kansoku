# 短线多周期预测仪表盘设计

日期：2026-07-02
状态：已批准，进入实现

## 背景

`chart` skill 现在有 `flow`/`kline`/`cohort`/`sepa` 四种图，其中 `sepa` 是"脚本算确定性指标（均线/RS/量比）+ 渲染，我（AI）写判断性结论（trend template verdict、支撑区、入场计划）"的模式。用户想要一个类似的短线日内工具：5分钟/15分钟/1小时多周期 K 线 + MACD，配合我对短线走势的预测——做多还是做空、预测点在哪、后续可能的多种走势、震荡行情下多空两种打法、盈亏比和具体入场点、有哪些 K 线信号（Pin Bar、MACD 背离等）支撑判断。

## 范围

两个交付物：

1. **`chart` skill 新增 `--type intraday`**——纯渲染层：读取三个周期的 K 线，用纯 Python（无第三方库）算 MACD，渲染 tab 切换的多周期仪表盘；预测内容（方向、情景、入场计划、信号标注）由调用方（我）以结构化 JSON 传入，脚本只负责画。
2. **新 workflow skill `intraday-signal`**——独立工作流，负责拉数据、驱动我完成技术判断、调用 `chart --type intraday` 两次（预览 + 最终）、输出文字报告、写 journal。

不在范围内：不改动 `market-session-tracker` 或 `sepa-strategy`；不做自动化的 Pin Bar / 背离侦测算法（留给 AI 人工判断）。

## 1. `chart --type intraday` 输入契约

```jsonc
{
  "symbol": "MU.US",
  "name": "Micron Technology",
  "as_of": "2026-07-01T17:18:00Z",
  "timeframes": {
    "m5": [/* ≥60 根 5分钟 OHLCV，longbridge kline 原生格式 */],
    "m15": [/* ≥60 根 15分钟 OHLCV */],
    "h1": [/* ≥60 根 1小时 OHLCV */],
  },
  "position": { "shares": 6, "cost": 303.64 }, // 可选，复用 sepa 的持仓视角
  "prediction": {
    // 可选——省略则为"预览模式"，只看技术面不给结论
    "direction": "short", // long | short | neutral
    "anchor": { "timeframe": "m15", "time": "2026-07-01T17:00:00Z", "price": 1049.81 },
    "scenarios": [
      // 至少2个，probability 必须凑够100
      { "label": "继续探底", "probability": 45, "path": "...", "trigger": "..." },
      { "label": "区间震荡", "probability": 40, "path": "...", "trigger": "..." },
      { "label": "尾盘反弹", "probability": 15, "path": "...", "trigger": "..." },
    ],
    "range_bound_plan": {
      // 有"震荡"情景时才需要
      "condition": "若在 1045-1085 之间来回",
      "long_tactic": "...",
      "short_tactic": "...",
    },
    "entry_plan": {
      // 按 direction 计算 R/R，方向敏感
      "entry": 1049.81,
      "stop": 1030.0,
      "target1_pct": 3,
      "target2_pct": 6,
      "note": "...",
    },
    "signals": [
      // 画成图上标记 + 侧栏列表
      {
        "type": "pin_bar",
        "timeframe": "m15",
        "time": "...",
        "price": 1044.17,
        "bias": "bullish",
        "label": "看涨 Pin Bar",
      },
      {
        "type": "macd_divergence",
        "timeframe": "h1",
        "points": [
          { "time": "...", "price": 1097.0, "macd_value": 12.3 },
          { "time": "...", "price": 1085.0, "macd_value": -4.1 },
        ],
        "label": "顶背离：价格新高但 MACD 走弱",
      },
    ],
  },
}
```

要点：

- **MACD**：EMA12/EMA26/DIF/DEA(9)/HIST，纯 Python stdlib 实现（复用 `_sma` 风格新增 `_ema`），每个周期至少需要 60 根 K 线（`slow+signal` 的安全冗余），不足则报错并给出 hint。
- **R/R 计算按方向区分**：`direction=long` 时 `risk = entry-stop`，`reward = target2-entry`；`direction=short` 时 `risk = stop-entry`，`reward = entry-target2`；`rr = reward/risk`，<2:1 在侧栏标红警告（跟 sepa 一致的纪律）。
- **预览模式**（不传 `prediction`）：脚本仍渲染三个周期的 K 线+MACD，且在 JSON 返回值里附上计算出的技术面摘要——每个周期最新的 DIF/DEA/HIST，以及最近若干个局部高低点（简单的 K 根前后比较法），供我在写 `prediction` 之前读数字用，不用打开 HTML。
- **背离标记**：两个端点各打一个箭头 marker，且在价格图和 MACD 图上各画一条两点虚线连接（如果两个端点都提供了 `macd_value`；否则只在价格图画，MACD 图跳过，不报错）。

## 2. 界面

沿用 `sepa` 的深色仪表盘风格（Lightweight Charts）。主图区顶部是 5分/15分/1小时 tab，切换只是同一套图表实例 `.setData()` 换数据（不是三套实例切显隐），避免隐藏 DOM 的 resize 坑。每个 tab 下是"K线 + MACD 副图"一套面板。入场/止损/目标价位线是绝对价格，三个 tab 都能看到；Pin Bar/背离标记只在各自归属的 timeframe tab 上出现。

侧边栏卡片，从上到下：标题（价格+时间）→ 方向判断（长做多/做空/观望的颜色徽章 + 锚点信息）→ 情景推演（每条列 label/probability/path/trigger）→ 震荡应对（有的话，多空两栏并列）→ 入场计划（entry/stop/T1/T2/R:R，<2:1 标红）→ 支撑信号列表（图标+文字）→ 持仓视角（有仓位的话）→ 免责声明。预览模式下，方向判断卡片换成"预览模式：仅技术面，无预测"提示 + 技术面摘要。

## 3. 新 workflow skill：`intraday-signal`

独立 skill，`.claude/skills/intraday-signal/SKILL.md`：

1. 确认标的（symbol 有歧义则反问）
2. 并行拉 `longbridge kline <SYM>.US --period 5m/15m/1h --count 150 --format json`；按需补资金流三档 / 近期消息面背景（不强制每次都拉）
3. 调 `chart --type intraday`（不带 `prediction`）——预览模式，拿到 MACD 数值和高低点摘要
4. 我读数据写判断：方向+锚点、情景推演（复用 `market-session-tracker` 的三情景纪律）、震荡多空打法、入场计划+R:R、支撑信号（Pin Bar/背离必须指到具体K线）
5. 再调一次 `chart --type intraday`（带 `prediction`），`--open`
6. 输出文字报告，结构对应用户最初提的 5 点（方向+锚点 / 后续走势多种预测 / 震荡多空打法 / 盈亏比+入场点 / K线指标支撑）
7. 写 journal：`journal/YYYY-MM-DD-<symbol>-intraday.md`（同日重跑则追加新的带时间戳的小节，不覆盖），符合仓库"每个 workflow 最后都要落地 markdown"的规矩

护栏（写进 skill 的 anti-pattern）：

- 不给裸判断——方向必须配一个具体锚点价位
- 情景概率必须凑够100%，至少2个
- R:R 必须写明，<2:1 要显式标红警告，不能悄悄略过
- Pin Bar / 背离必须指到具体的时间+价格，不能说"感觉背离了"
- 结尾统一"仅供参考，不构成投资建议"
- 跟 `market-session-tracker` 的分层/出货判断不冲突——这是更短周期、单标的的补充工具，不是替代品

## 落地文件清单

- `chart/scripts/render.py`：新增 `_ema`/`_macd`/`_find_swings`/`_coerce_intraday_timeframe`/`build_intraday_html`/`_render_intraday`，`ALL_TYPES` 加入 `"intraday"`
- `chart/SKILL.md`：补充 `intraday` 类型的文档（输入契约、CLI示例、跟 sepa 一致的写法）
- `.claude/skills/intraday-signal/SKILL.md`：新增
- `.gitignore`：`.claude/skills/*` 的白名单里加一行 `!/.claude/skills/intraday-signal/`，否则新 skill 会被现有的 gitignore 规则吞掉

## 后续追加（同日）

实测跑了一次 MU 之后，用户要求再加三样东西，都已实现：

1. **金叉/死叉自动标记**——纯机械检测（histogram 正负号翻转），画在 MACD 副图的 DIF 线上，跟是否有 `prediction` 无关，预览模式也会显示。
2. **背离（divergence）自动检测**——比较相邻的、已被"确认"的同类型 swing 高点/低点（价格创新高但对应 MACD 值走弱，反之亦然），画连接线 + 标记，紫色，标"自动·顶/底背离（简化版）"。
3. **背驰（beichi）自动检测**——明确是**简化版，非严格缠论**：把 MACD 柱状图切成同号的连续"push"（≥3根），比较相邻同向 push 的柱状图面积总和，后一个 push 面积 < 前一个的90% 且价格创了新高/新低，就判定为背驰。橙色标记，跟背离视觉上区分开。

两个检测器都只能确认"已经走过去"的 swing 点（前后都要有 window 根K线才能确认），所以最新一两根K线永远不会被判定为 swing——这是方法本身的局限，不是 bug；最新走势要靠直接看 `last_dif/last_dea/last_hist` 数值人工判断（MU 7/1 尾盘那根收在全天最低的暴力反转就是例子，背离检测器抓不到它，因为最后一根K线还没法被确认成 swing 点）。

落地文件：`chart/scripts/render.py`（新增 `_find_macd_crosses`/`_find_price_divergence`/`_macd_pushes`/`_find_macd_beichi`/`_auto_pattern_markers`，`_coerce_intraday_timeframe` 和 `build_intraday_html` 相应接入）、`chart/SKILL.md`（补充说明）、`intraday-signal/SKILL.md`（Step 3 补充说明）。
