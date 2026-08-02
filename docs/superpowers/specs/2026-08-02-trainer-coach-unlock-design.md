# 盲盘训练「问 AI」：拆锁 + 挪位 —— 设计

> 2026-08-02 · 盲盘训练 M4 修订
>
> 上游设计：`2026-07-28-blind-replay-trainer-m4-m5-design.md`（M4 陪练链路）、`2026-07-25-blind-replay-training-design.md` §7
>
> 现状代码：web 侧已随 kansoku #107 合入 main；pro 侧已随 kansoku-pro #26（5d118ba）合入 main。本文改的是**已发布**的行为，不是待合分支。

## 1. 背景

M4 落地的「局中问 AI」现在有两个毛病，一个在 UI，一个在门槛。

### 1.1 UI：它是唯一会在局中改变图表高度的东西

`TrainerCoachPanel` 渲染成 `.trainer-coach-lane`（`apps/web/src/styles.css:9590`），是训练窗口底部第三条独立横带，排在推进条、下单条下面。

这条横带违反了这块布局唯一一条明写的纪律。`styles.css:896` 那段注释说得很直接：图表下面的控件曾经「每个状态长一行」——状态、播放事件、校验、错误——每长一行就在局中改一次图表高度，所以后来全部改成绝对定位的浮层。而 `.trainer-coach-lane` 用了 `flex-wrap: wrap`，里面装着 `.trainer-coach-comment { flex: 1 1 240px; line-height: 1.6 }`：AI 一回答就换行长高，正是当初被赶走的那个行为。长高的时机还偏偏是你盯着图看结果的那一刻。

另外两条毛病同源：

- **视觉权重和使用频率反着。** 推进条、下单条都是 `.trainer-lane`，`height: 38px` 封死（`styles.css:1214`）；问 AI 一局最多点几次，占的高度反而不封顶。三条里只有它有 `background: var(--bg-surface)`，比每根都要用的那两条还抢眼。
- **信息重了一份。** AI 的方向、三价、「与你分歧」已经在图右上角的 chip 里（`TrainerCoachPanel.tsx:50`），lane 里再放一段 comment——同一件事，两个形态两个位置。

### 1.2 门槛：解锁要先把这一笔做完

母设计把「先提交自己的判断」定为不可妥协的锁定顺序，理由是开局即可问 AI 等于抄答案。落地时这把锁的实际形态是：`coachUnlocked(view) => view.submitted`，而 `submitted` 来自一次完整的 `submit` —— 方向、入场、止损、目标四样齐全，还要过 1.5 盈亏比下限（`meetsRewardRiskFloor`）。

也就是说，想在放线之前问一句「这段结构你怎么看」，门都没有。要问，先把整笔交易做完。这不是「先表个态」，是「先做完」。

契约层面本来留了一条更便宜的路——`submitted` 也接受弃权（观望本身就是一次提交，不产出单也不产出仓）——但 **web 侧压根没有「观望」按钮**：`TrainerEntryLane` 只有做多、做空、市价做多、市价做空。开场白第一条写着「看不准就观望——观望也算一次决定」（`TrainerLauncher.tsx:14`），而这个决定在 UI 上没有任何落点。所以实践中解锁只有一条路：一张过了 1.5 盈亏比下限的完整单。

结果就是这条最占地方的横带，绝大多数时间是灰的，旁边还常驻一句「先提交你自己的方向与三价，AI 的看法才解锁」——**它最占地方的时候正是它最没用的时候。**

## 2. 已定决策与理由

### 2.1 「问 AI」并进下单条右端，跟「备注」同级

删掉 `.trainer-coach-lane`，底部从三条回到两条。按钮跟下单条同一行，靠右。

理由：这个动作的使用频率和「备注」是一个量级，视觉权重就该是一个量级。塞进固定 38px 的行里，等于让它永远不能再改变图表高度——1.1 的纪律自动被遵守，而不是靠下一个人记得。

**不选**的落点及理由：

| 落点 | 不选的理由 |
| --- | --- |
| 左侧画线工具栏（`.trainer-overlay-rail`） | 那条栏的语义是「在图上画东西」，塞 AI 进去语义混 |
| 顶部 header 右侧 | 离图和手都远；header 是拖窗区，要额外处理 no-drag |
| 不给常驻入口，提交时浮出卡片 | 与 2.3 的「随时能点」直接冲突 |

### 2.2 AI 的话全部收进图右上角的 chip，默认收起

`trainer-overlay-stack` 是绝对定位的浮层，长多长都不碰图表高度。chip 默认一行：方向 + 三价 + 分歧标记；comment 折在里面，点 chip 展开（`max-width: 320px`），再点收起。原先常驻在横带上的那句「对错与理由的评判留到收盘后」跟着 comment 走进展开区 —— 它是读理由时才需要的提醒，不该占一行常驻。

