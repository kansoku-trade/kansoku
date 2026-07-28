# 盲盘训练案例池补货搬进 app —— 设计

> 2026-07-28 ·  盲盘训练 P1
>
> 上游设计：`docs/superpowers/specs/2026-07-25-blind-replay-training-design.md`（下称「原设计」）

## 1. 背景

案例池目前只能从命令行灌：

```bash
pnpm --filter @kansoku/pro training:fill-pool --count 20 --base-period 5m
```

于是出现这样的死路：用户点开盲盘训练 → 池子是空的 → 训练窗只显示「没有可用的训练局」→ 没有任何提示告诉他该怎么办。付费用户尤其难受，功能是买了的，但看起来像坏了。

原设计 §「存储与补货」把补货一笔带过，没有规定它跑在哪里。M2 落地时选了 CLI，是当时无 UI 阶段的合理选择，但功能完整之后这个选择就变成了缺口。

## 2. 目标与范围

**目标**：把 `fillCasePool` 从命令行操作变成 kernel 里的后台任务 —— 手动能点、该补的时候自己补、状态永远看得见。

**这期做**

- 补货作为后台任务跑在 kernel 里，状态落 sqlite
- 手动触发：首页 `TrainerCard` 上的按钮
- 自动触发：读池子时、打完一局后
- 进度、失败原因、自停状态在界面上可见
- CLI 保留，与 app 共用同一个核心函数

**这期不做**

- AI 精选闸（P2，见 §11）
- 按标签选盘
- 手动选周期（自动只补 `5m`）
- 定时器补货、app 启动时补货（见 §6 的排除理由）

## 3. 架构

### 3.1 触发决策全部在 kernel 侧

两个自动触发点都落在主进程，不在渲染进程：

- 读池子时 → `trainerRuntime.listPool()`，以及 `open()` 因无题失败时
- 打完一局后 → session 结算那一步

渲染进程**永远不决定要不要补货**，只负责显示状态和提供手动按钮。

理由：训练窗口和首页是两个独立窗口。若由渲染侧判断阈值，两个窗口会各自判断、各自触发，需要额外一层去重。放在 kernel 里天然只有一个判断者，配合 runLock 即构成完整互斥。

### 3.2 组件

| 组件 | 位置 | 职责 |
| --- | --- | --- |
| `training_fill_tasks` 表 | `packages/core/src/db/schema.ts` | 任务行 |
| 契约类型 | `packages/pro-api/src/trainerTypes.ts` | `TrainerFillTask` + API 方法 + channel kind |
| `fillTask.ts` | `apps/pro/src/modules/training/` | 任务引擎：start / get / abort / 崩溃恢复 / broadcast / runLock |
| `autoRefill.ts` | 同上 | 纯策略函数：够不够、该不该补、要不要自停 |
| `fillCasePool.ts` | 同上（已存在） | 加 `onProgress` 回调；另有两处行为修正见 §7 |
| IPC | `apps/pro/src/modules/training/ipc.ts` | `getFill` / `startFill` / `abortFill` |
| 实时 channel | `apps/pro/src/server/realtime/channels.ts` | `{ kind: 'training-fill' }` |
| UI | `apps/web/src/features/home/TrainerCard.tsx` | 补货按钮、进度、失败原因 |

参照实现是深度研究的刷新任务（`apps/pro/src/ai/researchRefresh.ts` + `research_refresh_tasks` 表）：任务行落库、runLock 防重入、`broadcast` 推渲染进程、启动时回收僵死任务。补货照抄这套形态，不另发明。

`fillCasePool` 保持为不碰 IO 边界的纯管线函数（deps 全部注入），任务引擎在外面包一层。这样它现有的测试不受影响，CLI 也继续调同一个函数，只是不经过任务表。

`autoRefill.ts` 单独拆出，是因为它是这期唯一含「策略」的地方（阈值、目标、自停）。拆成纯函数才能不启动 kernel 就把分支测全。

