# @kansoku/bench

这是一套给 Kansoku 用的模型交易基准测试工具：测的不是「这个模型聪不聪明」，而是「Kansoku 的 agent 管线接上这个 LLM 之后，交易决策靠不靠谱」。全程走同一套 `analyst` 工具链（`read_data_pack` / `fetch_news` / `fetch_kline` / `run_code` / `submit_prediction`），只是把真实数据源换成写死的 fixture（mock），保证同一道题任何时候重跑都拿到一模一样的行情、一模一样的评分——这样才能在模型之间做公平对比。

出题分两种模式：**盲盘（blind）**只给量价，**实盘（live）**在此基础上提供 cutoff 当时已经可见的事件。只有同一个 question id 同时运行两种模式时，成对得分差才可作为「抗噪分」；v2 pilot 的 blind 与 live 是两组独立样本，不能直接相减。判分只看 `submit_prediction` 交上来的计划，事后拿 `replay.bars`（题目里被物理隔离、runner 摸不到的部分）机械回放。

详细设计动机见 `docs/superpowers/specs/2026-07-17-model-trading-benchmark-design.md`；数据所有权与分发边界见 `docs/superpowers/specs/2026-07-18-bench-dataset-boundary-design.md`；v2 pilot 的 2026 实盘和历史匿名盲盘规则见 `docs/superpowers/specs/2026-07-18-bench-v2-pilot-dataset-design.md`。

## 公开框架与 pro runner 的边界

这个包（公开）只装**纯框架**：出题（generate / backfill-news）、判分（score / gold）、报告（report）、基线答卷（baseline）。这些都不碰 LLM，只吃写死的 fixture 和 `replay.bars`，任何人都能跑。

真正**驱动模型**的那一半——mock 工具链（`read_data_pack` / `fetch_news` / `fetch_kline` / `run_code` / `submit_prediction` 的假数据实现）、`run_code` 沙箱、agent 会话拼装、cell 执行器、并发池、trace 落盘、`run` 子命令——搬进了私有包 `@kansoku/pro`（`app/pro/src/bench/`）。原因是这半边要 import pro 里的 AI 实现（`analyst` / `agentSession` / `dataTools` 等），而那套实现本身是闭源的。

所以 `run` 子命令在公开包里只会打印一句指路：真正跑模型要 `cd app/pro && pnpm bench:run`。`baseline` 留在公开包里，因为它是机械生成的答卷，不需要模型。

## 数据集同步与主要子命令

CLI 入口是 `pnpm --filter @kansoku/bench cli <command>`——`cli` script 本身就是 `vite-node src/cli.ts`（见 `package.json`），所以子命令直接跟在 `cli` 后面，不用再写 `src/cli.ts`。下面是从零跑通一轮的最小序列：

```bash
# 0. 从私有数据仓库下载、校验并安装不可变题库
pnpm --filter @kansoku/bench cli sync-dataset --dataset-version v1

# 1. 跑模型（已搬到 pro 包）：盲盘+实盘各跑一次，每题重复 3 遍
#    公开包里 `bench cli run` 只会指路，真正执行在 app/pro：
cd app/pro && pnpm bench:run \
  --models anthropic/claude-sonnet-5,deepseek/deepseek-chat \
  --bank swing --mode blind,live --repeat 3 \
  --dataset-version v1 --run-id run-2026-07-20

# 2. 基线：零成本生成买入持有/抛硬币/永远观望三条基线答卷，追加进同一个 run
pnpm --filter @kansoku/bench cli baseline \
  --dataset-version v1 --bank swing --mode blind,live \
  --run-id run-2026-07-20

# 3. 判分：把 predictions.jsonl 转成 scores.json
pnpm --filter @kansoku/bench cli score \
  --run-id run-2026-07-20 --dataset-version v1

# 4. 出报告：leaderboard + 分层榜 + 单题钻取
pnpm --filter @kansoku/bench cli report --run-id run-2026-07-20
```

另外还有一个独立于任何 run 的自检命令：

```bash
# gold：从 replay.bars 反推事后最优答卷，判分器必须给它接近满分
pnpm --filter @kansoku/bench cli gold --dataset-version v1 --check
```

`run` 和 `baseline` 写进**同一个** `--run-id` 时会追加进同一份 `predictions.jsonl`——`config.json` 快照只在第一次创建时写入，后续调用（不管是 `run` 还是 `baseline`）发现已存在就跳过，不会覆盖。这也是断点续跑的基础：结果按 `(模型, 题, 模式, 第几遍)` 做主键，重跑同一个 `run-id` 自动跳过已完成的组合，只补跑缺的、以及上次落地为 `api_error` 的那几条。

## 数据集版本化与冻结

发布后的完整题库不进入 `kansoku` Git 历史。公开仓库只保存小型 manifest；完整 JSON 以不可变 `.tar.zst` 资产发布在私有 `kansoku-trade/kansoku-bench-data` Release 中。`sync-dataset` 按 manifest 下载资产，校验字节数与 SHA-256，检查各 bank 的题目数，然后原子安装到本地数据目录。

