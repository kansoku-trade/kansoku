# Skill 受众分流设计

日期：2026-09-05
状态：待实施

## 问题

一套 skill 目录同时喂两类消费方，两边都在吃对方的垃圾。

**App 吃到执行不了的指令。** analyst 的激活 skill `intraday-signal` 让模型 `curl POST http://localhost:1792/api/charts` 出图，可 adapter prompt 明写 `Never curl the local chart API from bash`；同一篇还让模型跑 `python3 .claude/skills/options-levels/scripts/levels.py`，而那个目录根本不存在。`chart` skill 的另一条路 `"$KANSOKU_CLI" chart create` 判据是环境变量 `$KANSOKU_CLI` 有值 —— 全仓只有它自己的 SKILL.md 提到这个变量，没有任何代码设置它，所以判据永远为假，回落到被禁的 HTTP。两条路都死。今天靠在 adapter prompt 里写「这两样在本运行时不存在」打补丁，补丁只会越来越长。

**External agent 吃到用不上的 App 资产。** `canvas` skill（998 字符描述 + 12.6K 正文）只被 `packages/core/src/canvas/tools.ts` 强制读取，Claude Code 侧零引用，却躺在 `.claude/skills/` 里被每个终端会话注入。

**开发工具进了发布产物。** `release`（发版流程）、`skill-creator`、`acceptance`、`generative-ui`（claude.ai 的 `show_widget` 设计规范，App 没有这个工具）会被 `stageSkills.mjs` 打进桌面版 `dist-skills`。

**Token 成本。** 目录全量注入约 26,322 字符 ≈ 8.8k token，挂在首条用户消息上。chat 会话付一次然后走缓存；**analyst 每次复评都是新会话**（`run.ts:102`，`sessionId = analyst:${symbol}:${runStartedAt}`），次次重付。

## 目标

1. **正确性** —— 每个运行时只看到自己能执行的指令
2. **Token 成本** —— 压缩注入体积
3. **可维护性** —— 写 skill 时不用在脑子里给两个受众分流
4. **发布边界** —— 开发工具不进用户产物

## 关键约束：控制权是不对称的

| 方向 | 我们控制得了吗 | 唯一有效的杠杆 |
| --- | --- | --- |
| App 看到什么 | 能 —— loader 是我们的代码 | 声明式清单 |
| External agent 看到什么 | **不能** —— 它扫目录、有就全注入 | **只有物理位置** |

这条决定了整个设计：一个清单管不了两个方向。标 `audience: app` 的 skill，Claude Code 照样注入。要让 external agent 看不见，**只能不放进 `.claude/skills` / `.agents/skills`**。

## 现状要点（实施前必读）

- `.claude/skills` 和 `.agents/skills` **不是两个受众，是同一集合的两个投影**。`scripts/sync-agents-skills.py` 双向软链：自研的从 `.claude` 链进 `.agents`，第三方的从 `.agents` 链回 `.claude`。所以「按受众拆这两个目录」的方案会和这套机制正面冲突。
- `skills-lock.json` 由外部 `skills` CLI 生成，每个条目带 `computedHash`，重装会重写。**不能往里加自定义字段。**
- 打包后 `PROJECT_ROOT` **不是仓库、是用户工作区**：`apps/desktop/src/boot/env.ts:42` 无条件设 `TRADE_PROJECT_ROOT = dataRoot`，`boot/paths.ts:34` 里 dev 时它是 `resolveRepoRoot()`、打包时是用户数据目录。所以打包后 skill 只来自 `TRADE_SKILLS_DIR`（`resources/skills`）。
- `loadSkillIndex` 已经按名字**先到先得**去重，多加一个搜索根天然支持同名覆盖。
- `trading-discipline` 已经是「SKILL.md 核心 + `references/` 分章、由代码按运行时组装」的形态（`promptPolicy.ts` 的 `APP_ONLY_DISCIPLINE_REFS` / `BENCH_ONLY_DISCIPLINE_REFS`）。本设计是把它推广，不是发明。

## 设计

### 三档归属

