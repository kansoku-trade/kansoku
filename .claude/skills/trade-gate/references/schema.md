# trade-gate 决策记录 JSON schema

三种记录类型，落盘路径分别是：

```
journal/decisions/YYYY-MM-DD-SYMBOL-buy.json
journal/decisions/YYYY-MM-DD-SYMBOL-sell.json
journal/decisions/YYYY-MM-DD-patrol.json
```

`journal/` 整个目录被 git 忽略，`journal/decisions/` 目录本身也不存在于仓库里——第一次落盘时若目录不存在，先建目录再写文件。同一天同一只票如果跑了第二次决策（比如上午否决、下午改口再问一次），文件名追加序号：`YYYY-MM-DD-SYMBOL-buy-2.json`。**永远不覆盖已有文件**，序号从 2 开始往上找第一个不存在的文件名。

## 通用字段（三种记录共有）

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | string | 决策发生的美股交易日，`YYYY-MM-DD` |
| `symbol` | string | 标的代码，不带交易所后缀（如 `MU`）；patrol 记录省略此字段，改用 `positions` 数组 |
| `action` | string | `buy` \| `sell` \| `patrol` |
| `key_data` | array | 支撑判定的关键数据点，见下方「key_data 元素」 |
| `executed` | boolean \| null | 执行核对结果，决策当下永远是 `null`，由下次运行时回填；仅适用于 buy 和 sell 记录 |
| `violation` | boolean \| null | 违规判定，决策当下永远是 `null`，由下次运行时回填；仅适用于 buy 和 sell 记录（巡检不是一次决策，没有对应成交） |

### key_data 元素

```json
{ "fact": "MU 现价 $142.30，20日均线 $138", "source": "longbridge kline", "at": "2026-07-14T09:30:00-04:00" }
```

- `fact`：一句话事实陈述，带具体数字。
- `source`：数据来自哪个工具/skill（如 `longbridge kline`、`longbridge-capital-flow`、`korea-market`、`memory`）。
- `at`：数据取得的时间戳（ISO 8601，带时区）。

若某一层因长桥调用失败拿不到数据，`key_data` 里对应条目写 `"fact": "数据未获取到"`，不得用记忆或猜测填充（见 CLAUDE.md 反幻觉规则）。

## 买入记录（`action: "buy"`）

```json
{
  "date": "2026-07-14",
  "symbol": "MU",
  "action": "buy",
  "thesis": "用户原话：为什么会涨",
  "falsifier": "用户写下的证伪条件：什么情况算我错了",
  "scores": {
    "circle": "pass",
    "logic": 2,
    "cycle": 1,
    "technical": 2,
    "position": 1,
    "exit": "pass"
  },
  "soft_total": 6,
  "verdict": "buy_staged",
  "plan": {
    "stop": 58.5,
    "trim_rule": "跌破止损减半，反抽不站上前低清仓",
    "size_cap_usd": 600,
    "staging": "分两批，首批 60%，回踩不破位加第二批"
  },
  "key_data": [
    { "fact": "MU 现价 $142.30，20日均线 $138", "source": "longbridge kline", "at": "2026-07-14T09:30:00-04:00" }
  ],
  "emotion": "有点追高的不安，但逻辑没变",
  "executed": null,
  "violation": null
}
```

### `scores` 字段（六层打分）

对应设计文档「买入漏斗（六层）」：

| 键 | 对应层 | 取值 | 说明 |
|---|---|---|---|
| `circle` | ①能力圈（硬门） | `"pass"` \| `"fail"` | `stocks/{SYMBOL}.md` 六镜头笔记是否存在且非空；`fail` 时终止流程，不产出软分，直接落盘一条 `verdict: "rejected_hard_gate"` 记录 |
| `logic` | ②可证伪逻辑 | `0` \| `1` \| `2` | 有逻辑+有证伪条件=2；只有逻辑没证伪条件=0；逻辑含糊=1 |
| `cycle` | ③估值与周期 | `0` \| `1` \| `2` | 周期见顶清单触发 0–1 条且位置不极端=2；触发 2 条=1；触发 ≥3 条=0 |
| `technical` | ④技术与买点 | `0` \| `1` \| `2` | 量价配合且无未洗净爆仓潮=2；有一项存疑=1；缩量阴跌接飞刀或爆仓潮未洗净=0 |
| `position` | ⑤仓位与集中度 | `0` \| `1` \| `2` | 不加杠杆且加仓后现金未清零=2；现金基本用尽（<本笔金额 50%）=1；需杠杆或超名义上限=0 |
| `exit` | ⑥退出预设（硬门） | `"pass"` \| `"fail"` | 止损位+机械减仓规则是否写死；`fail` 时直接否决，不看软分 |

