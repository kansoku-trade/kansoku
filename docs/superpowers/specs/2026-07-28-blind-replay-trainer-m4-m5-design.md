# 盲盘训练 M4 + M5：AI 陪练、复盘与统计

日期：2026-07-28
状态：设计已确认，待实现
上游：[2026-07-25-blind-replay-training-design.md](./2026-07-25-blind-replay-training-design.md)（母设计，本文是它 §7 §8 的落地方案）

## 1. 范围

一次做完母设计里的两期：

- **M4 — AI 陪练与标注**：局中手动召唤 AI 给第二意见，局终自动判定它的对错，对判对的那些请求人工标注「理由站不站得住」。
- **M5 — 复盘与统计**：复盘页重放整局，跨局统计面板，教训沉淀通道。

**回流导出（评测集与偏差报告）砍出本期**，理由见 §8。

全部功能属于 Pro。

## 2. 关键发现：工程量比母设计的预估小得多

母设计 §7 把「pipeline 数据注入改造」列为**本设计最大的单项工程**：

> 现有 pipeline 面向实时市场编写，自行拉取长桥、新闻、宏观。必须将数据获取抽成可注入接口。

**这件事在 M2 做 bench mock 时已经顺手完成了。** 现状：

| 现成件 | 位置 | 作用 |
| --- | --- | --- |
| `AnalystDeps` | `packages/core/src/ai/personas/analyst/types.ts:12` | `fetchKline` / `fetchNews` / `buildReassessPack` / `now` 全部可注入 |
| `createMockDeps` | `apps/pro/src/bench/mock/index.ts:113` | 把 analyst 整个接到 `Question` fixtures 上 |
| `composeCellSession` | `apps/pro/src/bench/runner/session.ts:39` | 给定 `RunnerQuestion` → 跑出一个 `Submission` |
| `buildEpisodeQuestionViewAtCursor` | `packages/bench/src/episode/view.ts:104` | 给定 case + 游标 → 截断到那一刻的 `RunnerQuestion` |
| `replayDirectional` | `packages/bench/src/score/replay.ts:43` | 给定三价 + 之后的 bars → win / loss / timeout_flat / no_fill + 实际 R |

最后两个是同一个接口的两头，**只是从没被接上过**。`session.ts` 已经在用 `buildEpisodeQuestionViewAtCursor` 给人渲染图表；M4 要做的就是把同一个函数的输出再喂给 AI 一次。

所以 M4 的真实工作量在别处：锁定顺序、召唤记录的存储结构、判定时机、结算页的对照与标注 UI。

## 3. M4 — AI 陪练

### 3.1 召唤链路

```
点「问 AI」（人已提交方向+三价才解锁）
  → trainerRuntime.coach({ sessionId })
  → buildEpisodeQuestionViewAtCursor(case, state.cursor)   // → RunnerQuestion
  → composeCellSession({ question, mode: 'blind', model, scaffold })
  → 跑出一个 Submission
  → 追加一条 coach 记录到 session 文件
```

**锁定顺序不可妥协**（母设计 §7）：没提交自己的判断之前，「问 AI」是 disabled。开局即可问 AI 的话，训练退化成抄答案，标注也被锚定污染。

解锁后手动触发、不限次数，token 成本由用户自己掌握。

### 3.2 防泄漏

这是本期最需要下功夫的地方，因为**泄漏是静默的**：AI 偷看了未来，表现出来只是「它怎么这么准」，没有任何一环会报错。错误数据会一路流进标注、统计，最后流进「改 prompt」的决策。

三层防御：

**第一层，类型。** `Question` 有 `replay` 字段（未来的可交易段），`RunnerQuestion` **没有这个字段**。coach 链路全程只碰 `RunnerQuestion`，未来在类型上就不存在。

这一层顺带堵死了最危险的一处：`buildRunCodeTool`（`apps/pro/src/bench/mock/index.ts:92`）把 `question.fixtures.kline` **整个塞进沙箱 globals**，绕开工具直接给数据。如果拿到的是原始 `Question`，AI 一行代码就能读到未来。

**第二层，blind 档。** `MockMode = 'blind' | 'live'` 已存在。blind 档下 `buildMockDataPack` 不下发 news / fundamentals / calendar，`fetchNews` 返回空数组。训练器一律 blind——盘面已匿名化，AI 拿不到基本面也是公平的（母设计 §7）。