## 4. 数据表 `training_fill_tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text pk | snowflake |
| `basePeriod` | text | 补的哪一档 |
| `requested` | integer | 这次要补几局 |
| `trigger` | text | `manual` / `pool-read` / `session-end` |
| `status` | text | `running` / `done` / `failed` / `aborted` |
| `phase` | text | 六阶段，复用 `CasePoolStageName`，见下 |
| `activity` | text | 人类可读的当前动作 |
| `admitted` | integer | 已入池局数 |
| `funnel` | json | `CasePoolStageFunnel[]` |
| `error` | text? | 失败原因 |
| `startedAt` / `updatedAt` / `finishedAt` | text | 同 research 任务 |

索引：`status`、`startedAt`。

两处与 `research_refresh_tasks` 不同，均为有意：

**`trigger` 字段**是自动补货「不隐身」的核心。事后必须能分清哪次是用户点的、哪次是系统跑的；没有这个字段，自动补货就是匿名行为。

**`funnel` 存整份**：补货失败时最有诊断价值的不是一句 error，而是「采样 400 次只过了 3 个」这类分布。它不进契约，只留在表里供 CLI 与日志使用。

**锁是全局的**，不按周期分片。并行补两档会双倍占用长桥接口，且无实际收益。

## 5. 契约

`packages/pro-api/src/trainerTypes.ts` 新增：

```ts
export type TrainerFillTrigger = 'manual' | 'pool-read' | 'session-end';
export type TrainerFillStatus = 'running' | 'done' | 'failed' | 'aborted';
export type TrainerFillPhase =
  | 'sample'
  | 'hard-rule-gate'
  | 'assemble'
  | 'ai-pick'
  | 'anonymize'
  | 'audit';

export interface TrainerFillTask {
  id: string;
  basePeriod: TrainerBasePeriod;
  requested: number;
  trigger: TrainerFillTrigger;
  status: TrainerFillStatus;
  phase: TrainerFillPhase;
  activity: string;
  admitted: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}
```

界面除了最近一次任务，还需要知道自动补货当前是否被用户关掉、是否已因连败自停 —— 后者由多条任务行推导，单看最近一条任务判断不出来。故查询返回一个状态对象而非裸任务：

```ts
export interface TrainerFillState {
  task: TrainerFillTask | null;
  autoRefillEnabled: boolean;
  autoRefillSuspended: boolean;
}
```

`autoRefillEnabled` 反映 §6.5 的用户开关，`autoRefillSuspended` 反映 §6.4 的连败自停。二者分开，因为界面要说的话不同：前者是「你自己关的」，后者是「它撞墙撞停了」。

`TrainerApi` 新增：

- `getFill(): TrainerFillState`
- `startFill(input: { basePeriod: TrainerBasePeriod; count: number }): TrainerFillTask`
- `abortFill(input: { id: string }): TrainerFillTask`

实时 channel `{ kind: 'training-fill' }`，先推 `init` 再推 `task`，与 `research-refresh` 同构。不带 key，因为只有一个池子。

`funnel` 刻意不进契约：界面不需要，进了契约就得跟着版本走。

**关于六阶段**：`build` 在 P2 里被拆成 `assemble` / `ai-pick` / `anonymize` 三段（P2 spec §4.1 —— AI 精选闸必须插在组装之后、匿名化之前，才能看到真实盘面）。两期一并发布，故这里**直接按最终形态定义**，P1 实现时就用六个值，不做只有四个值的中间版本。P1 阶段 `ai-pick` 永远不会出现在任务行里，但枚举里留着位置 —— 这样 P2 落地时契约零改动。

## 6. 自动补货

### 6.1 参数

| 项 | 值 |
| --- | --- |
| 触发阈值 | 池子 < 5 局 |
| 目标 | 补到 15 局 |
| 周期 | 只补 `5m` |
| 自停阈值 | 连续 2 次无产出 |

只补 `5m` 的理由：训练窗口目前写死以 `5m` 开局（`apps/web/src/train-entry.tsx`），其余四档灌了用不上，纯占用接口。手动补货保留选周期的余地，等 P2 的标签落地、用户开始挑题型时再放开。

阈值 5 / 目标 15 的理由：15 局够连续练一阵不断粮；下限 5 留足缓冲，使补货发生在「还有得练」的时候，而不是等到断粮才开始。

