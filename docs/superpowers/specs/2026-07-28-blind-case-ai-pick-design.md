# 盲盘案例池的 AI 精选闸 —— 设计

> 2026-07-28 · 盲盘训练 P2
>
> 上游设计：`2026-07-25-blind-replay-training-design.md` §121「第二道闸：AI 精选」
> 依赖：P0（`2026-07-28-kline-text-encoding-design.md`）、P1（`2026-07-28-training-case-pool-refill-design.md`）

## 1. 背景

原设计的案例池管线是两道闸：硬规则闸 + AI 精选闸。M2 落地时只实现了硬规则闸 —— `fillCasePool` 的阶段是 `sample / hard-rule-gate / build / audit`（`apps/pro/src/modules/training/fillCasePool.ts:37`），全程无 AI，代码里搜不到 `worthy` 或任何精选相关实现。

后果是：池子里的题是「干净的随机段落」，不是「精选过的好题」。硬规则能滤掉有消息面噪音的（财报、宏观、跳空、死水），滤不掉**无聊的** —— 一段没有任何可辨结构的走势，同样会入池。

本文补上这道闸，但范围比原设计窄，见 §2。

## 2. 与原设计的差异

原设计 §121 给这道闸两个用途（毙盘 + 打标签）和三个输出（`worthy` / `tag` / `difficulty`）。本期收窄为：

| 项 | 原设计 | 本期 | 理由 |
| --- | --- | --- | --- |
| 毙盘 | `worthy` 生效 | **只记不杀** | §3.1 |
| 选盘 | 按 `tag` 挑题 | **不做** | §3.3 |
| `difficulty` | 输出 | **不要** | §3.4 |

## 3. 已定决策与理由

### 3.1 只打标签，不毙盘

`worthy` 照常产出并落盘，但**不参与准入** —— 判为 unworthy 的案例照样入池。

理由：AI 判定「这盘不值得练」时，用户无从验证对错 —— 题目已被毙掉，永远见不到。先只记不杀，积累一批「它标 unworthy 但练着有收获」的反例，再决定是否赋予否决权。开否决权是单向门，先开了就再也拿不到反例。

### 3.2 AI 看真盘

精选闸跑在匿名化**之前**，输入含真实代码与真实日期。

（讨论中曾提出改为匿名化之后，理由是模型认得出真实标的会用「Q1 财报超预期」这类用户在匿名盘上推不出的理由，导致判断与用户的信息条件不对齐。经权衡后仍按原设计保留真盘输入。）

因此 AI 的输出属于「带真实身份的一侧」，落盘位置受 §3.3 约束。

### 3.3 标签只进 epilogue 文件，本期不做选盘

标签与 `provenance` 同处 `epilogues/<周期>/<id>.json`，与后续走势一起，收盘才揭晓。`cases/` 目录不含任何标签字段。

**不做选盘**：选盘与盲盘的前提冲突 —— 指定练「假突破」即等于已知题型。若将来要做，应作为独立的「指定题型练习（会剧透题型）」模式，而不是把标签摆到开局前可读的位置，那等于给未来埋一个「不小心把标签渲染出来」的坑。

标签放 epilogue 的附带好处：物理隔离是现成的，「收盘才揭晓」不需要额外机制。

### 3.4 不要 `difficulty`

`difficulty` 比 `tag` 主观得多。`tag` 描述图形结构（是不是假突破，看结局能验证），`difficulty` 预测「对某个人有多难」—— 模型既不知道用户水平，也没有参照系，两次调用的分布可能完全不同，且无法校准。

更关键：**难度会由用户自己产出**。同一 `tag` 下的真实胜率就是难度的客观度量，且是针对个人校准过的。让 AI 猜一个主观难度反而污染这个更可靠的信号 —— 用户会不自觉拿它当参照（「这局标了难，输了正常」）。

等有了几十局真实战绩，难度从数据里长出来。

### 3.5 存量 case 不补标，且不实现反解

P0/P1 期间灌入的 case 没有标签。技术上补标很容易：`provenance` 含 `sourceSymbol`、`priceScale`、`volumeScale`、`dayShift`，把匿名化反向算回去即可还原真实盘面，纯算术，无需重拉长桥。

**正因为容易，才不做。**

