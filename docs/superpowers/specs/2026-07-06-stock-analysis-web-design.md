# 设计：把个股深度分析接进 chart web 应用

日期：2026-07-06
状态：已确认（口头评审通过，待实现）

## 目标

`stocks/{SYMBOL}.md` 六镜深度笔记目前只存在于 markdown，web 看不到；深度分析只能在 Claude Code 会话里手动跑。本设计让个股驾驶舱（`#/symbol/:sym`）做到两件事：

1. **看**：新增「研究笔记」标签页，渲染该标的的 `stocks/{SYMBOL}.md`。
2. **跑**：页面上点按钮触发一次完整的六镜深度分析（stock-deep-dive 流程），后台 headless 跑完后增量更新笔记文件，发 macOS 通知。

范围明确排除：journal 文档浏览（只做 stocks 笔记）、分析过程实时展示（发射后不管）、任务队列/历史面板。

## 核心决策：用 pi-agent-core 跑分析

对比过的三条路：

| 方案 | 结论 |
|---|---|
| spawn `claude` CLI 子进程 | 可行，走订阅计费，但子进程 + stdout 解析糙 |
| Claude Agent SDK（`@anthropic-ai/claude-agent-sdk`） | 接口好，但官方禁止复用 claude.ai 订阅登录，只能 API key 按量计费，弃 |
| `@earendil-works/pi-coding-agent` 全 harness | skill 自动发现 + bash 全开，但要加新依赖、SDK 模式加载 skill 未验证、写文件安全只能靠 git 对比兜底，弃 |
| **bare `pi-agent-core` + 自建 skill loader** | **选定**。server 现有分析员/点评员已在用 `pi-agent-core` 的 `Agent`（自定义工具模式），深度分析沿同一模式，skill 机制用一个小 loader 复刻 |

### skill loader 设计（`services/skills.ts`）

Claude 式 skill 的三件事，各自复刻：

1. **发现**：扫描仓库 `.claude/skills/*/SKILL.md` 与 longbridge 插件 skill 目录，解析 frontmatter 的 `name` / `description`，构建索引。
2. **渐进加载**：system prompt 只含 skill 索引（名字 + 描述），提供 `read_skill(name)` 工具，agent 按需读取全文——与 Claude Code 行为一致。
3. **执行**：`bash` 工具跑 skill 指令（`longbridge` CLI、python 脚本），cwd 固定仓库根目录、单命令超时；写文件走独立的 `write_note` 工具，**硬性限定只能写 `stocks/{SYMBOL}.md`**。

好处：与 analyst.ts 同构、复用现有 `attachAiUsageLogger` 计费统计与测试模式；写入硬受限后 git 越界检查退化为兜底断言；loader 通用，未来其它 agent 功能可复用。计费走 pi-ai 现有的 provider 解析（`AI_DEEPDIVE_MODEL` 环境变量，同 `AI_ANALYST_MODEL` 机制）。

## 架构

### server 新增

**`services/skills.ts`**（skill loader，见上）

**`services/deepDive.ts`**（核心服务）

- 模型来自环境变量 **`AI_DEEPDIVE_MODEL`**（格式 `provider/id`），经现有 `ai/models.ts` 的 `parseModelRef`/`resolveModel` 解析。**缺失则功能整体停用**（接口返回 503），server 照常启动——与 `AI_COMMENT_MODEL` 缺失的行为约定一致。
- `new Agent({ systemPrompt, model, tools })`（pi-agent-core，同 analyst.ts 模式），tools = `read_skill` + `bash`（cwd 仓库根、单命令超时）+ `read_file` + `write_note`（硬限 `stocks/{SYMBOL}.md`）。挂 `attachAiUsageLogger` 记费用。
- prompt 为固定 English 模板：对 `{SYMBOL}` 执行 stock-deep-dive 六镜流程，增量更新 `stocks/{SYMBOL}.md`，笔记内容用中文白话。
- 并发控制：**全局同时只允许 1 个深度分析**（不只是单标的互斥），防止多个 agent 同时打 longbridge CLI。
- 超时：单次 15 分钟，超时终止会话并记为失败。
- 越界兜底：`write_note` 已硬受限；结束后仍以 `git status` 断言一次，异常改动在通知里加 ⚠️ 警告。
- 结束通知：复用现有 `ai/notify.ts` 的 macOS 通知通道——成功「{SYM} 深度分析完成」，失败带错误摘要（全文进 server 日志）。

**REST 接口**

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/symbols/:sym/note` | 读 `stocks/{SYMBOL}.md`（symbol 去 `.US` 后缀映射文件名），返回 `{markdown, mtime}`；文件不存在返回 `{markdown: null}` |
| `POST` | `/api/symbols/:sym/deep-dive` | 触发分析。已有分析在跑 → 409；env 缺失 → 503 |
| `GET` | `/api/symbols/:sym/deep-dive/status` | 返回 `{running, startedAt?, lastResult?}`，供前端轮询和刷新后恢复状态 |

### web 新增

**SymbolCockpit 第五个标签页「研究笔记」**

- markdown 渲染：新增依赖 `react-markdown` + `remark-gfm`（六镜笔记表格多）。样式沿用现有暗色体系，基础排版即可。
- 顶部显示笔记 `mtime` + 「重新深度分析」按钮；无笔记文件时显示空态说明 + 同一按钮。
- 按钮状态机：`idle → 确认弹窗（提示耗时几分钟、消耗额度）→ running（禁用，显示已耗时）→ done/failed → idle`。
- running 由 status 接口轮询驱动（10s 一次，仅笔记标签页激活时），页面刷新可恢复。
- done 自动重拉 note 接口刷新内容；failed 显示错误摘要，可重试。

### 错误态汇总

| 情况 | 表现 |
|---|---|
| `AI_DEEPDIVE_MODEL` 未配置 | 503；按钮置灰 + 提示 |
| 已有分析在跑（任意标的） | 409；按钮提示「有分析进行中」 |
| 会话超时/失败 | 通知 + 页面错误摘要，日志留全文 |
| 改动越界 | 完成通知带 ⚠️ 警告 |

## 已知风险与对策

1. **skill 指令假定 Claude Code 环境**：SKILL.md 里可能引用并行工具块、子 skill 等 harness 特性。对策：deep-dive 的 system prompt 说明当前工具面（bash/read_file/read_skill/write_note），agent 按可用工具执行；冒烟脚本 `deep-dive-smoke.ts` 真跑一次验证产出质量。
2. **bash 工具是全能工具，越界写靠不住**：写入走 `write_note` 硬限制；system prompt 禁止 bash 写文件；结束后 git status 断言兜底。
3. **计费跟 provider 走**：由 pi-ai 的 provider/env key 机制决定（与现有点评员/分析员一致），本设计不额外处理。

## 测试

- `deep-dive-smoke.ts`：真跑一次验证（skill 索引 + read_skill + 会话跑通），对应现有 `ai-smoke.ts` 的定位。
- skills loader / note / status 接口单测，纳入 `pnpm test` 体系。