### 6.2 触发点

- **读池子时** —— `listPool()` 被调用，或 `open()` 因无题失败时
- **打完一局后** —— session 结算

**排除 app 启动时触发**：启动是用户最想立刻看盘的时刻，此时跑一个分钟级、反复打长桥的任务会与实时行情抢接口；且多数启动并不打算训练。

**排除定时器**：定时器是最强形式的「隐身」，也是唯一一种用户完全没有心理预期的触发方式。上面两个触发点都锚在用户的实际动作上。

### 6.3 判定顺序

`autoRefill.ts` 的纯函数按序判定：

1. 开关关闭 → 不补（`disabled`）
2. 连续无产出达阈值 → 不补（`backoff`）
3. 已有任务在跑 → 不补（`busy`）
4. 池子 ≥ 5 局 → 不补（`sufficient`）
5. 否则补 `15 − 当前局数` 局

其中「局数」一律指 `TrainerPoolCounts.byBasePeriod['5m']`，不是 `total`。用 `total` 会让其他档的存货掩盖 `5m` 的空缺 —— 而训练窗口只开 `5m`，那些存货一局都用不上。

### 6.4 连败计数不单独存储

从任务表倒推：自最近一条往前，连续「无产出」的条数，遇到有产出的任务即停止计数。

「无产出」= `status === 'failed'` **或** `admitted === 0`（后者的必要性见 §7.2）。

**`aborted` 不计入退避**，直接跳过不参与计数。取消是用户的主动行为，不是系统撞墙 —— 若计入，用户点一次取消就会把自动补货往自停推一格。

这样得到两个性质：

- 天然跨重启 —— 失败记录不会因为重启被抹掉
- 「手动补一次就恢复」自动成立 —— 手动跑出产出后，最近一条即为有产出，计数归零

**退避只拦自动，不拦手动。** 用户亲手点击时意图明确，不应被系统的退避策略阻挡；何况长桥未登录这类问题，正需要手动重试才能确认已修复。

### 6.5 开关

存 `app_meta` 表（现成 k/v，`packages/core/src/db/schema.ts:189`），不新建表。

设置页新增「训练」小节，其中只有这一个开关。为一个开关开一个小节略显重，但一个会自行启动的功能必须有明确的地方能关掉，藏在卡片角落里不合适。

## 7. 对 `fillCasePool` 的两处行为修正

这两处超出「只加 `onProgress`」的范围，但不修则自动补货会退化成反复捶接口的机器。

### 7.1 采样不足时保留已采到的候选

**现状**：`sampleCandidates` 在凑不满目标数量时抛 `CandidateSamplingExhaustedError`，`fillCasePool` 接住后直接返回 `admitted: []`（`apps/pro/src/modules/training/fillCasePool.ts:92`）—— 已采到的候选连同其长桥调用一起作废。要 15 局、采到 12 个，结果是 0 局。

**为何必须改**：手动命令行时代尚可忍受（用户看到报错自行降低 `--count` 重跑）。接上自动补货后成为硬伤：池子空 → 自动补货 → 采样不足 → 0 局 → 用户再看一眼卡片 → 再次触发 → 再次 0 局，每轮白打数百次长桥调用。

**改法**：采样允许部分成功 —— 采到多少用多少，`sampleCandidates` 不再抛异常，「要 15 只采到 12」记入 funnel 的 `rejections`，不作为失败。

### 7.2 零产出必须计入退避

修完 7.1 后仍有残余情况：市场数据确实太差，一局都没过闸。此时任务正常跑完（`done`）但产出为零。若退避只数 `failed`，则数不到它，退避永不触发，同样构成无限重试。

**改法**：退避口径为「连续无产出」，`failed` 与 `admitted === 0` 同等对待。有产出（哪怕 1 局）即清零。

## 8. UI

### 8.1 `TrainerCard` 状态表

