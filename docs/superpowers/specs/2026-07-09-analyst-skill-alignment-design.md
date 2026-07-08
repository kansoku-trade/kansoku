# in-app 分析与 intraday-signal skill 对齐 + 复盘链路归一 — 设计

日期：2026-07-09
状态：已由用户确认

## 背景与问题

短线预测目前有两条生产线、复盘有四个出口，规则和口径分散：

- **预测生产线**：(1) 对话里裸跑 `intraday-signal` skill（全量：X、财报日历、期权墙、仓位、journal）；(2) in-app 内置 analyst（`app/server/src/ai/analyst.ts`，pi-agent-core），用一份手工复刻的 SYSTEM_PROMPT，产物是精简版（无 journal、无 context、无仓位、无财报日历、无 X）。两套规则文本各自维护，已经漂移。
- **复盘出口**：机械记分板（`/api/overview/stats`）、盘后自动 recap（`journal/YYYY-MM-DD-intraday-recap.md`）、skill Step 7 手写 journal、`journal/lessons.md`。命中率/盈利倍数没有唯一口径。

## 目标

1. 分析纪律只维护一份：`intraday-signal` 的 SKILL.md 是唯一规则源。
2. in-app 手动触发的分析产物质量与对话裸跑 skill 一致。
3. 命中率 / avg_r 只认 `/api/overview/stats` 这一个机械口径。
4. 盘中自动升级不再自动烧钱跑全量分析，只推提醒。

## 设计

### 1. 架构总览

```
预测生产（单一规则源 = intraday-signal SKILL.md）
├── 对话裸跑 skill        → Claude Code 亲自执行
└── in-app 手动按钮       → 内置 agent 读 skill 照做（deepDive 同款模式）

盘中自动链路（轻量层，不产预测）
├── commentator 点评      → 保持现状
└── escalate              → 只 emitNotice 推提醒（30 分钟冷却），不再自动跑分析

复盘（机械口径单源 = /api/overview/stats）
├── 盘后自动 recap        → 增加当日记分板一节（从 aggregateStats 抄）
├── skill journal Step 7  → 只抄 stats，不自己算数
└── lessons.md            → 手工沉淀，不变
```

### 2. analyst.ts 重做（deepDive 模式）

- SYSTEM_PROMPT 缩到十行内：身份 + "调用 `read_skill` 读 `intraday-signal`，严格照其流程执行" + 载体差异清单：
  - X（twitter-reader）不可用 → 按 skill 规则在报告与 `context.sources_used` 写 "X 未查"，催化日/平静日定级视为临时结论；
  - 报告落地形式为 `append_comment` 一句话结论 + `write_journal` 完整报告。
- 工具集（复用 `deepDiveTools.ts` 的实现与限制）：
  - `read_skill` — 读任意 skill 全文（沿用 `services/skills.ts`）。
  - `bash` — 跑 `longbridge` CLI、`.claude/skills` 下的 python 脚本、`curl http://localhost:5199`；沿用禁写文件限制（无重定向/tee/rm/mv/cp）。
  - `read_file` — 读仓库文件（lessons.md 等）。
  - `read_data_pack` — 保留，作加速器：一次拿齐多周期摘要 / 期权墙 / lessons / event_risk / 大盘 / 持仓，省多次 bash 往返。
  - `append_comment` — 保留。
  - `write_journal` — 新增：只允许写 `journal/YYYY-MM-DD-<SYM>-intraday.md`（当日美东日期 + 本标的），同日已存在则追加带时间戳的小节，不许覆盖。
  - `submit_prediction` — **删除**。落图走 skill 原生的 `curl POST/PATCH /api/charts` 路径。
- 落图后 agent 需把 chartId 告知 `append_comment`（comment 关联 chartId 的现有逻辑保留：解析 curl 响应由 agent 完成，comment 工具入参增加可选 `chart_id`）。
- 仓位：内置 agent 现在可经 bash 跑 `longbridge portfolio`，与 skill 完全对齐（原"自动重估不给仓位"的例外条款作废）。
- 超时：10 分钟 → 20 分钟（`DEFAULT_TIMEOUT_MS = 1_200_000`）。`runningAnalysts` 去重、usage 记账、`origin` 标记保留。
- 未提交预测（跑完没落图）仍写一条 error comment。判定标准：运行结束时检查本次运行期间是否新建/更新过该标的带 `prediction` 的 intraday chart（原 `state.submitted` 标志改由 store 查询实现）。

