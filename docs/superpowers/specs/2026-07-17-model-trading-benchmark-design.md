# 模型股票分析能力 benchmark（@kansoku/bench）设计

日期：2026-07-17
状态：设计已确认，待实施规划

## 1. 目标

做一套通用的模型基准验证工具，测量「Kansoku agent 管线 + 某个 LLM」这个组合的股票交易决策能力。用训练截止之后的真实行情出题（防污染），全部工具 mock、数据写死（可复现），记录完整 trace（工具调用、思考、耗时、成本），最终输出加权评分的排行榜。

不是学术复现，是为实际选型服务：哪个模型接进 Kansoku 的 analyst 角色最靠谱。

## 2. 与现有工作的关系

- **StockBench**（arXiv 2510.02209）测「无工具的组合经理」：20 只道指股、82 个交易日、每天开盘决策一次（加/减/持有）、数据直接塞 prompt。它没有工具调用、没有技术面数据、没有止损/目标价、没有日内、没有过程归因。
- 本工具测「带工具、有纪律约束、要给出止损的交易员」：单次决策质量、真实 agent 工具调用循环、抗噪能力、过程可归因。两者互补。
- 从 StockBench 借鉴：防污染数据窗口 + 题库滚动更新、收益/回撤/风险调整的多指标合成、买入持有基线、每模型多种子重复、消息面消融的思路、市场状态分段报告。
- 从 SWE-bench harness 借鉴：推理与判分解耦（答卷 JSONL 契约）、gold 答卷自检、run_id 断点续跑、错误分类学（基础设施失败 vs 模型失败）、按题隔离的日志目录。

## 3. 测试模式

- **盲盘（blind）**：只给盘面数据——多周期 K 线（OHLCV + 成交额）、资金流分层（主力/散户，属盘面推算数据不算消息）、服务端算好的标准指标数值。无新闻、无基本面、无财报日历。
- **实盘（live）**：盲盘全部内容 + cutoff 前 48h 新闻 + 基本面快照 + 财报日历 + 市场情绪。噪音本身是考点。（2026-07-17 补充：`news` fixture 的数据源是 GDELT + SEC EDGAR 历史回填，见 `backfill-news` 子命令；`fundamentals`/`capitalFlow` 仍留空，未接入历史归档源。）
- 同一份题文件服务两种模式（mock 层决定挂哪些 fixture）。成对得分差 = 该模型的**抗噪分**（被消息面污染的程度）。
- **对抗题**（`adversarial: true`）：新闻情绪与后续走势相反的时点（如 2026-07-14 MRVL：长桥报「指引不及预期」而 8-K 实为超预期、当日 +32.5%）。来源：journal 真实案例 + 脚本筛选。

## 4. 题库

### 4.1 选股（20 只，五层）

| 层 | 标的 | 作用 |
|---|---|---|
| 高波动科技/半导体 | MU NVDA MRVL AMD PLTR TSLA | 趋势与杀跌极端，拉开模型差距 |
| 大盘蓝筹 | MSFT AAPL GOOGL JPM UNH | 考克制力 |
| 防御型 | KO PG | 考「不硬找信号」（对应 TD-NOISE-01），构成观望率对照组 |
| 周期/资源 | XOM CAT FCX | 图形逻辑与科技股不同 |
| 指数 ETF | SPY QQQ SMH IWM | 无个股消息干扰的纯图形题 |

刻意排除 SMCI（低价妖股跳空多，回放判分失真）、JNJ（与 KO/PG 重复）。

### 4.2 两个题库

- **波段题（swing）**：日线级，cutoff 后用 20 根日 K 回放。一期先行。
- **日内题（intraday）**：分钟级，盘前+早盘给数据，当天剩余走势回放。二期。

### 4.3 每题数据量

- 波段题：日 K 250 根（够算 200 日均线）+ 周 K 104 根 + cutoff 时点报价快照 + 5 日资金流。约 2 万 token。
- 日内题：5m 盘前到 cutoff（约 150 根）+ 15m 三天 + 1h 十天 + 日 K 60 根 + 前 5 日同时段 5m 量能序列（relvol 原材料，对应盘中量能对齐纪律）。约 3 万 token。
- 指标口径：原始 OHLCV 全量给 + 服务端（`services/indicators.ts` 等纯函数）算好的标准指标数值一并给，只给数值不给解读。理由：生产环境的 analyst data pack 本来就带算好的指标，benchmark 复现生产形态；且逐根笔算 250 根 MACD 测的是算术不是判断。「纯裸数据」做成二期消融开关。

### 4.4 题目 schema

```json
{
  "id": "swing-MU-2026-03-20-01",
  "bank": "swing",
  "symbol": "MU.US",
  "cutoff": "2026-03-20T20:00:00-04:00",
  "layer": "high-vol-tech",
  "adversarial": false,
  "fixtures": {
    "kline": { "day": [], "week": [] },
    "indicators": {},
    "quote": {},
    "capitalFlow": {},
    "news": [],
    "fundamentals": {},
    "calendar": {}
  },
  "replay": { "horizonBars": 20, "bars": [] }
}
```