默认收起而不是常显：方向和三价是抬眼就要看的，理由是想了才看的。常显会把 chip 撑到盖住最新几根 K 线——那正是你在看的地方。

多次召唤时 stack 里仍只放最新一条，历史留给结算页的「AI 对照」。这跟现在的行为一致，不新增概念。

### 2.3 解锁门槛全部拆掉，抬手就问

按钮永远可点，没有任何前置条件。开局第一根就能问。

这等于把 AI 在这里的身份从「被对照的第二意见」换成「随叫随到的教练」，是明确的产品取舍：母设计怕的是抄答案，但代价是把 AI 关在一道贵得离谱的门后面，而训练最需要它的时刻——你还没想清楚的时候——恰好在门外。

**代价照实记下：** 改完之后，开局第一根就能拿到一个完整的方向加三价。这条不做任何技术阻拦。

**开局那一下走的是 `cursor = -1`。** 推进之前引擎的游标是 `-1`，旧锁让这个值永远到不了 coach 链路。`buildEpisodeQuestionViewAtCursor` 显式判 `cursor >= 0`，负数时 revealed 为空、cutoff 回落到题目自己的 `question.cutoff` —— 也就是 AI 看到的正是交易者开局看到的那一屏，没有多一根。`assertNoFutureBars` 校验的也是同一个 cutoff，所以泄漏防线在这条新路径上照常成立。

**但记录必须诚实。** 不加新字段——`TrainerCoachCall` 已经有 `cursor` 和 `humanBefore`，结算页显示「B0 · 你当时还没表态」就足以让你事后分辨这一局是判出来的还是抄出来的。

**不加二次确认弹窗。** 门槛拆了又换个形式装回去等于没拆。误点的代价是一次真实模型调用（`COACH_TIMEOUT_MS = 180_000`），按钮在 `asking` 期间 disabled 已经够了。

### 2.4 统计口径不变，只算「你当时有方向」的那些召唤

`humanBefore` 变成可空。为空的召唤不进「AI 陪练影响」（被说服 vs 坚持），但照常进「AI 成绩单」。

理由：这两块量的是不同的东西。「陪练影响」量的是**你**有没有被改变——没有表态就没有可被改变的东西，这个问题不适用，不是「值为零」。「成绩单」量的是**AI**准不准，跟你有没有表态无关，所以一次都不能漏。

样本会变稀。现有那条「不足 10 不出比率」的护栏自己会处理，不额外加东西——那正是它存在的理由。

## 3. 改动清单

### 3.1 契约（`packages/pro-api/src/trainerTypes.ts`）

| 改动 | 说明 |
| --- | --- |
| `TrainerCoachCall.humanBefore` → `TrainerCoachStance \| null` | 放宽 |
| `TrainerCoachVerdict.agreement` → `TrainerCoachAgreement \| null` | 放宽。**不**往三值枚举里加第四个「没表态」——那不是一种一致性，是这个问题不适用 |
| `TrainerView.submitted` | **删除**（`trainerTypes.ts:192` 及其注释） |
| `TrainerErrorCode` | 不动 |

`submitted` 删得掉，是因为全 web 只有 `coachStance.ts:17` 一处在读它。锁一去它就是死字段，留着比删掉更容易误导后来人。

### 3.2 pro 侧（`apps/pro/src/modules/training/`）

- `trainerRuntime.ts:562`：删 `if (state.initialSubmission === null) throw new TrainerCoachLockedError()`，连同上面那句「a disabled button is a courtesy and this rule is not」的注释。
- `trainerRuntime.ts:216-235` `humanStance`：返回类型改 `TrainerCoachStance | null`；`:228` 的 `throw` 改成 `return null`。**前两条分支一个字不动**——手上有挂单或持仓时方向本来就确定，这正是 2.4 口径的落实处。
- `trainerRuntime.ts:156` `TrainerCoachLockedError` 类整个删；`:186` `failure()` 里对应的那一支一并删（它原本归到 `TRAINER_GUARDRAIL` / 409，删掉后不影响枚举，只是少一条分支）。
- `session.ts:194`：不再产出 `submitted`。
- `coachVerdict.ts:94` `coachAgreement`：`humanBefore` 为空时直接 `return null`，不进 `firstDirectionChange`。
- `trainingStats.ts:130` `coachInfluenceStats`：`:137` 的筛选条件从 `verdict.agreement !== 'aligned'` 改成 `verdict.agreement !== null && verdict.agreement !== 'aligned'`。分母语义从「有分歧的召唤」变成「你当时有方向、且和 AI 有分歧的召唤」。
- `trainingStats.ts:196` `coachScorecard`：**不动**，所有召唤照常计入。