### 3. 校验下沉到 API 层

- `validatePrediction`（情景概率合计 ±10、neutral 必须给箱体且包住锚点、long/short 必须有 entry_plan、止损方向、T1 口径盈亏比 <1:1 拒收）从 analyst 工具层挪到 chart 路由：`POST /api/charts` 与 `PATCH /api/charts/:id` 凡带 intraday `prediction` 的请求，不过校验返回 400，`error` 消息逐条列出问题。
- 效果：对话裸跑 skill 与 in-app agent 走同一道硬闸；提交方看到错误信息可自我修正后重试。
- `validatePrediction` 函数本体移到 server 共享位置（如 `services/predictionRules.ts`），analyst.ts 不再持有。

### 4. 数据补齐

- 未提交的 `services/events.ts`（`longbridge finance-calendar` 财报日 + 3 星宏观时刻表，带缓存）接入：
  - `ReassessPack` 新增 `event_risk: IntradayEventRisk | null`；
  - intraday chart 构建时附到 `meta`（侧栏可见）。
- SKILL.md 增加一节 **Runner notes**：说明 in-app 载体的差异映射——哪些步骤可用 `read_data_pack` 快照替代（K 线预览、期权墙、lessons、财报/宏观日历、大盘对齐、持仓）、X 缺位如何标注、报告经 `write_journal`/`append_comment` 落地。
- 移除 analyst 旧 prompt 里"快照没有财报日历"的兜底说法（随 prompt 重写自然消失）。

### 5. scheduler 改动

- `handleSymbol` 的 escalate 分支：`deps.runAnalyst(...)` 替换为 `emitNotice`，通知带 commentator 给出的升级理由，提示用户手动点按钮或对话里跑 skill。
- 30 分钟冷却逻辑（`escalationOnCooldown`）改为约束提醒频率，避免刷屏。
- `aiConfig().analystModel` 保留，供手动按钮使用；`POST /:sym/reassess` 路由不变。

### 6. 复盘归一

- 唯一机械口径：`aggregateStats`（win_rate / avg_pct / avg_r，按方向与来源分桶）。
- 盘后 recap（`ai/recap.ts`）新增"当日记分板"一节：当日样本数、命中/止损/守区间/破区间分布、win_rate、avg_r，数据来自与 `/api/overview/stats` 相同的聚合函数。
- skill Step 7 维持"抄 `GET /api/overview/stats`，不自己算"（现状已如此，spec 明确为唯一口径）。
- lessons.md 手工沉淀流程不变。

### 7. 测试

- `analyst.test.ts`：mock agent 改走 read_skill → bash → curl 流；工具层不再有 prediction 校验断言。
- 校验测试迁到 route 层：POST/PATCH 带坏 prediction（概率不合计、neutral 无箱体、盈亏比不足）→ 400 且错误可读。
- `write_journal` 工具测试：路径约束、同日追加不覆盖。
- scheduler 测试：escalate → notice（不再调 runAnalyst），冷却约束提醒频率。
- recap 测试：记分板小节断言。
- datapack 测试：`event_risk` 字段接入。

## 不做的事

- 不做 headless Claude Code 子进程方案（评估过，选择保留内置 agent）。
- 不改 commentator 层与触发检测。
- 不动 lessons.md 的手工沉淀方式。
- 不迁移历史 chart 数据。

## 风险

- 内置 agent 拿到 bash 后步数变多，单次分析耗时/花费上升（预计 15–20 分钟）——已通过"升级只推提醒"把自动触发关掉，剩手动按钮，频率可控。
- SKILL.md 是为对话载体写的操作文档，agent 照做时可能踩到载体差异——靠 Runner notes 一节 + 载体差异 prompt 前置声明兜底，漂移时只需改 SKILL.md。
