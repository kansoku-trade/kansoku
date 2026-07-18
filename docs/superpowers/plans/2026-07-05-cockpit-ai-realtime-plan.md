# 驾驶舱 AI 实时分析 — 实现计划

规格：`docs/superpowers/specs/2026-07-05-cockpit-ai-realtime-design.md`（先读）

## 全局约束（每个任务都适用）

- 代码零注释、零 JSDoc（项目硬规则）。标识符自解释。
- `apps/server` 是 ESM + TypeScript（tsx 运行），相对导入必须带 `.js` 后缀。
- 测试用 vitest，放 `apps/server/test/`，风格参照现有测试（如 `poller.test.ts`、`cockpit.test.ts`，共用 `helpers.ts`）。测试不得真调 LLM、不得真调 longbridge CLI —— 一律注入假实现。
- 单文件 ≤ 500 行；React 组件 ≤ 300 行。
- 每个任务完成后跑 `pnpm -C apps/server test`（改了 web 再跑 `pnpm -C apps/web typecheck` 如有该脚本，没有则 `npx tsc --noEmit -p apps/web`），然后 git commit（只提交本任务文件）。
- 不写 `journal/` 下任何文件（除任务 3 的 comments 存储目录约定外，测试要用临时目录）。
- 文档/README 用中文白话；代码、commit message 用英文。
- 模型串格式 `provider/id`（如 `anthropic/claude-haiku-4-5`）；环境变量 `AI_COMMENT_MODEL`、`AI_ANALYST_MODEL`，缺失即该层停用，server 照常启动。

## 任务 1：依赖与模型配置 `ai/models.ts`

- `pnpm -C apps/server add @earendil-works/pi-agent-core`（会连带 `@earendil-works/pi-ai`）。
- 新建 `apps/server/src/ai/models.ts`：
  - `parseModelRef(raw: string): { provider: string; id: string } | null` — 按第一个 `/` 切分，非法返回 null。
  - `resolveModel(envValue: string | undefined)` — 缺失/非法返回 null，否则用 `pi-ai` 的 `getModel(provider, id)` 返回 Model；`getModel` 抛错（未知 provider/id）也返回 null 并 `console.error` 一行。
  - `aiConfig()` — 读 `process.env.AI_COMMENT_MODEL` / `AI_ANALYST_MODEL`，返回 `{ commentModel, analystModel }`（各自可 null）。
- 测试：parse 合法/非法、缺失变量返回 null、非法 provider 不抛异常。

## 任务 2：触发检测器 `ai/triggers.ts`

- 纯函数 `detectTriggers(input): Trigger[]`。`Trigger = { kind, detail }`，kind 枚举：
  `macd_cross`（金叉/死叉，m5 MACD hist 符号翻转）、`level_break`（最新价上穿/下穿存档预测的 entry/stop/target 价位，相对上一根收盘）、`flow_flip`（当日主力资金流累计值方向翻转）、`volume_spike`(最新一根 m5 成交量 > 前 20 根均量 × 3)。
- 输入是显式的窄结构（bars、macd hist 序列、flow 序列、预测价位），不依赖 services —— 由调用方（任务 7）喂数据。
- 心跳不在这里：`shouldHeartbeat(lastRunAt, now)` 简单函数，≥5 分钟返回 true。
- 测试覆盖每种信号的触发与不触发、边界（恰好等于价位、序列不足 20 根）。

## 任务 3：点评流存储与接口 `ai/comments.ts`

- 存储目录：`CHART_DATA_DIR/comments/`（复用 `env.ts` 的 CHART_DATA_DIR，即 `journal/charts/data/`），文件 `<SYM>-YYYY-MM-DD.json`，内容 `CockpitComment[]`。
- `CockpitComment = { ts: string(ISO), symbol, level: "info"|"warn"|"alert"|"error", text, trigger?: string, source: "commentator"|"analyst"|"system", escalated?: boolean, chartId?: string }`，类型放 `packages/shared/types.ts`。
- `appendComment(c)`（读-改-写整文件，追加）+ `listComments(symbol, date)`。
- 内存事件总线：`onComment(symbol, listener)` / append 时广播 —— SSE 用。
- 路由：
  - `GET /api/symbols/:symbol/comments?date=YYYY-MM-DD`（缺省今天，美东日期）返回当天列表。
  - `GET /api/stream/comments/:symbol` SSE：连接即推当天历史（一条 `{type:"init", comments}` envelope），此后每条新点评推 `{type:"comment", comment}`。挂进现有 `streams.ts` 的 `sse()` 助手。