**第三层，运行时断言 + canary。** 见 §7。

### 3.3 存储

session 文件从 `version: 1` 升到 `2`，加一个 `coach: TrainerCoachCall[]`。读旧文件时缺字段补空数组，已有的局照常能开。

**不另起目录。** 一局的所有东西在一个文件里，M5 扫统计时一次读完，不用 join 两个目录。

```ts
interface TrainerCoachCall {
  id: string;
  cursor: number;                     // 召唤时游标
  askedAt: string;
  humanBefore: TrainerSubmission;     // 召唤那一刻人的判断快照
  ai: TrainerSubmission;              // AI 的判断
  verdict: TrainerCoachVerdict | null;    // 局终才填
  annotation: TrainerAnnotation | null;   // 人工标注
}
```

`humanBefore` 是整个对照实验的支点。没有这个快照，局终时只看得到最终结果，分不清那是人本来的想法还是被 AI 掰过来的。

### 3.4 「改主意」怎么度量

母设计 §8 要「被 AI 说服改主意的胜率 vs 坚持自己判断的胜率」。

引擎允许这个度量成立：`submitEpisode` 只在 `flat` 时有效（`engine.ts:367`），而 `cancel` 和平仓都会把 phase 打回 `flat`（`engine.ts:716,828,842`）——所以一局里可以 submit → cancel → 换方向重新 submit，「改主意」有真实的动作痕迹。

三档判定：

| 情形 | 记为 |
| --- | --- |
| AI 与 `humanBefore` **同向** | 不进对照 |
| **分歧**，且人在归属窗口内按 AI 方向重新 submit | 被说服 |
| **分歧**，归属窗口内人没改方向 | 坚持 |

**归属窗口 = 这次召唤之后、到下一次召唤或局终为止。** 不写死这个窗口的话，一局里召唤三次，人在最后改了方向，三次召唤会同时被记成「说服了他」，一次操作被算三遍。窗口内发生的第一次方向变更归给窗口所属的那次召唤。

同向必须排除。否则「AI 附和我」会被灌水成「AI 说服我」，这个对照实验就废了。

### 3.5 自动判定

**局终一次性批量算**，局中不算——结局还没发生，算了也是错的。

对每条 coach 记录跑 `replayDirectional`：

- 输入：AI 的 `entry_plan` 三价 + **召唤那根之后到 replay 段末**的 bars
- 输出：win / loss / timeout_flat / no_fill / format_violation + 实际 R

**判定窗口不含尾声段**，守住母设计「尾声段不进任何统计口径」。人提前收工也不缩短窗口——那是评 AI，不是评人。

**AI 调用失败不落记录**（母设计 §12），训练照常继续，UI 给一句失败提示。这样统计里不会混进「召唤了但没结果」的空洞。

### 3.6 人工标注

**只在自动判定为「方向对」时才请求标注**（母设计 §7）。方向已经错的直接归档不问——把点击花在信息量最高处。

选项四个：站得住 / 结论对但理由错 / 不成立 / 跳过。跳过本身也记录，用来区分「未标」与「标了没问题」。

**标注入口在复盘页，不在结算页。** 判断「理由站不站得住」必须看图——它说「回踩 20 周期均线获支撑」，你得看到价格到底碰没碰那条线。结算页是成绩单（每笔明细、净 R），没有那个上下文。结算页与复盘页是同一个训练窗口的两个页签，切过去即可。

## 4. M5 — 复盘与统计

### 4.1 复盘页

接在结算页后面，同一个训练窗口，顶部切页签（本局结算 / 复盘）。

局已结束，不再有泄漏风险，所以数据一次性全给：pro 侧新增 `review({ sessionId })` 返回完整可交易段 + 尾声段 + 事件时间轴。**拖时间轴在本地切片，不走 IPC**——每拖一格发一次请求会卡得没法用。