`soft_total` = `logic + cycle + technical + position` 之和（0–8），仅在两处硬门都 `pass` 时才有意义；硬门任一 `fail` 时 `soft_total` 写 `null`。

### `verdict` 枚举（买入）

| 值 | 触发条件 |
|---|---|
| `rejected_hard_gate` | ① 或 ⑥ 任一硬门 `fail` |
| `rejected` | 硬门都过，`soft_total < 4` |
| `watch` | 硬门都过，`soft_total` 为 4–5（观望或试探仓） |
| `buy_staged` | 硬门都过，`soft_total ≥ 6`（可买，分批） |

### `plan` 字段

只在 `verdict` 为 `watch`（试探仓可选）或 `buy_staged` 时必须完整填写：

- `stop`：止损价，数字。
- `trim_rule`：机械减仓规则，一句话。
- `size_cap_usd`：本笔名义金额上限（美元）。
- `staging`：分批节奏说明。

`rejected` / `rejected_hard_gate` 时 `plan` 整体写 `null`。

## 卖出记录（`action: "sell"`）

```json
{
  "date": "2026-07-14",
  "symbol": "MU",
  "action": "sell",
  "thesis": "用户原话：为什么想卖",
  "falsifier": null,
  "triggers": {
    "hold_plan": { "A": false, "B": false, "C": true, "D": false },
    "cycle_top_list": { "fired_count": 2, "total": 11, "items": ["#1 供给扩张", "#9 消费上限"] },
    "six_category": {
      "logic_falsified": false,
      "valuation_bubble": false,
      "mechanical_trim_due": true,
      "stop_hit": false,
      "opportunity_cost": "问句：有没有更好的去处？",
      "position_imbalance": "问句：这只票占比是否过重？"
    },
    "flush_check": {
      "in_unclean_flush": true,
      "criteria": { "korea_no_new_low_2d": false, "margin_call_ratio_falling": true, "us_dram_volume_up_candle": false },
      "cleared_count": 1
    }
  },
  "verdict": "blocked_by_flush",
  "plan": {
    "stop": null,
    "trim_rule": "洗净后再执行既定减仓比例",
    "size_cap_usd": null,
    "staging": "等三取二条件满足再卖"
  },
  "key_data": [
    { "fact": "SK Hynix 连续两日创新低，未满足条件①", "source": "korea-market", "at": "2026-07-14T21:00:00+09:00" }
  ],
  "emotion": "看着账户回撤有点慌，但纪律说等",
  "executed": null,
  "violation": null
}
```

### `triggers` 字段（卖出专属，替代买入的 `scores`）

- `hold_plan`：6/27 持有计划触发线 A/B/C/D 四个布尔值（A 基本面恶化 / B SMH < $560 / C 连续 3 日机构派发 / D 美联储转向加息）。
- `cycle_top_list`：周期见顶清单（11 条，来源 memory `project-ai-memory-cycle-top-signals`）当前触发数 `fired_count` / `total`，以及触发条目名称列表 `items`。
- `six_category`：原文六分类兜底。前四项（`logic_falsified` / `valuation_bubble` / `mechanical_trim_due` / `stop_hit`）是布尔值，能从数据直接判；后两项（`opportunity_cost` / `position_imbalance`）是问句字符串，列给用户自答，不强行给布尔值。
- `flush_check`：爆仓潮反向保护检查。`criteria` 三项对应 lessons 7-13 的三取二判据：① `korea_no_new_low_2d`（SK Hynix / KOSPI 连续两日不创新低）② `margin_call_ratio_falling`（韩国追保比例回落）③ `us_dram_volume_up_candle`（美股存储链放量阳线）。`cleared_count` = 三项里 `true` 的个数；`cleared_count ≥ 2` 才算洗净（`in_unclean_flush: false`）。

### `verdict` 枚举（卖出）