反解函数等于在训练模块里放一个去匿名化工具。本架构的核心安全属性是「case 那一侧单向、永远推不出真身」—— 为此做了 epilogue 物理隔离、runtime 不加载、CLI 验证存盘文件不含 provenance。一个反解函数会把这个属性从「结构上不可能」降级为「只要没人调错就不会发生」。为给数十个存量 case 补标签而换掉设计里最硬的保证，不划算。

**存量即无标签。** 统计时「未标注」必须作为显式的一类出现，不得默默不计入 —— 否则「假突破胜率 23%」是基于部分样本算出的，而用户不知道漏了多少。

补标签的正规路径是重新灌池，不是反解。

## 4. 管线落点

### 4.1 拆分 `buildBlindCase`

`buildBlindCase`（`apps/pro/src/modules/training/blindCaseBuilder.ts:221`）当前一口气做完：拉三档 K 线 → `assembleEpisodeQuestion` → 切尾声段 → 邻接校验 → 生成别名与假 cutoff → `anonymizeEpisodeQuestion`。

拆成两半：

- **`assembleBlindCase`** —— 拉数据、组装、切尾声段、邻接校验。产出**真实身份**的 `Question` + 真实 epilogue
- **`anonymizeBlindCase`** —— 生成别名与假 cutoff、调 `anonymizeEpisodeQuestion`

精选闸插在两者之间。此处手上正好是「真身份 + 完整走势 + 结局」，且已是 `chartPayload` / indicators 能直接消费的 `Question` 形态，无需额外拉数据。

拆分本身也让职责更清楚：一个碰网络和数据组装，一个是纯变换，各自的测试都更好写。

### 4.2 funnel 阶段扩展

`CasePoolStageName` 从 `sample / hard-rule-gate / build / audit` 变为：

```
sample / hard-rule-gate / assemble / ai-pick / anonymize / audit
```

**这会改动 P1 的契约。** P1 spec §5 把 `TrainerFillPhase` 钉成了四个值。两期一并发布，故直接按最终形态定义，不做中间版本。P1 实现时应直接使用上述六阶段枚举 —— 已在 P1 spec 中同步。

## 5. 调用形态

照抄 `packages/core/src/ai/personas/eventFilter.ts`：单轮对话 + 一个强制 submit 工具，`terminate: true` 结束。无工具循环，无取数工具 —— 数据全部放进用户消息。

```ts
const submitSchema = Type.Object({
  worthy: Type.Boolean({ description: 'Whether this case is worth practising.' }),
  tag: Type.Union([
    Type.Literal('trend-follow'),
    Type.Literal('pullback-entry'),
    Type.Literal('false-breakout'),
    Type.Literal('top-reversal'),
    Type.Literal('range-bound'),
  ]),
  reason: Type.String({ description: 'One sentence, cites a concrete price or bar index.' }),
});
```

五个 `tag` 取值沿用原设计 §121（趋势跟随 / 回调买点 / 假突破 / 顶部反转 / 区间震荡）。

`reason` 要求引用具体价位或 bar 序号，对齐 TD-REASON-01 —— 没有这条，事后无法判断它是看图得出的还是认出了真实标的。

**降级路径**（与 `eventFilter` 同构）：

| 情况 | 行为 |
| --- | --- |
| 未配置模型 | 无标签入池 |
| 模型未调用 submit | 无标签入池 |
| 调用超时 / 报错 | 无标签入池 |
| 超出花费闸 | 无标签入池，任务行记录降级原因 |

四种情况都是「案例照常入池，只是没有标签」。这与 §3.1 的「只记不杀」天然一致 —— 因为标签不参与准入，AI 全线挂掉也不影响补货产出。

超时沿用 `eventFilter` 的 60 秒。

## 6. 模型角色

新增 `AiTaskRole`：`casePick`，设置页标签「案例精选」。

需要改动五处：`packages/core/src/ai/settings/settingsStore.ts`（类型 + `TASK_ROLES`）、`packages/pro-api/src/aiTypes.ts`（类型是重复声明的）、`packages/core/src/ai/runtime/models.ts`（`AiConfig` 字段 + `resolve`）、`apps/web/src/features/settings/types.ts` 的 `ROLE_LABEL`、设置页测试。

`memory`（2026-07-20 上线）是最近的先例：纯后台角色，不进 `ENV_ROLES`，`casePick` 照此办理。

**为何不复用现有角色**：复用 `comment` 会把两个方向相反的需求绑在一起 —— 盘中快评想要更强的模型，案例精选是批量跑且有月度花费上限、正该用便宜模型；任一侧调整都会拖累另一侧。复用 `analyst` 更糟：那是用户花最多心思调的模型，拿它跑批量分类等于每次自动补货都用最贵的模型烧钱。