- **揭晓真身**：真实代号、真实日期、AI 打的标签与难度，一键跳 symbol 页看真图（provenance 提供）
- **三段底色**：你打过的段 / 训练时被雾遮住的段（你提前收工没走到的）/ 尾声段。后两段的 K 线压暗
- **时间轴刷子**拉到任意一根，图还原成当时所见，右半边重新变回雾
- **事件标注**（图上 + 时间轴上）：进场、止损、目标达成、AI 召唤、收盘
- **「显示收盘后走势」开关**揭尾声段（复用现有 `EpilogueToggle`）
- **实盘做不到的三个数**：强平后的最高/最低、不平仓拿到尾声段末的结果、被止损那笔超出多少以及之后到没到过目标
- **AI 对照**：放在图的正下方（召唤发生在图上某根，对照离那根越近越好读），每次召唤一条，含判定结果与标注入口
- **教训输入**

### 4.2 统计面板

主窗口，`TrainerCard` 点进去的二级页。数据源是扫 `sessionsDir` 的 session 文件，join case 文件拿结构标签。

**只统计跑到 `terminal` 的局。** `sessionsDir` 里躺着的还有开了没打完的（开局看两眼就关掉的、中途去干别的的）。把这些算进胜率就是拿「我不喜欢的开局」冲淡分母。未完成的局在面板上单独报个数就够。

全部做成**纯函数**：输入 session 列表 + case 元数据，输出统计对象。统计口径能被单测钉死，不用起 UI 验。

六块（照母设计 §8）：

1. **总览**：累计 R、胜率、计划盈亏比 vs 实际拿到、最大浮盈回吐比例
2. **按结构标签**的净 R 与胜率
3. **止损体检**：被止损后价格最终仍达目标的比例、止损被打的平均超出幅度
4. **AI 陪练影响**：被说服 vs 坚持的胜率（只统计有分歧的召唤）
5. **推进方式影响**：逐根推进期间持仓的胜率 vs 大周期快进期间的胜率
6. **AI 成绩单**：方向准确率、其中「理由站得住」与「结论对但理由错」的占比

第 1 块里「计划 2.4:1 → 实际 1.3:1」这一栏最该先看：它区分「选位置的毛病」和「拿不住的毛病」，这是两种完全不同的病。

**不做**：卡片折叠、「近 N 局 / 全部」时间窗切换。样本本来就少，再切一刀只会让护栏更容易触发，反而看不到东西。

### 4.3 样本量护栏

母设计没写，本期加。

**任何一块统计在样本不足 10 时，只报个数，不报比率。**

阈值按**每块自己的样本单位**算，不是全局按局数算：总览和止损体检按完成局数，按标签那块按该标签下的局数，AI 陪练影响按**有分歧的召唤次数**，AI 成绩单按总召唤次数。刷了 40 局但只召唤过 5 次 AI，AI 那两块照样该锁住。

刷了 3 局赢 3 局，面板显示「胜率 100%」——这个数字唯一的作用是骗你。统计面板的价值全在样本够大之后，在那之前它应该拒绝回答。这是 TD-NOISE-01 在 UI 上的落实：在噪声里找规律等于训练自己亏钱。

### 4.4 教训沉淀

结算页写一句话 → 存进 session 文件 → 旁边一个**「同步到 `journal/lessons.md`」按钮**，人手动挑。

默认不流出去。理由：训练局是匿名合成盘，价格被缩放过、代号是假的、没有新闻和基本面。在这种环境里学到的东西，一部分是关于**你自己的操作习惯**（止损贴太近、拿不住、追高），这些该进 lessons 影响实盘；另一部分是关于**这个训练环境**的（「这个案例池里假突破特别多」），流进实盘 AI 的必读清单是污染。

`journal/lessons.md` 在本仓库有明确身份：CLAUDE.md 写着它是「复盘教训清单，一行一条带日期；短线预测每次运行前必读」。写进去的东西会真的影响实盘判断，所以闸门交给人。

母设计 §8「结构化训练数据不写入 `journal/`」仍然成立——那句话管的是结构化数据，不是人写的一句话。

## 5. 落点

```
apps/pro/src/modules/training/
  coachRun.ts        # 召唤一次：拼装 view → cell session → Submission
  coachVerdict.ts    # 纯函数：coach 记录 + replay bars → 自动判定 + 改主意三档
  reviewPayload.ts   # 复盘页的全量数据组装
  trainingStats.ts   # 纯函数：session 列表 + case 元数据 → 统计对象（含样本护栏）
  sessionStore.ts    # 升 version 2，向后兼容读
  trainerRuntime.ts  # 加 coach / annotate / review / stats / lesson 方法

packages/pro-api/src/trainerTypes.ts
  TrainerCoachCall / TrainerCoachVerdict / TrainerAnnotation
  TrainerReviewPayload / TrainerStats / TrainerLesson
  TrainerApi 加对应方法

apps/web/src/features/training/
  TrainerCoachPanel.tsx    # 局中「问 AI」+ AI 意见展示
  TrainerReview.tsx        # 复盘页外壳
  TrainerReviewTimeline.tsx / TrainerReviewFacts.tsx / TrainerCoachCompare.tsx
apps/web/src/features/home/
  TrainingStatsPage.tsx    # 统计面板
```