三档不是一个标签的三个值，是三种**不同的强制手段**。

| 档 | 物理位置 | 谁看得到 | 强制手段 |
| --- | --- | --- | --- |
| app-only | `packages/core/skills/` | 只有 App | 位置 |
| agent-only | `.claude/skills/`（不动） | 只有 external agent | App 侧清单排除 |
| both | `.claude/skills/`（不动） | 两边 | 内容层 `references/` 分章 |

**落档（33 个）**

- **app-only（1 个，要搬）**：`canvas`
- **agent-only（5 个，留原地）**：`chart`、`release`、`skill-creator`、`acceptance`、`generative-ui`
- **both（其余 27 个）**

其中 App 代码显式点名、**绝不能误分**的 5 个：

| skill | 被谁点名 |
| --- | --- |
| `trading-discipline` | `promptPolicy.ts` —— 缺失即 `DisciplineMissingError` 中止 |
| `intraday-signal` | analyst 激活态全文注入 |
| `stock-deep-dive` | `apps/pro/src/ai/deepDiveTools.ts:15` 预加载 |
| `korea-market` | `prompts.ts:80` |
| `twitter-reader` | `prompts.ts:37` |

**已接受的能力损失**：`canvas` 搬走后 Claude Code 会话读不到它的布局骨架。canvas 是 App 内生成物，可接受。

### `skills-policy.json`

放仓库根，与 `skills-lock.json` 平级。**只有 `agentOnly` 一个字段。**

```jsonc
{
  "version": 1,
  // 在 .claude/skills 里、但 App 不该看到的。
  // app-only 不列这里——它由位置强制，写进来就有两个真相源。
  "agentOnly": ["acceptance", "chart", "generative-ui", "release", "skill-creator"]
}
```

**为什么是 JSON 不是 TS 常量**：消费方有三个 —— 运行时 `skills.ts`、分章组装 `promptPolicy.ts`、打包 `stageSkills.mjs`。前两个是 TS，但 `stageSkills.mjs` 是 build 前跑的裸 node ESM，`import` 不了 TS。要让打包和运行时读同一份真相，只能是 JSON。

**为什么只列例外，不列全量 33 行**：三档定下后，归属能从位置推出来（在 core 根 → app-only；在 `.claude/skills` 且被列 → agent-only；其余 → both）。全量表里会有 27 行写着 "both" 且不含位置推不出的信息，纯粹是等着和现实脱节的副本。全貌改用生成（见「护栏」）。

**它只在两个场景被读，都不在打包运行时**：打包时决定拷哪些；dev 运行时因为直读 `.claude/skills`、没有打包过滤这一步。打包产物 `resources/skills` 里根本没有 agent-only 目录，所以读不到这个文件当空清单即可，行为正确 —— **不需要把它塞进 `dist-skills`**。

文件缺失时静默降级为空清单（而不是抛错），因为在打包运行时「缺失」是正常状态。代价是 dev 下删了这个文件会让 agent-only skill 悄悄漏进 App —— 这个洞由护栏 1 的快照测试兜住：清单失效会让解析结果 diff，CI 红。

### 分章用约定目录，不用配置

```
trading-discipline/
  SKILL.md                     # 两边都成立的核心
  references/
    app/                       # runtime 'app' 追加整个目录（按文件名排序）
      us-market-data.md
      journal.md
      market-analysis.md
    bench/
      episode-execution.md
```

`loadSkillIndex(dirs, { runtime })` 建索引时扫 `references/<runtime>/`，把文件列表放进 `SkillMeta.references`。加一章 = 加个文件，零配置。

代价：约定不是显式配置，往 `references/app/` 丢文件就会被注入。用 `pnpm skills:audit` 打印解析结果兜底。

**`both` skill 的正文纪律**：SKILL.md 正文只放两边都成立的内容，环境相关步骤全部下沉到 `references/`。External agent 读的是裸 SKILL.md，天然只看到正文；加载哪章由**我们的代码**按运行时决定，不靠 agent 自觉。

### 加载路径