| 池子 / 任务状态 | 提示文字 | 主按钮 |
| --- | --- | --- |
| 未授权 | 订阅后可用 | 了解订阅 |
| 有货、无任务 | 案例池还有 N 局 | 开一局 |
| 空池、无任务 | 案例池是空的 | 补货 |
| 补货中 | 正在采样候选（12/20）· 已入池 3 | 补货中…（禁用）+ 取消 |
| 上次失败 | 上次补货失败：{原因} | 重试补货 |
| 上次零产出 | 上次补货没找到合规案例 | 重试补货 |
| 自动补货已自停 | 连续两次没补到，自动补货已暂停 | 手动补货 |

最后一行是必需的：自停状态若不说出来，用户会遇到「自动补货怎么不动了」而无从查起。

### 8.2 训练窗口空状态

训练窗口直接调 `open()`，不经过 `listPool`，因此池子为空时只会显示「没有可用的训练局」，触发器不响。故触发点扩展为「`listPool()` 被调用，或 `open()` 因无题失败时」，训练窗空状态文案相应改为「没有可用的训练局，正在自动补货…」。

## 9. 错误处理

| 情况 | 处理 |
| --- | --- |
| 长桥未登录 / 限流 / 网络故障 | `failed`，原文错误落表并直显，计入退避 |
| `BlindAliasSpaceExhaustedError` | 非错误，表示池中已有 1000 局。文案「案例池已满」，**不计入退避** |
| 用户取消 | `aborted`，已写入池的 case 保留（文件写完即生效，不回滚） |
| 进程崩溃 | 启动时把 `running` 但无活跃 run 的任务标为 `failed`，照抄 `recoverInterruptedResearchRefresh` |

## 10. 测试

- `autoRefill` 判定：5 条分支各一，纯函数，不启动 kernel
- 连败计数自任务行推导：空表 / 全 failed / 中间有产出 / 有零产出的 `done` / 有 manual
- 任务引擎：重入返回 409、abort、崩溃恢复
- `fillCasePool` 部分成功：采样不足时仍有产出（§7.1 的回归测试）
- `TrainerCard` 新增状态：补货中、失败、自停
- CLI 回归：`training:fill-pool` 行为不变

## 11. 留给 P2 的既定约束

P2 是原设计 §121 的「第二道闸：AI 精选」，单独出 spec。以下三条已在本轮讨论中定下，P1 的接口设计不得堵死它们：

1. **只打标签，不毙盘** —— `worthy` 记录但不生效。理由：AI 判定「这盘不值得练」时用户无从验证对错（题目已被毙，永远见不到）。先只记不杀，积累「它标 unworthy 但练着有收获」这类反例，再决定是否赋予否决权。
2. **AI 看真盘** —— 精选闸跑在匿名化之前，输入含真实代码与日期。
3. **标签只进 epilogue 文件** —— 与 provenance 同处，收盘才揭晓。这期不做按标签选盘：选盘与盲盘的前提冲突（指定练「假突破」即等于已知题型）。若将来要做，应作为独立的「指定题型练习（会剧透题型）」模式，而非把标签摆到开局前可读的位置。

4. **输出只有 `worthy` + `tag`，不要 `difficulty`** —— 难度由用户自己的真实战绩产出，且是针对个人校准过的；模型猜的主观难度会污染这个更可靠的信号。
5. **新增 `casePick` 角色**，不复用 `comment` / `analyst`。
6. **存量 case 不补标，且不实现匿名化反解** —— 反解函数会把「case 侧单向」从结构性保证降级为约定性保证。

因 2 与 3，P2 的 AI 输出属于「带真实身份的一侧」，`TrainerFillTask` 契约中不得出现任何标签字段。

另需注意：P2 的模型解析依赖 kernel 内的设置访问，这正是 P1 的产出 —— 故顺序必须是 P1 → P2。完整设计见 `2026-07-28-blind-case-ai-pick-design.md`。

## 12. 参考

- 原设计：`docs/superpowers/specs/2026-07-25-blind-replay-training-design.md`
- 长任务参照：`apps/pro/src/ai/researchRefresh.ts`、`packages/core/src/db/schema.ts:141`
- 现有管线：`apps/pro/src/modules/training/fillCasePool.ts`
- 池子存储：`apps/pro/src/modules/training/casePoolPaths.ts`