训练 UI 落在公开仓 `apps/web`（**不是** 母设计 §2 写的 overlay 投影——实现时改了，现状以此为准），通过 capabilities 在免费版隐藏。

文件大小按仓库规矩：单文件 500 行、组件 300 行。复盘页必须拆——图、时间轴、三个数的面板、AI 对照各自独立。

## 6. 数据流总览

```
局中：
  提交方向+三价 → 解锁问 AI
    → 点「问 AI」→ 截断视图 → analyst(blind) → Submission
    → 存 coach 记录（含 humanBefore 快照）

局终：
  对每条 coach 记录 → replayDirectional(游标+1 .. replay 段末) → verdict
    → 方向对的 → 复盘页请求人工标注 → 写回 session 文件

复盘：
  review(sessionId) → 全量 bars + 尾声段 + 事件轴 → 本地切片重放

统计：
  扫全部 session 文件 + join case 标签 → 纯函数聚合 → 样本护栏 → 面板
```

## 7. 测试

**泄漏测试（最重要）**

- coach 拿到的 question 里，**任何周期的任何一根** bar 时间 ≤ 游标那根
- `run_code` 沙箱 globals 里的 kline 同样截断（最容易漏的一处，它绕开工具直接给数据）
- blind 档下 news / fundamentals / calendar 不出现在下发给模型的文本里
- **canary**：故意造一个含未来 bar 的 case 喂进去，断言链路把它挡掉

canary 是必须的。没有它，将来某次重构把截断逻辑改坏了，上面三条断言可能一起变成永远通过的空断言。

**纯函数单测**

- 「改主意」三档判定
- 自动判定边界：`no_fill`（三根内没摸到入场价）、`format_violation`（止损方向填反）
- 统计聚合，重点测样本护栏：9 局返回「样本不足」，10 局才出比率
- 尾声段被排除在所有统计口径外

**组件测试**（沿用现有 vitest + jsdom 模式）

- 锁定顺序：未提交时「问 AI」disabled
- 标注区只在方向判对时出现
- 样本不足时卡片显示个数不显示比率

**不测**：AI 输出的质量好坏（那是 bench 的职责）；不做 E2E。

## 8. 明确不做

- **回流导出（评测集 + 偏差报告）**。训练 case 本来就是 `Question` 格式，跟 bench 数据集同构，真需要时写个短脚本挪文件即可；而「系统性偏差」要大样本才显现，现在样本是 0，做出来第一个月看到的全是噪声，反而会误导去改 prompt——正好撞上 TD-NOISE-01。数据结构上留好口子，等统计面板真看出某类 case 有偏差了再单开一期。
- **AI 影子局**（让 AI 把整局从头跑到尾做全程对照）。那不是母设计 §7 描述的「手动召唤看第二意见」，是另一个功能，且一局要烧几十次模型调用。有意思，但不混进本期。
- 训练器专用的 AI persona。必须和 bench 用同一个 analyst、同一套 `loadBenchDiscipline`，两边喂给模型的规则文本逐字相同——否则训练器量出来的 AI 成绩推不出 bench 的结论，回流价值归零。
- AI 看到人的判断。看到就不是独立第二意见了。

## 9. 风险与探路

**唯一的真风险：`composeCellSession` 需要 `scaffold`（`skillText` + `disciplineText`，从仓库里读 SKILL.md）。**

bench 是 CLI 跑的，`repoRoot` 现成；训练器跑在 Electron 里，打包后能不能读到仓库里的 markdown 是未知的。

**实现计划的第一个任务就是探这个，不是写功能。** 探不通就整期停下来重新设计，不带着一个「本地能跑、打包就废」的方案往下滚。

次要风险：session 文件扫全量做统计，局数多了会慢。先不优化——几百局的规模无所谓，真慢了再加索引。