```ts
export function skillSearchDirs(repoRoot: string = PROJECT_ROOT): string[] {
  const dirs: string[] = [];
  const envDir = process.env.TRADE_SKILLS_DIR;
  if (envDir) dirs.push(envDir);                              // 打包：唯一来源
  dirs.push(join(repoRoot, 'packages', 'core', 'skills'));    // 新增，dev 有效
  dirs.push(join(repoRoot, '.claude', 'skills'));
  return dirs;
}
```

core 根排在 `.claude/skills` 前面，配合既有的先到先得去重 = App 侧同名覆盖的逃生口（当前不使用）。

打包时两个根合并进 `dist-skills`，运行时只有一个目录 —— 位置分流只在 dev 和 external agent 侧有意义，打包产物里已无 external agent。

**runtime 挂在索引上，不是 `readSkill` 的参数。** 运行时不是逐次调用会变的量，而是「谁建的这个索引」的属性；一个进程要么是 App 要么是 bench。做成 `readSkill` 参数等于把一个常量沿所有 call site 传一遍，而 `readSkill` 跑在 agent loop 里、是同步 `readFileSync`，在 Electron 主进程上每次调用多做 N 次阻塞 IO。

```ts
loadSkillIndex(dirs, { runtime: 'app' })  // SkillMeta 多一个 references: string[]
readSkill(index, name)                    // 签名不变，读 SKILL.md + meta.references
```

于是 analyst 激活态注入、`read_skill` 工具、deepDive 预加载三条路都从同一索引取文本，分章自动一致生效。`promptPolicy` 的两个 loader 退化成「建对应 runtime 的索引 + `readSkill`」，两个 REFS 常量删除。

### 打包

`stageSkills.mjs` 三处改动：

```js
// 1. 多拷一个根
const coreSkillsDir = join(repoRoot, 'packages', 'core', 'skills');

// 2. 按 policy 排除
const agentOnly = new Set(readPolicy(repoRoot).agentOnly);
for (const name of readdirSync(claudeSkillsDir)) {
  if (agentOnly.has(name)) continue;
  ...
}

// 3. lock 完整性校验跳过被排除的
const missing = lockedNames.filter((n) => !agentOnly.has(n) && !exists(dest, n));
```

**第 3 处是必须的**：`generative-ui` 和 `skill-creator` 既在 `skills-lock.json` 里、又是 agent-only，现有的 `throw new Error('dist-skills 缺少 skills-lock.json 里锁定的 skill')` 会在每次打包时炸。

日志改成「App 可见 N 个，按 policy 排除 M 个：\<名字\>」，每次构建留一份可读的边界记录。

**丢弃项已核实安全**：`chart` 和 `release` 都只有 SKILL.md，无其他 skill 引用；三个 vendored 的同理。**`_shared` 必须保留** —— 里面是 `client.py` / `env.py`，`fred` / `gdelt` / `sec-edgar` 的脚本 import 它；它无 SKILL.md 所以本就不进索引，且不在 `agentOnly` 里，自动安全。

### 护栏

「只列例外」意味着**没有「未分类」这个状态**（不在 `agentOnly` 里就是 App 可见），所以做不了集合相等校验。三条替代，各管一个真实风险：

1. **生成式快照** —— `pnpm skills:audit` 把解析结果写成快照文件（每个 skill、在哪个根、App 可否见、拼哪几章），配一条 vitest 快照测试。装了新第三方 skill → 快照 diff → 必须看一眼再更新。这既是护栏，也是「全貌」的落地形态：生成的所以永远真实，进 CI 所以漏不掉。
2. **硬依赖测试** —— 断言上表 5 个 skill 在 `runtime: 'app'` 索引里解析得到。误加进 `agentOnly` 或搬错目录立刻红；把 `DisciplineMissingError` 这类运行时致命错提前到 CI。
3. **死条目 warn** —— `agentOnly` 里每个名字必须在某个根下存在。唯一例外是 `acceptance`（不在 `skills-lock.json`、不被 git 跟踪，只有本地有，CI 上不存在），所以这条只 warn 不 fail。留着它是因为本地那份 747 字符的浪费是真的。

## 实施顺序