默认目录如下：

| 用途 | 默认路径 | 显式覆盖 | 环境变量 |
| --- | --- | --- | --- |
| 已发布题库 | `~/.cache/kansoku/bench/datasets` | `--dataset-dir` | `KANSOKU_BENCH_DATA_DIR` |
| 行情与新闻源缓存 | `~/.cache/kansoku/bench/sources` | `--source-cache-dir` | `KANSOKU_BENCH_SOURCE_CACHE_DIR` |

解析优先级为“命令行参数 > 环境变量 > 默认路径”。题目仍按 `<dataset-dir>/<id>/<bank>/<questionId>.json` 组织；报告必须记录数据集 id。manifest 中的 `revision`、Release tag、资产文件名、SHA-256、生成器 commit 和 bank 题数共同定义可复现版本。

出题与回填属于发布前流程，应写入专用 staging 目录，而不是修改已经同步的 Release：

```bash
pnpm --filter @kansoku/bench cli generate \
  --version v-next --windows-per-symbol 3 \
  --dataset-dir ./staging/datasets

pnpm --filter @kansoku/bench cli backfill-news \
  --dataset-version v-next \
  --dataset-dir ./staging/datasets
```

同一个 `(id, revision)` 一旦发布即只读；任何内容修正都必须增加 revision 或创建新的数据集 id，并发布新的 Release 资产。

`backfill-news` 会扫描 `results/` 下的历史 run；若目标 staging 版本已被引用，会打印一致性警告。该警告不构成发布后原地修改的许可。

**`replay` 字段的隔离原则**：题目 JSON 里的 `replay.bars`（还有 `replay.horizonBars`）只有判分器（`loadQuestionForScorer`）会读，runner 侧走的是 `loadQuestionForRunner`，返回的 `RunnerQuestion` 类型在类型层面就没有 `replay` 这个字段——不是「约定不要读」，是运行时那份对象里根本不存在这个 key。模型能看到的永远只是 cutoff 之前的 `fixtures`，事后走势对它是物理不可达的。

## V2 pilot：实盘与匿名盲盘

V2 pilot 分为两个不可混用的数据集：

| Dataset | 允许模式 | Case | 时间与身份规则 |
| --- | --- | ---: | --- |
| `v2-live-pilot` | `live` | 12 | cutoff、40 日回放和事件均为 2026 年；保留真实代码 |
| `v2-blind-pilot` | `blind` | 12 | 源行情可来自 2023—2025 年；发布题面使用合成代码、合成 2026 时间轴，并归一化价量 |

Live 的 250 根日线和 104 根周线历史窗口可以早于 2026 年；这些数据只构成 B0 的历史上下文。Blind 会清空新闻、日历、基本面和资金流，并重新计算指标。源代码、源日期和缩放参数只保存在 bank 目录外的私有审计文件中，不进入模型输入。

同步后的 manifest 策略会限制运行模式：

```bash
pnpm --filter @kansoku/bench cli sync-dataset --dataset-version v2-live-pilot
cd app/pro && pnpm bench:run \
  --dataset-version v2-live-pilot --bank swing --mode live \
  --models anthropic/claude-sonnet-5 --run-id v2-live-pilot-run

pnpm --filter @kansoku/bench cli sync-dataset --dataset-version v2-blind-pilot
cd app/pro && pnpm bench:run \
  --dataset-version v2-blind-pilot --bank swing --mode blind \
  --models anthropic/claude-sonnet-5 --run-id v2-blind-pilot-run
```

两组必须使用不同 run id。它们不是配对样本，因此报告中的 `noiseDelta` 不应跨数据集解释。

发布前批量生成命令如下：

```bash
pnpm --filter @kansoku/bench cli generate-episode-dataset \
  --plan /path/to/plan.json \
  --dataset-dir /path/to/staging/datasets \
  --source-cache-dir ~/.cache/kansoku/bench/sources
```

Episode runner 要求模型在每次交易决策中提交结构化理由：`submit_prediction.decision_reason` 记录入场或观望理由，`advance_trade.reason` 记录持有、改单、撤单或主动退出理由。每条理由由一个主类别和一段简短、可审计的依据组成；缺少理由的调用会被拒绝。Episode HTML 报告及 `episode-report-summary.json` 会按“模型 × 原因类别”统计理由覆盖率、动作分布、入场/成交、胜率、平均净 R 和累计净 R。历史结果中的理由字段保持可选，因此旧 JSONL 仍可读取，但不会被计入理由覆盖。

## 评分口径速览

