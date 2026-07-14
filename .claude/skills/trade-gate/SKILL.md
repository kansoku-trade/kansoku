---
name: trade-gate
description: >
  交易决策关卡——任何买入/加仓/卖出/减仓动作发生前，先过一遍写死的检查关卡，
  打分给出判定，判定与实际执行不一致的记为违规，落盘 JSON 供复盘统计。三个
  入口：买入漏斗（六层打分，硬门+软分）、卖出触发器（复用用户既有的 6/27
  持有计划触发线、周期见顶清单、爆仓潮反向保护）、巡检（对长桥全部持仓批量跑
  卖出触发器）。不拦截下单（本仓库长桥只读），约束力来自违规账单而非技术拦截。
  Triggers: 我想买 X、我想加仓 X、我想卖 X、我想减 X、要不要止盈、要不要止损、
  巡检、跑一遍卖出检查、算一下违规账单、我该不该现在动这只票、trade decision
  gate, buy funnel, sell trigger, position patrol, violation ledger.
---

# trade-gate

把交易纪律从"自觉"变成"流程"：买入/加仓过六层打分漏斗，卖出/减仓过触发器
矩阵，巡检模式对全部持仓批量跑触发器。每次决策（含被否决的）落盘一条 JSON；
下次运行时自动核对实际成交、回填是否违规；"算一下违规账单"时统计违规笔数与
盈亏对比。

> **Scope**：本 skill 不下单，只判定+记录。约束力来自"违规的那些亏了多少"这笔
> 账，不来自程序拦截。三种记录类型的完整字段定义见
> [`references/schema.md`](references/schema.md)——本文件只讲工作流，不重复
> 字段表。

## When to use

- "我想买 MU" / "我想加仓 NVDA" → 买入漏斗
- "我想卖 DRAM" / "我想减仓 SMH" / "要不要止盈" → 卖出触发器
- "/trade-gate 巡检" / "跑一遍卖出检查" / 暴跌日主动跑一遍全持仓 → 巡检模式
- "算一下违规账单" → 违规统计（见 Step 6）
- **Not** for 无买卖意图的纯行情/基本面提问——那是 `longbridge-quote` /
  `longbridge-fundamental` 等单一 lens 的事
- **Not** for 第一次认识一只票的六镜头建档——那是 `stock-deep-dive`（本 skill
  的能力圈硬门失败时会反过来调用它）

## Step 0 — 运行前必读

**每次运行，无论走哪个入口，先读 `journal/lessons.md`。** 这是过去复盘沉淀的
教训清单，每一条都是用真实亏损换来的；如果某条教训适用于当前这笔决策，在
输出里明说（如"该止损位已避开某扎堆区，参照 lessons 2026-07-06"）。

同时判断入口：用户话里出现"买/加仓" → Step 1；"卖/减仓/止盈/止损"→ Step 2；
"巡检" → Step 3；"违规账单" → Step 6。入口含糊（比如只说"这只票怎么办"且
用户已持仓）时，先问清是评估买入还是评估卖出，不要猜。

## Step 1 — 买入漏斗（六层）

### ① 能力圈（硬门）

检查 `stocks/{SYMBOL}.md` 是否存在且非空（六镜头笔记）。

- **不存在或为空** → 不打分，直接终止本次流程，落盘一条
  `verdict: "rejected_hard_gate"` 记录（`circle: "fail"`，其余分项字段为
  `null`），然后建议：先跑 `stock-deep-dive` 建立六镜头笔记，笔记建好后再回来
  跑一次 trade-gate。
- **存在且非空** → `circle: "pass"`，继续下一层。

### ② 可证伪逻辑（0–2 分）

问用户一句话："为什么会涨？"+"什么情况算我错了？"（`thesis` + `falsifier`）。

- 逻辑清楚 + 写出证伪条件 = 2
- 只有逻辑，没写证伪条件 = 0
- 逻辑含糊（比如"感觉要涨"） = 1

用户拒绝写证伪条件：不代填、不猜，`falsifier` 记为空字符串，`logic` 按上述
标准打 0 分，照常往下走（这不是硬门，只是拉低软分）。

### ③ 估值与周期（0–2 分）

拉两样东西：

