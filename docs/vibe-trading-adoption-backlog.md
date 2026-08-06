# Vibe-Trading 反哺清单(待办)

日期:2026-07-22
状态:已评估、已核实,全部未开工。本文档是唯一的待办记录,原始调研报告在仓库外,不作为依据。

## 背景

对外部项目 Vibe-Trading(研究型 agentic 金融工作台:ReAct agent + swarm DAG + 87 个 skill + 假设注册表 + 策略衰减监控)做了移植评估,并把关键断言拿当时的代码(kansoku 37cd699)核实过一遍。总判断:**prompt 和 schema 层面的模式激进引进;数据模型层面挑着引进;执行层和多源 fallback 完全不引进。**

## 已核实的事实(写代码前不用再查)

- `IntradayPrediction`(`packages/shared/types.ts`)没有任何叙述性的「什么会证伪这个论点」字段;但图表层已有数值版失效概念(`Pattern123.invalidation`、价位区 kind `'invalidation'`、前端「失效区」渲染)——A1 落地时应连接这套,不另起炉灶。
- 所有落盘的 AI 记录(预测、analyst run、chat、trade-gate verdict)都没有 model/provider 字段,换模型后历史无法追溯(B5 属实)。
- analyst 走 `submit_prediction` 结构化 JSON + `predictionRules.ts` 机械校验,比编号散文强——A2 只对散文输出的 persona(deep-dive、research refresh、commentator)有价值。
- `TD-DATA-01`(不编造)、`TD-VERIFY-01`(四档裁决)已覆盖 A4/A5 的大半,增量只是「skip 必须留格式化痕迹」和「输出前自检」。
- `patternScoring.ts` 已有 0-100 打分体系(`SCORE_FULL_MARKER=65` / `SCORE_DOT_MARKER=45`),A3 引 −5..+5 共振分前要先决定并轨还是换制。

## Tier A —— prompt / schema 级(每条约一天)

- **A1 必填「什么条件会证伪这个论点」**(杠杆最大):`IntradayPrediction` 加 `invalidation: string[]`;trade-gate verdict 加 `killSwitch: string[]`;`ANALYST_SYSTEM_PROMPT` 与 `trade-gate/SKILL.md` 加必填项;`predictionRules.ts` 拒空。与现有数值失效区互相引用。
- **A2 Required outputs 编号 schema**:只加给散文类 persona 的 prompt 收尾段。
- **A3 多镜头 −5..+5 打分 + 共振度**:分析器 fan-in 各发一个 score,`predictionRules.ts` 在共振度低时强制 neutral。前置:定分制。
- **A4 「跳过必须写原因」**:`trading-discipline/SKILL.md` 加 `TD-SKIP-01`(缺数据时输出 `ℹ️ [SKILL]: skipped — [reason]`,绝不推断填补)。
- **A5 输出前三条自检**:加 `TD-SELFCHECK-01`(数据保真 / 逻辑一致 / 风险披露),主要惠及散文类 agent。
- **A6 grounding 预取覆盖审计**:凡接受股票代号的入口(chat、researchRefresh、deepDive)都确保走 `buildReassessPack` 类预取;可抽共享 `resolveSymbolContext()`。

## Tier B —— 小基建(每条约一周)

- **B5 可复现字段**(建议与 A1 同一个 PR 先做):每条落盘 AI 记录加 `provider / model / promptVersion`,写入时填。
- **B1 裁判/汇总 persona**:`personas/aggregator.ts`,吃多个上游输出,按市场状态套权重,出统一 verdict + 共振度;`aiFeed.ts` 加渲染。渲染方式待拍板(新增 row 还是替换 analyst row)。
- **B2 hypothesis 注册表**:`journal/hypotheses/` 每 thesis 一个 JSON(含 `invalidation_notes`、`run_cards[]`、状态流转);trade-gate verdict 与 `IntradayPrediction` 加可选 `hypothesisId`;违规账单可按 thesis 算胜率。
- **B3 引进 execution-model + behavioral-finance 两个 skill**:分市场滑点档(美股大盘 1-3bp 等)与行为偏差量化阈值(月换手 >100% → 过度自信等);trade-gate 接 execution-model 拒掉滑点吃掉收益的进场;违规账单打偏差标签。
- **B4 bench 的 prompt A/B**:runner 加 `promptVariant`,同批 fixture 跑两版 prompt,比 `score.aggregate` 差值。
- **B6 journal 写入前脱敏**:小白名单 `redact()`,永不落 key/token/账号原文。

## Tier C —— 大工程(先写 spec 再动)

- C1 strategy store 数据模型(Artifact / BenchResult / DecaySnapshot,含衰减信号)。前置:bench 能给用户自写策略打分。
- C2 多 agent 编排原语(`personas/pipeline.ts`,DAG + 拓扑分层 + 上游上下文注入)。依赖 B1。
- C3 Alpha 因子子集(GTJA191 + PIT-safe 基本面),配 AST 纯度 + 前视哨兵守卫。依赖 C4。
- C4 `run_code` 沙箱加 AST 纯度检查 + 前视哨兵。

**Tier C 的启动条件:Tier A+B 落地后在 bench 分数上看到 delta 再评估。**

## 明确不做(评估结论,别再议)

- 下单执行 / 券商写入(长桥只读是特性)。
- 多家行情源 fallback 链(2026-07-22 已另行完成干净的单源可插拔 + Yahoo 免费默认源,见 `docs/superpowers/specs/2026-07-22-marketdata-provider-abstraction-design.md`;fallback 链仍然不做)。
- 向量 RAG researcher(现有 datapack + 数据 skill 覆盖足够)。
- PersistentMemory 快照重造(`apps/pro/src/memory/pipeline.ts` 已等价)。

## 开工前待拍板

1. **A1 落点**:直接落 `IntradayPrediction`(倾向此),还是等 B2 一起。若走前者,B2 落地后补 `hypothesisId` 引用即可。
2. **B1 渲染**:aggregator 是新 feed row 类型(更稳)还是替换 analyst row(更净)。
3. **B2 UX**:纯 JSON 落盘,还是 research library 里做「我的假设」页。

## 建议顺序

第一批:A1 + B5(一个 PR)→ 第二批:A4 + A5 + A2(改 skill 与 prompt)→ 第三批:A3(先定分制)→ 之后按 B1 → B3/B6 → B2,四周后重估 Tier C。每批改动前后用同批 fixture 跑 bench,拿 `score.aggregate` delta 当客观量。