- `replay.bars` 物理隔离，runner 拿不到，判分器专用。
- `news` / `fundamentals` / `calendar` 只在 live 模式挂载。
- 题库版本化冻结（一题一文件，目录带版本号）；报告必须写明题库版本。

### 4.5 出题管线（generate）

全脚本化，零手工：`longbridge kline` CLI 的历史日期区间模式拉数据 → 切不重叠窗口 → 产出题目 JSON。自动过滤异常时点（停牌、拆股、财报跳空当日为 cutoff 的窗口）。第一批题人工过目一遍（自建 Verified 步骤——烂题比少题更伤）。旧窗口在进入新模型训练集后退役，题库滚动再生。

## 5. 答题卡与回放判分

答题卡 = analyst 现成的 `submit_prediction` 工具：方向（多/空/观望）+ 入场价 + 止损 + 目标价 + 情景概率。

回放规则（判分器逐条执行，先过 gold 自检再上岗）：

1. 观望 → 走观望正确率通道（事后 horizon 内确实无像样行情则判对）。
2. 方向题：cutoff 后第一根起回放，入场价 3 根内未触及 = 未成交，不计胜负单独记录（挂单过远是失误，比例进报告）。
3. 成交后：先触止损 = 输（−1）；先触目标 = 赢（+实际盈亏比）。
4. horizon 内两者都未触 = 超时，记分 =（最后收盘价 − 入场价）/ 止损距离，正负均按此归一值计（多空取相应符号），上下限截断在 [−1, +实际盈亏比] 内。
5. 同一根 K 线同时包含止损与目标 → 保守判负。

## 6. Mock 工具层

利用 `AnalystDeps` 注入接缝，工具面固定五个，全部确定性、全部困在 fixture 世界：

- `fetch_kline` — 从 fixture 切对应周期最后 N 根，任何参数到不了 cutoff 之后
- `fetch_news` — blind 返回空数组；live 返回打包新闻
- `read_data_pack` — 用 fixture 拼 data pack（live 含资金流/市场情绪，blind 只留量价+资金流）
- `run_code` — QuickJS wasm 沙箱：无网络、无文件系统、内存与时长硬上限、`Date.now` 与 `Math.random` 禁用；题目 K 线数据以变量预载，供模型自主计算自定义指标
- `submit_prediction` — 终局答题卡

明确不挂：`bash`、`read_file`（能摸真实世界，是泄漏通道）。不做预制指标查询工具（`compute_indicator`），计算需求统一走 `run_code`——模型会不会写对指标代码本身是能力的一部分。

**虚拟时钟**：system prompt 里的「今天」= cutoff 当日日期，不是真实运行日，防止模型识破回测语境导致行为变形。

## 7. Runner

当前所有权结构（数据分发细节见 `2026-07-18-bench-dataset-boundary-design.md`）：

```
app/packages/bench/
├── dataset-manifests/ 已发布数据集的公开校验契约
├── src/
│   ├── generate/      出题管线
│   ├── dataset/       路径解析、manifest 与同步器
│   ├── score/         判分器
│   └── report/        报告生成
└── results/           运行结果（按 run_id）

app/pro/src/bench/      私有 runner、mock 工具层与 agent 执行器
kansoku-bench-data/    私有 manifest registry；完整题库位于 GitHub Release assets
```

CLI 形态（照抄 `server/scripts/ai-smoke.ts` 的无头模式：init DB + settings → `getModelsRuntime().getModel()` → 注入 mock deps 调 analyst 入口）：

```bash
pnpm bench run --models anthropic/claude-sonnet-5,deepseek/deepseek-chat \
  --bank swing --mode blind,live --repeat 3 --out results/run-2026-07-20
```

工程决策：

- **答卷 JSONL 契约**：runner 产出标准答卷文件（题 id + 模型 + 模式 + 答题卡 + trace 引用），判分器只认此格式。基线（买入持有/抛硬币/永远观望）由脚本直接生成答卷，零 agent 成本；外部 harness 的结果也能进榜。
- **gold 自检**：从 `replay.bars` 反推事后完美答卷，判分器必须给它接近满分，否则判分器有 bug。
- **断点续跑**：结果按 `(模型, 题, 模式, 第几遍)` 主键落盘，重跑自动跳过已完成组合；`--questions <id>` 点名单题重跑。
- **错误分类**：API 报错/网络超时 → 自动重试不算模型的账；跑完未调 `submit_prediction` 或格式违规 → format-violation 算模型的账；单题超时（默认 10 分钟）→ timeout 算模型的账。
- **并发**：按 provider 分池限流，池间互不排队。
- **Trace**：`agentSession` 的 `onEvent` 订阅者把每条消息、每次工具调用（名称/参数/返回摘要/耗时）、token 用量写成 JSONL，目录 `results/<run_id>/<model>/<question_id>/`。
- **可复现**：run 配置（模型清单、温度、题库版本、评分权重）快照进结果目录。温度按各家官方推荐设置固定并存档。

## 8. 评分体系

**判断分（权重 0.8）**：