1. 周期见顶清单当前触发数——**从 Claude memory 读取**
   `project-ai-memory-cycle-top-signals` 这条记忆里记录的 11 条信号，逐条核对
   最新状态（不要凭记忆里的旧状态直接报数，凡是能用 longbridge 数据核实的都
   现查一遍）。
2. 股价相对 52 周区间与均线的位置——`longbridge kline <SYM>.US --period day`
   之类调用，判断是否处于历史高位/均线极端偏离。

打分：触发 0–1 条且位置不极端 = 2；触发 2 条 = 1；触发 ≥3 条 = 0。

### ④ 技术与买点（0–2 分）

- 日 K + 分时定性放量/缩量——**对齐前几日同时段成交量再下结论**，不要拿全天
  量粗暴对比分时量（这是 `market-session-tracker` 沿用下来的既有纪律）。
- 检查是否处于爆仓潮未洗净期——三判据同 Step 2 的「反向保护」小节，触发即
  视为技术层减分项。
- 把 `journal/lessons.md` 里跟当前标的/setup 相关的技术教训逐条核对一遍，
  有相关的就在输出里点名。

打分：量价配合且无未洗净爆仓潮 = 2；有一项存疑 = 1；缩量阴跌中接飞刀或处于
未洗净爆仓潮 = 0。

### ⑤ 仓位与集中度（0–2 分）

拉 `longbridge positions --format json` + `longbridge portfolio --format json`
（**不要问用户持仓和现金，直接查长桥**——这是仓库级别的强制规则）。算本笔
加仓后 AI/半导体主线（NVDA/MRVL/SMH/DRAM/QQQM 等高度重叠的持仓）的合计真实
敞口——**按穿透后的合计算，不按单票算**，因为这几个标的对同一条主线有重叠
敞口。

打分：不加杠杆且加仓后现金未清零 = 2；现金基本用尽（<本笔金额的 50%） = 1；
需要杠杆或超出名义上限 = 0。

### ⑥ 退出预设（硬门）

要求用户在下单前写死：止损位（具体价格数字）+ 机械减仓规则（比如"跌破止损
减半，反抽不站上前低清仓"）。

- 任一项写不出来 → `exit: "fail"`，直接否决（`verdict: "rejected_hard_gate"`），
  不再看软分。
- 两项都写出来 → `exit: "pass"`。

### 判定与输出

- 硬门（①⑥）任一 `fail` → `verdict: "rejected_hard_gate"`，`soft_total: null`。
- 两个硬门都 `pass` 时，`soft_total` = ②③④⑤ 四项之和（0–8）：
  - `soft_total ≥ 6` → `verdict: "buy_staged"`（可买，分批）
  - `soft_total` 4–5 → `verdict: "watch"`（观望或试探仓）
  - `soft_total < 4` → `verdict: "rejected"`

输出必须包含：六层分项得分（硬门用 pass/fail，软分用数字）、判定、每项依据的
关键数据（带 `source` + `at`，即 `key_data`）、若 `buy_staged` 则附
`plan`（止损、机械减仓规则、名义上限、建议的分批节奏）。然后落盘（见 Step 4）。

## Step 2 — 卖出触发器

对单票（或巡检模式下的每个持仓）逐项检查，任一触发即在输出中高亮并给出对应
动作建议。**不发明新规则，只把用户已有规则编成可执行检查项：**

### 1. 6/27 持有计划触发线 A/B/C/D

来源：用户 2026-06-27 定的持有计划（memory
`project-hold-through-plan-2026-06-27`）。四条线：

- A 基本面恶化——查 `longbridge-fundamental` / 财报数据
- B SMH < $560——查 `longbridge quote SMH.US`
- C 连续 3 日机构派发——查 `longbridge-capital-flow`
- D 美联储转向加息——查 `fred` 联邦基金利率/点阵图相关序列

四个布尔值都要给出，拿不到数据的那项写"未获取到"，不猜。

### 2. 周期见顶清单触发数（11 条）

同 Step 1③，从 memory `project-ai-memory-cycle-top-signals` 读取 11 条信号，
现查触发状态而非照抄旧记忆里的数字。触发数变化时，按用户自己定的减仓规则
给建议（比如"触发数从 2 条变 3 条，按既定规则该减一档"）。