| 值 | 触发条件 |
|---|---|
| `blocked_by_flush` | `flush_check.in_unclean_flush: true`——无论其余触发几条，爆仓潮未洗净的提示优先，其余判定先挂起 |
| `exit` | 未处于未洗净爆仓潮，且触发条件指向应清仓（如 A/B/C/D 命中且六分类多条同时命中，或止损触及） |
| `trim` | 未处于未洗净爆仓潮，机械减仓到点或部分触发，建议减仓而非清仓 |
| `hold` | 未处于未洗净爆仓潮，触发条件不足以支持卖出动作 |

`flush_check.in_unclean_flush` 为 `true` 时，`verdict` 恒为 `blocked_by_flush`，即使其他触发器显示应该 `exit`——反向保护优先级最高。

### `plan` 字段（卖出）

复用买入相同的四个键，语义按卖出场景调整：`stop` 卖出场景通常为 `null`（止损已经是触发条件之一，不是待设目标）；`trim_rule` 描述具体减仓比例/节奏；`size_cap_usd` 卖出场景通常为 `null`；`staging` 描述分批卖出或等待洗净的节奏。

## 巡检记录（`action: "patrol"`，`journal/decisions/YYYY-MM-DD-patrol.json`）

巡检是对全部持仓的一次性扫描，没有单一 `verdict`——每个持仓各自的触发情况才是输出主体。

```json
{
  "date": "2026-07-14",
  "action": "patrol",
  "flush_check": {
    "in_unclean_flush": true,
    "criteria": { "korea_no_new_low_2d": false, "margin_call_ratio_falling": true, "us_dram_volume_up_candle": false },
    "cleared_count": 1
  },
  "positions": [
    {
      "symbol": "MU",
      "triggers": {
        "hold_plan": { "A": false, "B": false, "C": true, "D": false },
        "cycle_top_list": { "fired_count": 2, "total": 11, "items": ["#1 供给扩张", "#9 消费上限"] },
        "six_category": {
          "logic_falsified": false,
          "valuation_bubble": false,
          "mechanical_trim_due": true,
          "stop_hit": false,
          "opportunity_cost": "问句",
          "position_imbalance": "问句"
        }
      },
      "verdict": "blocked_by_flush"
    }
  ],
  "key_data": [
    { "fact": "长桥持仓：MU/NVDA/SMH/DRAM/QQQM 共 5 个标的", "source": "longbridge positions", "at": "2026-07-14T09:00:00-04:00" }
  ]
}
```

- `flush_check` 提到顶层，因为爆仓潮判据是全局性的（韩国/美股大盘数据），对所有持仓共用一份，不必每个持仓各查一次。
- `positions[]` 每个元素的 `triggers` 结构与卖出记录的 `triggers` 一致（缺省 `flush_check` 字段，因为已提到顶层），外加一个 `verdict`，取值枚举同卖出记录的四值；`hold_plan` / `six_category` 里若某数据源当次没拿到，对应布尔值改写字符串 `"未获取到"` 而非猜测。

## 执行核对回填规则（`executed` / `violation`）

不在决策当下填写，下次任何入口运行时，自动拉长桥**成交记录**，与所有 `executed: null` 的决策记录做 5 个交易日内的比对回填：

| 情形 | `executed` | `violation` | 备注 |
|---|---|---|---|
| 判定「可买/可卖」且成交价/数量在预设内 | `true` | `false` | — |
| 判定「否决/观望/hold/blocked_by_flush」但实际成交了 | `true` | `true` | 附一条 `key_data` 说明实际成交价/量 |
| 判定「可买/可卖」但成交偏离预设（超出 `size_cap_usd`、无视 `staging`、未按 `trim_rule` 执行） | `true` | `true` | 附偏离说明 |
| 过了 5 个交易日仍无对应成交 | `false` | `false` | 放弃执行不算违规 |

回填只追加字段，不改动原有的 `scores`/`triggers`/`plan` 等判定字段——决策记录是判定当下的快照，事后核对是追加的事实层。

## 违规账单统计

"算一下违规账单" 时：读 `journal/decisions/*.json` 全部文件，过滤 `violation: true` 的记录，对每条记录的 `symbol` 调 `longbridge-profit-analysis` 取已实现/未实现盈亏，输出：违规笔数、违规合计盈亏、守规笔数（`executed: true, violation: false`）合计盈亏、两者对比结论。阶段一由 Claude 现场读取 JSON 并计算，不写脚本。