- 胜率 = 赢题数 / 出手题数（观望不算出手）
- 期望收益 = 每题平均盈亏（以止损距离为单位；赢记 +实际盈亏比，输记 −1）——防「小赢多次大亏一次」
- 观望正确率 = 观望题中事后确实无行情的比例——防「永远观望」白嫖，也防在慢票上硬出手

**效率分（权重 0.2）**，从 trace 聚合：每题平均耗时（墙钟）、平均成本（USD，`ai_usage` 口径细化到题）、平均工具调用次数（中性指标，报告给分布不做「越少越好」）。

权重写进配置可调。附加指标：**抗噪分**（盲/实成对得分差）、**一致性**（同题 3 次重复中方向不一致的题目比例）。

三个基线同榜：买入持有、抛硬币、永远观望。跑不赢基线的模型直接现形。

## 9. 报告

1. **总榜**：加权总分排名，分项列胜率/期望收益/观望正确率/抗噪分/一致性/耗时/成本/工具调用数，基线同榜。
2. **分层榜**：按股票层（五层）和市场状态（上涨段/下跌段）拆分，暴露偏科。
3. **单题钻取**：每题每模型的决策 + 回放结果 + trace 链接，失败题归因标注（判断错 / 算术错 / 未成交 / 格式违规）。

## 10. 一期范围

1. 波段题库：20 只 × 每只 2~3 个不重叠窗口 ≈ 40~50 题。
2. 模型 3 个（Claude / DeepSeek / Kimi 各一档），盲/实 × 3 重复 ≈ 每模型 300 次会话，验证成本与稳定性。
3. 管线全链路：generate → datasets → runner（含 trace、断点续跑、错误分类）→ score（含 gold 自检）→ report。

二期：题库扩到 100+、模型 6~8 个、日内题库、对抗题批量生成、裸数据消融、纪律注入开/关消融（`promptPolicy` 开关，量化 trading-discipline prompt 对每个模型值多少分）、公开集+保留集两轨制（若开源）。

## 11. 依赖的 core 接缝（已存在，无需改造）

- `AiAgentFactory` / `onEvent`（`ai/agentSession.ts`）— 自定义 agent 构造与全量事件订阅
- `AnalystDeps` 等注入接口 — `fetchKline` / `fetchNews` / `buildPack` / `exec` 全部可覆盖
- `getModelsRuntime().getModel()` / `resolveModel("provider/id:thinkingLevel")` — 17+ provider 换模型零代码
- `services/indicators.ts` / `services/intraday.ts` 纯函数 — fixture 指标预算与判分地面真相
- `submit_prediction`（`ai/analyst.ts`）— 现成结构化答题卡

已知缺口（bench 包内解决，不动 core）：core `getKline` 不支持日期区间——出题管线直接用 `longbridge kline` CLI 历史区间模式；逐工具调用 trace 无现成落库——bench 自带 JSONL 落盘。

## 开源边界拆分（2026-07-17 补记）

原始设计把整个 bench 放在公开的 `@kansoku/bench` 一个包里。此后仓库做了 open-core 拆分：core 里的 AI 实现（`analyst` / `agentSession` / `dataTools` / `modelsRuntime` 等）整体搬进了私有包 `@kansoku/pro`。bench 里驱动模型的那一半依赖这些实现，所以 bench 也跟着按同一条边界拆开：

- **公开框架（留在 `@kansoku/bench`）**：schema、dataset 加载、generate、backfill-news、score（含 gold）、report、baseline 答卷生成，以及这些部分的测试。这些只吃写死的 fixture 和被物理隔离的 `replay.bars`，不碰任何 LLM，谁都能跑。CLI 保留 `generate` / `backfill-news` / `score` / `gold` / `report` / `baseline` 六个子命令；`run` 只打印一句指路（真正执行在 pro）。baseline 虽然逻辑上属于「跑一轮」，但它是机械生成答卷、不调用模型，所以留在公开侧（代码从 `runner/` 挪到纯净的 `baseline/` 目录）。

- **私有 runner（搬进 `@kansoku/pro` 的 `src/bench/`）**：mock 工具链（`read_data_pack` / `fetch_news` / `fetch_kline` / `run_code` / `submit_prediction` 的假数据实现）、`run_code` 的 quickjs 沙箱、`BENCH_ADAPTER_PROMPT`、agent 会话拼装、cell 执行器、并发池、trace 落盘、`run` 子命令（`bench:run` script）。它 import 公开 bench 走仓库里 pro 触达 `packages/*` 的同一套相对路径约定，import AI 实现走 pro 自己的 `src/ai/`。驱动模型的端到端链路测试也一并搬到 pro，在 pro 的 vitest 下跑。

- **公开侧的端到端替身**：原来跨 runner 的 `test/e2e/chain.test.ts` 依赖 runner，随之搬走；公开包换成一个纯链路集成测试（`test/integration/scoreReport.test.ts`）——写死的 predictions 答卷 → score → report 断言，覆盖公开侧能独立验证的那段。

判分口径、fixture 隔离、数据集冻结这些核心设计一个字没变，拆的只是「谁 import 闭源 AI」这条物理边界。