### 3. 原文六分类兜底

- `logic_falsified`（逻辑证伪）——对照买入时写的 `falsifier` 是否已经发生，
  能从数据判
- `valuation_bubble`（估值泡沫）——能从数据判
- `mechanical_trim_due`（机械减仓到点）——对照买入时的 `trim_rule`，能从数据判
- `stop_hit`（止损触及）——对照买入时的 `stop`，能从数据判
- `opportunity_cost`（机会成本）——列为问句，让用户自答，不强行给布尔值
- `position_imbalance`（仓位失衡）——列为问句，让用户自答

### 4. 反向保护——爆仓潮检查

无论以上触发几条，都先查这一项。判据（来源 `journal/lessons.md` 2026-07-13
那条教训，三取二 = 洗净）：

1. SK Hynix / KOSPI 连续两天不创新低——用 `korea-market` skill 查
2. 韩国追保比例掉头回落——用 `korea-market` skill 查
3. 美股存储链放量阳线——用 `longbridge` 查 MU/美光供应链相关标的

三项里满足 ≥2 项才算洗净。**未洗净时**（`in_unclean_flush: true`），无论
上面 1–3 触发几条，判定恒为 `verdict: "blocked_by_flush"`，并在输出里附上
提示："不要卖在爆仓潮里，要卖在洗净后的反弹里"——这条反向保护优先级高于其他
所有触发信号。

韩国数据取不到时，`flush_check` 输出"未获取到"，不阻塞主流程（既不算洗净也
不算未洗净，只是提示这块信息缺口，`verdict` 按其余触发器正常判定）。

### 判定

未处于未洗净爆仓潮时，综合 1–3 的触发情况给出：`exit`（应清仓）/
`trim`（应减仓）/ `hold`（暂不动）。三个类别的具体归类没有额外的数字公式——
参照第 1、2 条触发的严重程度 + 第 3 条命中数量做综合判断，并在输出里写清楚
"为什么是这个判定"，而不是套死板算式（卖出端本来就是复用用户已有规则，不
新增打分体系）。

落盘见 Step 4。

## Step 3 — 巡检模式

触发词："/trade-gate 巡检"、"跑一遍卖出检查"，或暴跌日主动建议跑一次。

1. 拉 `longbridge positions --format json` 取全部持仓。
2. 先跑一次 Step 2 第 4 项（爆仓潮检查）——这是全局性判据，只需要查一次，
   所有持仓共用同一份结果。
3. 对每个持仓分别跑 Step 2 的第 1–3 项，得到各自的 `triggers` + `verdict`。
4. 输出一张汇总表：每个持仓 × 每组触发器的状态（未触发 / 触发 / 数据未获取
   到），触发项展开说明；顶部先亮出爆仓潮检查的全局结论。
5. 落盘一条 `action: "patrol"` 记录（结构见 schema.md，`flush_check` 在顶层，
   每个持仓的 `triggers` 不重复写 `flush_check`）。

## Step 4 — 落盘

三种记录类型（买入/卖出/巡检）的完整字段定义、`verdict` 枚举、`scores` /
`triggers` 结构，全部在 [`references/schema.md`](references/schema.md)，这里
不重复。落盘路径：

```
journal/decisions/YYYY-MM-DD-SYMBOL-buy.json
journal/decisions/YYYY-MM-DD-SYMBOL-sell.json
journal/decisions/YYYY-MM-DD-patrol.json
```

`journal/` 是 git 忽略目录，`journal/decisions/` 子目录当前也不存在——**第一次
运行时若目录不存在，先建目录再写文件**，不要因为目录不存在就跳过落盘。

同日同票第二次决策，文件名追加序号（`-2`，然后 `-3`……），永远不覆盖已有
文件。`executed` / `violation` 两个字段决策当下一律写 `null`，由 Step 5 的
核对逻辑回填。

## Step 5 — 执行核对（不靠自觉汇报）

**每次运行本 skill 的任何入口**（买入/卖出/巡检都算一次运行），开始正式流程
之前，先做一遍这个核对：

1. 找出 `journal/decisions/` 里所有 `executed: null` 的记录，**仅限 `action` 为
   `buy` 或 `sell` 的记录**；`action: "patrol"` 的记录跳过（巡检不涉及买卖执行）。