- 测试：追加/读取（临时目录覆盖 CHART_DATA_DIR，参照现有测试怎么隔离数据目录）、事件广播、路由（含日期缺省）。

## 任务 4：数据包构建 `ai/datapack.ts`

- `buildCommentPack(symbol)`：最新报价、近 48 根 m5 K 线+MACD、当日资金流序列、当前存档预测摘要（方向/锚点/止损/目标，取该 symbol 当天最新 intraday 存档）、最近 5 条已发点评、触发原因由调用方并入。复用现有 services（`intraday.ts`/`longbridge.ts`/`store.ts`/`simple.ts` 里已有的取数函数——先读这些文件找现成函数，不要新起 longbridge 调用路径）。
- `buildReassessPack(symbol)`：三周期（m5/m15/h1）K 线+指标、当日资金流、当前存档预测全文、持仓（有现成持仓服务就用，没有就留 null 占位并在返回结构里注明字段）。
- 找"当天最新 intraday 存档"：扫 `store.ts` 的列表接口按 symbol+type+日期过滤。
- 输出是可 JSON 序列化的普通对象，附 `truncateForPrompt(pack, maxChars)` 保底截断。
- 测试：注入假的底层取数函数（模块参数化或 vi.mock），断言 pack 结构与截断。

## 任务 5：点评员 `ai/commentator.ts`

- `runCommentator({ symbol, pack, trigger, deps })`：
  - `deps` 注入 `{ model, agentFactory?, appendComment }`，生产默认用 pi-agent-core 的 `Agent`。
  - 一次性 Agent：系统提示词（中文点评员角色 + 输出纪律：中文白话≤2句、必须调 submit_comment）+ pack JSON 作为 prompt。
  - 唯一工具 `submit_comment`，typebox schema `{ level: "info"|"warn"|"alert", text: string, escalate: boolean }`，执行即落盘（appendComment）并返回 `terminate: true`（用 `afterToolCall` 或工具结果的 terminate 机制）。
  - AbortController 60 秒超时；超时/异常 → 写一条 `level:"error", source:"system"` 点评，不抛出。
  - agent 跑完但没调工具 → 同样按失败处理（error 点评）。
  - 返回 `{ escalate: boolean }`。
- 每标的内存锁：`runningCommentators: Set<symbol>`，占用中直接跳过（返回 escalate:false）。
- 测试：假 agentFactory（脚本化触发 submit_comment / 不触发 / 超时路径），断言落盘内容、锁、error 降级。真实 Agent 类不进测试。

## 任务 6：分析员 `ai/analyst.ts` + 重估路由

- `runAnalyst({ symbol, deps })`，deps 注入 model、agentFactory、工具的底层函数。五个工具：
  - `read_data_pack` → 任务 4 的 `buildReassessPack`
  - `fetch_news(symbol)` → 现有新闻取数（找 services 里现成的；没有就调 longbridge CLI 的封装 `longbridge.ts`）
  - `fetch_kline({ period, count })` → 现有 kline 取数，period 限 m5/m15/h1/day，count ≤ 500
  - `submit_prediction(body)` → schema 校验后走现有 chart 创建逻辑（`buildChart` + `saveChart`，对齐 `routes/charts.ts` POST 的 intraday 分支行为），成功后 terminate，返回新 chartId
  - `append_comment({ level, text })` → 写一条 `source:"analyst"` 点评（带 chartId）