六步，每步跑完树是绿的、可以停。

1. **落 `skills-policy.json`，替掉 `APP_HIDDEN_SKILLS`** —— 行为零变化，同样 5 个名字从代码常量搬到数据文件。验证：现有 `skills.test.ts` 原样通过 + 一条「policy 缺失时不过滤」。约 30 分钟。
2. **带 runtime 的索引 + 分章约定目录** —— 挪 `trading-discipline` 的 4 个 chapter 进 `app/` `bench/` 子目录；`loadSkillIndex` 扫子目录；`readSkill` 内部拼接；删两个 REFS 常量；pro 侧两处建索引传 `'app'`；改 `trading-discipline/SKILL.md` 的 chapter inventory 和根 `CLAUDE.md` 对应段落。**最险的一步** —— 这条路 fail-closed，拼错不是少几句话，是 agent 不跑或少半部纪律。验证：断言 app 文本含那 3 章、不含 `episode-execution`，bench 反之；analyst / deepDive / bench 现有测试全绿。约 2 小时。
3. **加 `packages/core/skills/` 进 `skillSearchDirs`** —— 空目录先加，行为无变化。单独一步是为了让第 4 步的 diff 只有搬家。约 10 分钟。
4. **`canvas` 搬家** —— `git mv` 加四处连带：`packages/canvas-sdk/tsconfig.json:15` 的 `outDir`（`sdk/*.d.ts` 是构建产物）、`packages/core/src/events/eventCanvasPersona.ts:43` 的 prompt 硬编码路径、`canvas/SKILL.md` 第 87/110/228 行、`.gitignore` 白名单。验证：跑一次 canvas-sdk 构建确认 `.d.ts` 落在新位置；断言 canvas 从 core 根解析得到且 `.claude/skills/canvas` 不复存在。约 45 分钟。
5. **`stageSkills.mjs`** —— 两个根 + 排除 + lock 校验跳过 + 日志。验证：直接跑脚本，断言 `dist-skills` 无那 5 个、有 `canvas`、有 `_shared`、锁定的其余 16 个齐全。约 40 分钟。
6. **护栏** —— audit 命令 + 快照测试 + 5 条硬依赖断言 + 死条目 warn。约 1 小时。

**总计约 5 小时。**

**可以中途停的点**：停在 1 = 今天的状态但配置化；停在 2 = 纪律组装不再硬编码；停在 5 = **要的能力全部到位**；6 是护栏，晚做只增加漏网风险，不影响功能。

## 跨仓边界

第 2 步动 `apps/pro` 两个文件（`deepDiveTools.ts`、`researchChat.ts`）。按 OSS → Pro 硬规则：同一 session 内改完、跑 `pnpm --filter @kansoku/pro typecheck`、pro 单独提交、两个 remote 都推、再挪超级仓 gitlink。其余步骤不碰 pro。

## 不在本次范围

**`intraday-signal` 拆 core + references**（第二期）。它的判断方法（多周期趋势、MACD 背驰、R/R 口径、场景概率）留正文；`curl POST /api/charts` 出预览、`PATCH` 回填下沉 `references/claude-code/`；`submit_prediction` 一次成功、期权位从 `data_snapshot.options_levels` 取下沉 `references/app/`。**必须等一期落地**，因为依赖第 2 步的分章机制。拆完之后 `prompts.ts` 里现有那条「两样东西在本运行时不存在」的补丁即可删除 —— 那是权宜之计，正解是正文里本就不该出现。

**autoload 声明的收编。** 现在三个 persona 三套硬编码：analyst 用 `buildAnalystSkillContexts` 的 Map 经 `ActivatedSkillsProvider` 注入 user message；deepDive 拼进 system prompt（`deepDiveTools.ts:29`）；chat / assistant 走 `promptPolicy` 组装。可见性（谁能看到哪个 skill）和编排（哪个 persona 开局强喂哪几个）变更节奏不同，捆在一个叫 policy 的文件里容易越权。本次只统一它们的加载层，收编留作独立一轮 —— 那时三条路已共享同一加载层，成本更低。