2. 对每条记录的 `symbol`，拉 `longbridge` 的成交记录（订单/成交历史），比对
   决策日期之后到今天之间是否有对应成交。
3. 按 schema.md「执行核对回填规则」表逐条判定并回填 `executed` / `violation`，
   直接改写对应的 JSON 文件（只追加/修改这两个字段，不动其他判定字段）。
4. 5 个交易日仍无成交的记录，回填 `executed: false, violation: false`（放弃
   执行不算违规）。

这一步是静默的账本维护，不需要单独汇报给用户，除非发现了新的违规（则在本次
运行的输出末尾提一句"顺带核对出一笔违规：……"）。

## Step 6 — 违规账单统计

触发词："算一下违规账单"。

1. 读 `journal/decisions/` 下全部 JSON。
2. 过滤 `violation: true` 的记录。
3. 对每条记录的 `symbol` 调 `longbridge-profit-analysis` 取已实现/未实现盈亏。
4. 输出：违规笔数、违规合计盈亏；守规笔数（`executed: true, violation: false`）
   合计盈亏；两者对比结论（比如"违规的那几笔平均亏 X%，守规的平均赚 Y%"）。

阶段一由 Claude 现场读 JSON 现算，不写统计脚本；如果将来 JSON 文件多到现算
吃力，再补一个 stdlib-only 的统计脚本（不在本次范围内）。

## 错误处理

- **长桥调用失败** → 对应层/对应触发项记"数据未获取到"，该层不给分也不猜，
  判定降级为"观望"（买入端）或该触发项标"数据未获取到"（卖出/巡检端），并在
  输出里注明缺口。**禁止用记忆填数**——这是仓库级反幻觉规则，本 skill 同样
  适用：拿不到实时数据时，绝不能拿 Claude memory 里的旧结论当作本次的
  `key_data`。
- **韩国数据取不到** → 爆仓潮检查输出"未获取到"，不阻塞主流程，`verdict` 按
  其余触发器正常判定。
- **用户拒绝写证伪条件或止损位** → 按硬门规则处理：②记 0 分（不阻塞），⑥
  直接否决（阻塞），两种情况都照常落盘。

## Anti-patterns

- ❌ 能力圈笔记不存在时跳过硬门直接打分——必须先终止并建议跑 `stock-deep-dive`
- ❌ 拿不到长桥数据时用记忆/猜测填 `key_data`，而不是老实写"数据未获取到"
- ❌ 爆仓潮未洗净时仍然给出 `exit`/`trim` 判定——反向保护必须覆盖其他触发器
- ❌ 询问用户持仓/现金/成本价——直接查长桥（`longbridge-positions` /
  `longbridge-portfolio`）
- ❌ 巡检模式对每个持仓重复查一遍爆仓潮判据——这是全局判据，查一次复用
- ❌ 决策当下就填写 `executed`/`violation`——这两个字段只能由下次运行时的
  核对逻辑回填
- ❌ 覆盖已有的决策 JSON 文件——同日同票第二次决策必须追加序号
- ❌ 周期见顶清单直接照抄 memory 里的旧触发状态，不现查最新数据
- ❌ 卖出端发明新的判定规则，而不是复用 6/27 持有计划 / 周期见顶清单 /
  lessons.md 里已有的规则
- ❌ 忘记 `journal/decisions/` 目录首次不存在时要先建目录

## Related skills

- `stock-deep-dive` — 能力圈硬门失败时的补救路径（建立六镜头笔记）
- `longbridge-positions` / `longbridge-portfolio` — 仓位与集中度层、执行核对
  的持仓与账户数据来源
- `longbridge-capital-flow` — 卖出触发线 C（机构派发）、技术层放量定性
- `korea-market` — 爆仓潮反向保护判据①②
- `fred` — 卖出触发线 D（美联储转向）
- `longbridge-profit-analysis` — 违规账单统计的盈亏数据来源
- `market-session-tracker` — 巡检模式的日常延伸场景（暴跌日先跑 patrol 再决定
  是否转入更细的 session 监控）
- `intraday-signal` — 本 skill 的结构模板来源；两者互补而非替代，
  intraday-signal 给方向判断，trade-gate 给纪律关卡