有了花费上限，就必须有一个能独立指向便宜模型的地方，否则上限只会让用户更快撞墙，而不是标更多的题。

## 7. 花费闸

### 7.1 计量

用量归属 `layer: 'case-pick'`。`ai_usage` 表（`packages/core/src/db/schema.ts:34`）已记录 `costTotal`（真实金额）与完整 token 拆分，按 `easternDate` 索引；`attachAiUsageLogger` 可直接挂到 agent 上自动记账。**不新建表。**

### 7.2 规则

| 项 | 值 |
| --- | --- |
| 单位 | 按自然月金额（USD），月份按 `easternDate` 划分，与 `ai_usage` 的索引口径一致 |
| 默认 | $5 |
| 存放 | `app_meta` k/v |
| 作用范围 | **只拦自动补货，不拦手动** |

**为何按金额而非局数**：局数拦不住花费 —— 15 局用便宜模型和贵模型差十倍价钱。金额还有个局数没有的好性质：换便宜模型后自动能标更多题，无需回去改配置。

**为何默认值定得低**：$5 按 §8 的量级够标几千局，正常使用永远碰不到。它不是用来限制正常使用的，是用来兜异常的 —— prompt 写错导致重试风暴、误配成贵十倍的模型、循环调用 bug。这些时候需要的正是一个低得离谱的天花板。

**为何不拦手动**：与 P1「退避只拦自动不拦手动」一致。用户亲手点击时意图明确。

### 7.3 降级留痕

超额导致某次自动补货未跑 AI 时，P1 的任务行须记录降级原因，卡片显示「本月自动标注额度已用完」。不得默默变成无标签 —— 那正是 P1 花大力气避免的「自动行为隐身」。

## 8. 输入与成本

输入走 P0 的编码器。P0 §1 实测：一个 5m 案例从 27.3k token 压到 8.3k。

精选闸看的是**匿名化之前**的真实盘面，价格是真实股价（如 `GM.US` 的 $34.52），比案例文件里六位小数的缩放价格更短，故 8.3k 对本期是保守估计。加尾声段（78 根，约 0.8k）后**一局约 9k token 输入**。

自动补货一次 15 局约 14 万 token。

## 9. 存储

`StoredEpilogue`（`apps/pro/src/modules/training/epilogueStore.ts:11`）增加一个可选字段：

```ts
export interface StoredEpilogue {
  provenance: BlindCaseProvenance;
  epilogue: RawBar[];
  pick?: { worthy: boolean; tag: CaseTag; reason: string; model: string; at: string };
}
```

可选，因为无标签是合法状态（§5 的四种降级 + §3.5 的存量）。

记 `model` 和 `at`：将来回看「这批标签是哪个模型什么时候打的」，是判断标签能不能横向比较的前提。换了模型之后的标签与之前的不可直接混合统计。

`cases/` 侧不加任何字段。CLI 现有的泄漏自检（验证存盘 case 不含 epilogue 与 provenance）继续覆盖，无需修改 —— 标签跟着 epilogue 走，自动落在被检查的那一侧。

## 10. 测试

- 精选闸纯函数：给定 `Question` + epilogue，构造出的提示词含真实代码与日期（这是本期有意为之，需断言而非防止）
- 四种降级路径各一条：未配置模型 / 未调用 submit / 超时 / 超额
- `worthy: false` 的案例**仍然入池**（§3.1 的回归测试，最重要的一条）
- 标签落在 epilogue 文件、`cases/` 侧无标签字段
- CLI 泄漏自检在有标签的情况下仍然通过
- 花费闸：按月累计、跨月归零、只拦自动不拦手动、超额时任务行记录降级原因
- `assembleBlindCase` / `anonymizeBlindCase` 拆分后各自的既有行为不变（拆分本身的回归测试）
- 六阶段 funnel 的计数正确

## 11. 参考

- 原设计 §121：`docs/superpowers/specs/2026-07-25-blind-replay-training-design.md`
- 调用形态模板：`packages/core/src/ai/personas/eventFilter.ts`
- 待拆分：`apps/pro/src/modules/training/blindCaseBuilder.ts:221`
- 用量表：`packages/core/src/db/schema.ts:34`
- 角色先例：`memory`（2026-07-20，aa9bb43）