- 系统提示词：等价 `intraday-signal` 的分析纪律浓缩版（方向+锚点+止损+目标+三情景，中文白话）。
- AbortController 10 分钟超时；失败 → error 点评。每标的内存锁 + 升级触发 30 分钟冷却表（手动触发不受冷却限制）。
- 路由 `POST /api/symbols/:symbol/reassess`：立即返回 `{ ok, data: { started: boolean, reason? } }`（已在跑/层停用时 started:false），后台跑。
- 测试：假 agentFactory 脚本化调各工具，断言 submit_prediction 走了 chart 创建（假的 buildChart/saveChart）、冷却、锁、路由响应。

## 任务 7：调度整合 `ai/scheduler.ts`

- server 启动时（`index.ts` 或 `app.ts`）启动 AI 调度器（`AI_COMMENT_MODEL` 缺失则不启动）：
  - 每 60 秒 tick：仅美股盘中（复用 `services/session.ts` 的时段判断，只取盘中 regular session）。
  - 目标集合：当天（美东日期）有 intraday 存档的 symbol（复用任务 4 的存档扫描）。
  - 每 symbol：取增量数据（复用任务 4 comment pack 的取数）→ `detectTriggers` → 有触发或 `shouldHeartbeat`（5 分钟）→ `runCommentator`。
  - `escalate=true` → 检查冷却 → `runAnalyst`（升级来源）。
  - tick 内单 symbol 异常只记 console，不影响其他 symbol；tick 串行防重入（参照 poller.ts 的 running 标志）。
- 测试：假时钟（vi.useFakeTimers）+ 全假依赖，断言：盘外不跑、无存档不跑、触发→点评、escalate→重估、心跳节奏、重入保护。

## 任务 8：Web UI（驾驶舱）

- `SymbolCockpit.tsx` 右栏加「AI 点评」tab（新组件 `apps/web/src/pages/cockpit/AiTab.tsx`）：
  - 打开时 `GET /api/symbols/:sym/comments`，随后 `EventSource /api/stream/comments/:sym` 实时追加（复用现有 SSE 客户端模式，看 `useIntervalFetch.ts` 与其他 tab 怎么连）。
  - 条目：时间 + level 徽标（info 灰 `#949494` / warn 黄 `#ffc107` / alert 红 `#ef5350` / error 红底）+ 文本 + 触发原因；`chartId` 有值时链接到 `/#/charts/<id>`；`escalated` 显示"已升级重估"。
  - 连续 ≥3 条 info 心跳折叠为一行"HH:MM–HH:MM 无事 ×N"，点击展开。
  - tab 标签带未读小红点计数（切走后新到的 warn/alert 数）。
  - tab 顶部"重新分析"按钮 → `POST /api/symbols/:sym/reassess`，`started:false` 时按钮短暂提示"已在运行"；运行中转圈禁点（以最近一条 analyst/system 点评或按钮响应态为准，简单实现即可）。
- 顶部报价条：最新一条 warn/alert 点评显示为小徽章（红/黄脉动圆点 + 时间 + 摘要），点击切到 AI 点评 tab。当天无 warn/alert 则不显示。
- 样式进 `styles.css`，沿用现有 token（#121212/#1c1c1c/#272727/#26a69a/#ef5350/#ffc107）。
- 视觉基准：mockup 见 scratchpad `cockpit-ai-mockup.html`（本任务简述即可，按上述条目实现，不必像素级还原）。
- 验证：`npx tsc --noEmit -p apps/web`（或 web 包现有 typecheck 方式）。

## 任务 9：冒烟脚本与文档

- `apps/server/scripts/ai-smoke.ts`：读 `.env` 模型配置，对一个传入 symbol 真跑一次 commentator（真模型、真数据），打印结果；`--analyst` 开关真跑一次 analyst。不进 CI。用法注释不写在代码里，写进 README。
- `apps/README.md` 加「AI 实时分析」小节：环境变量、两层机制、点评存储位置、冒烟脚本用法。
- `.claude/skills/chart/SKILL.md` 在 cockpit 相关段落补一句：驾驶舱有 AI 点评流与自动重估，产物与手动 `intraday-signal` 同格式。