### 3.3 web 侧（`apps/web/src/features/training/`）

- `coachStance.ts`：删 `coachUnlocked`、`coachLockReason`；`coachDisagrees` 在 `humanBefore` 为空时返回 `false`（没表态就没有分歧）。
- `TrainerCoachPanel.tsx`：不再渲染 `.trainer-coach-lane`。拆成两块——按钮（进下单条那一行）和 chip（进 `trainer-overlay-stack`，带展开态）。`disabled` 只剩 `asking` 一个条件。按钮文案：`问 AI` / 问过之后 `问 AI · 3` / 请求中 `问 AI…`。错误提示改用 stack 里的 `trainer-chip--error`，跟推进条、下单条的报错走同一条路。
- `TrainerChart.tsx:189-204`：把 `<TrainerOrderPanel>` 和 coach 按钮包进 `.trainer-lane-row`。
- `TrainerCoachCompare.tsx:99-101`：`humanBefore` 为空时「你当时：做多」换成「你当时还没表态」；`verdict.agreement` 为空时不渲染 agreement chip。标注入口不受影响（只看 `verdict.directionCorrect`）。

### 3.4 CSS（`apps/web/src/styles.css`）

- 删 `.trainer-coach-lane`、`.trainer-coach-comment`。
- `.trainer-lane` 的 `border-top` 上移到新增的 `.trainer-lane-row`；`.trainer-lane` 在行内 `flex: 1 1 auto`。
- 新增 `.trainer-lane-row { display: flex; flex: 0 0 auto; height: 38px; border-top: 1px solid var(--border) }`。
- 行内的 lane 还要 `height: auto`。这条是实跑量出来的：全局 `box-sizing: border-box` 之下，行的 38px 含那 1px 边框，内容盒只有 37px；lane 若继续扛着自己的 `height: 38px` 就会往下探出 1px，把「问 AI」按钮的上下间距顶成 6/4。交给行的 `align-items: stretch` 去定高即可。
- `.trainer-chip--coach` 加展开态：收起时 comment 不渲染，展开时 `max-width: 320px`。

包一层而不是让 `TrainerOrderPanel` 自己挂按钮，是因为它有五种形态——选方向、已画草稿、挂单中、持仓中，外加一条非平仓却既无单又无仓时的兜底「本局已结束」（`TrainerOrderPanel.tsx:272`）——每种都是一条独立的 `.trainer-lane`。按钮包在外面自动全覆盖，不会出现某个形态忘了挂。`.trainer-lane` 那句 `overflow-x: clip` 只管它自己，按钮在它外面，不会被裁掉。

## 4. 存量兼容

不需要迁移，`sessionStore` 的 `version` 不动。

`humanBefore` 和 `agreement` 都是**放宽**不是收紧：已经落盘的记录全是非空，读回来照样合法。新记录才可能带空值。

已完成的旧局重新打开统计时，`agreement` 全是三值之一，`coachInfluenceStats` 新加的 `!== null` 判断对它们恒真，口径与改动前完全一致。

## 5. 测试

**删：**

- pro：未提交时调 `coach` 抛 `TrainerCoachLockedError` 的用例
- web：`TrainerCoachPanel.test.tsx` 里按钮 disabled + 锁定提示的用例

**改：**

- `TrainerCoachPanel.test.tsx` 里 `askButton('问 AI')` 的文案断言（改成计数形态）

**加：**

- pro 端到端：开局第一根直接调 `coach` → 落一条 `humanBefore: null` 的记录 → 收盘后 `verdict` 照常有、`verdict.agreement` 为 `null`
- pro 统计：一局里既有「有方向的召唤」也有「没表态的召唤」→ `coachInfluence` 只数前者，`coachScorecard` 两者都数
- web：下单条各形态（选方向 / 已画草稿 / 挂单中 / 持仓中）下按钮都在且可点
- web：chip 展开收起

**不动：**

- `assertNoFutureBars` 那套泄漏测试。它防的是 AI 看到游标右边的 K 线，跟解不解锁无关。

## 6. 本期不做

- **AI 影子局**（AI 从头到尾自己打完整局做全程对照）。M4/M5 设计已经 defer 过一次，理由不变：一局要烧几十次模型调用，且是另一个功能。
- **单局召唤次数上限**。母设计定的是「自己付钱自己决定」，本期不改这条。
- **按题型选盘**。与盲盘前提冲突，见 `2026-07-28-blind-case-ai-pick-design.md` §3.3。
- **补上「观望」按钮**。§1.2 暴露的这个缺口是真的，但它属于下单条的入口设计，不属于本期。本期改完之后，它至少不再挡着 AI —— 解锁路径已经整条拆掉了。