- **判断分**（权重默认 0.8）= 0.4×胜率 + 0.4×期望收益归一值 + 0.2×观望正确率。胜率只算「出手」的题（观望不计入分母）；期望收益以止损距离为单位（赢记 +实际盈亏比、输记 −1、超时按收盘价相对入场价的比例截断在 [−1, 盈亏比] 之间），归一到 [0,1] 再加权；观望正确率 = 观望题里事后确实没有像样行情的比例，一个模型如果从不观望，这一项会退化用「全场观望正确率的中位数」兜底。
- **效率分**（权重默认 0.2）= 0.5×成本得分 + 0.5×耗时得分，两者都是全场归一（最省的记 1，最费的记 0）；平均工具调用次数只进报告不参与打分。
- **总分** = 判断分权重×判断分 + 效率分权重×效率分，权重写在 `RunConfig.weights` 里，可调。
- **三条基线同榜**：`baseline/buy-hold`（买入持有）、`baseline/coin-flip`（抛硬币，按题目 id 哈希固定多空）、`baseline/always-neutral`（永远观望）。任何模型的判断分排在买入持有基线之下，就是没有跑赢一个不看盘的策略。
- 附加指标：**抗噪分**（`noiseDelta` = 同一批题盲盘判断分 − 实盘判断分，只在两种模式都跑过共同题目时才有值，否则是 `null`）；**一致性**（`consistency`，同题同模式多次重复里方向不一致的题目占比，越低越稳）。

## 一期已知限制

- **`fixtures.news` 现在是真实历史数据，走两条可选的抓取路径**：`backfill-news --news-source doc|archive|auto`。
  - **`doc`**：走 GDELT DOC 检索 API（cutoff 前 48 小时的新闻文章，按标题去重、按时间倒序取前 10 条），有配额但没被限流时最快；单 IP 容易被限流,连续失败会触发熔断（`GDELT_CIRCUIT_BREAKER_THRESHOLD` 次连续失败即跳闸)。
  - **`archive`**：直接下载 GDELT 的原始 15 分钟归档文件（`http://data.gdeltproject.org/gdeltv2/<timestamp>.gkg.csv.zip`），本机 IP 不受 DOC API 的限流影响，代价是要把 cutoff 前 48 小时的整窗文件（每 15 分钟一份，48 小时 = 192 份）全下下来解析，同一个 48 小时窗口在多个标的之间共享时只扫一遍（一次扫描顺带给窗口内所有标的做组织名匹配），提取结果按 `(窗口, 标的)` 缓存成 JSON，重跑不会重扫。标题这条链路里原始文件不带标题，只能从 URL 的路径 slug 反推（连字符转空格、去掉结尾的纯数字 id），标了 `gdelt-arch:<domain>` 以区别于 DOC 路径的 `gdelt:<domain>`。
  - **`auto`**（默认）：先按批用 DOC，一旦触发熔断，剩下的题目自动切到 `archive` 路径，不用手动重跑。
  - 无论走哪条路径，都叠加 SEC EDGAR（cutoff 前 14 天内的 8-K/10-Q/10-K 原始文件，标成 `edgar:<form>`）合并进 `fixtures.news`。指数 ETF（SPY/QQQ/SMH/IWM）没有对应公司主体，`companyQuery`/`cik` 都留 null，不拉新闻——这类题目 `fixtures.news` 会一直是空数组，这是有意为之，不是遗漏。`fixtures.capitalFlow` / `fixtures.fundamentals` 依然是长桥拿不到历史时点快照，留空——这两项还没解决。
- **`backfill-news` 只补新闻，不解决财报日历的前视泄漏**：见下面「日历 fixture 带前视信息」一条，两者是独立问题。
- **日内题库（intraday bank）还没实现**，`generate` 目前只支持 `--bank swing`，`--bank intraday` 会直接报错。
- **对抗题（`adversarial: true`）还没批量生成**，schema 支持这个字段，但一期题库里全部是 `false`。
- **「每模型跑 3 遍」的一致性口径**：`--repeat 3` 是同一份 fixture、同一个 prompt 原样跑三次，测的是模型自身输出的**随机性/稳定性**（同样的信息给三次会不会给出不同判断），不是「三次机会挑最好一次」——三次的结果都会进判断分的分母，一次都不会被丢弃。
- **日历 fixture 带「未卜先知」的前视信息**：`fixtures.calendar` 是出题当下（现在）拉的，里面可能含 cutoff 之后才公布的财报/宏观日程，实盘模式下模型能看到本不该在那个时点知道的未来事件。这是已知的数据泄漏，等接入历史时点的日历归档源后才能修。
- **温度（temperature）只记录、不生效**：`RunConfig.temperatures` 会被原样写进 `config.json` 快照留档，但 runner 目前并不把它下发给模型调用，所以同一个模型在不同温度配置下跑出来的其实是同一套采样设置——这一项暂时只是元数据，不影响实际输出。

## 端到端验证

公开包这边验证的是**判分→报告**这段纯链路：`test/integration/scoreReport.test.ts` 拿一份写死的 predictions 答卷（`test/fixtures/predictions/predictions.jsonl`，两个模型跨三道真实 v1 题）喂给 `score`，再 `render` 出报告，断言每格都判了分、两个模型都进榜、报告能钻取到每道题、summary 通过 schema 校验。跑法：`pnpm --filter @kansoku/bench test`。

驱动模型的整条链路（runner → baseline → score → report，含断点续跑与 gold `--check`）的端到端测试跟 runner 一起搬到了 pro 包，在 `app/pro` 下用它自己的 vitest 跑。
