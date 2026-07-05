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
| **pi（`@earendil-works/pi-coding-agent`，含 pi-agent-core）** | **选定**。TS SDK 可 headless 跑（`createAgentSession()`），支持扫描 Claude 格式的 skill 目录，支持 Anthropic OAuth 订阅登录，也支持任意 provider API key |

pi 的优势 = Agent SDK 的整洁 + CLI 的计费灵活性。

## 架构

### server 新增

**`services/deepDive.ts`**（核心服务）

- `AuthStorage.create()` 复用本机 `~/.pi` 登录态（前提：用户先在终端里给 pi 登录过；server 不管登录流程）。
- 模型来自环境变量 **`AI_DEEPDIVE_MODEL`**（格式 `provider/id`，如 `anthropic/claude-opus-4-8`），经 pi 的 `ModelRegistry` 解析。**缺失则功能整体停用**（接口返回 503），server 照常启动——与 `AI_COMMENT_MODEL` 缺失的行为约定一致。
- `createAgentSession({ cwd: 仓库根目录, ... })`，通过 pi settings 把两处 skill 目录加进扫描：仓库的 `.claude/skills/` 和 longbridge 插件 skill 的安装目录（对应 `skills-lock.json`）。
- prompt 为固定 English 模板：对 `{SYMBOL}` 执行 stock-deep-dive 六镜流程，增量更新 `stocks/{SYMBOL}.md`，禁止改动其它文件，笔记内容用中文白话。
- 并发控制：**全局同时只允许 1 个深度分析**（不只是单标的互斥），防止多个 agent 同时打 longbridge CLI。
- 超时：单次 15 分钟，超时终止会话并记为失败。
- 越界检查：启动前记录 `git status`，结束后再查一次，改动超出 `stocks/{SYMBOL}.md` 范围时在通知里加 ⚠️ 警告（不自动回滚，人来判断）。
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

1. **pi SDK 模式加载 skill 的配置未在官方 SDK 示例中演示**。实现第一步先写冒烟脚本 `app/server/scripts/deep-dive-smoke.ts`：用便宜 prompt 验证会话能发现并读取 stock-deep-dive 的 SKILL.md，通过后再写正式服务。若 SDK 模式确实带不动 skill，降级方案：把 SKILL.md 内容直接读进 prompt——六镜流程本质是操作指引 + longbridge CLI 调用，agent 有 bash 工具即可等价执行。
2. **写文件安全靠 prompt 约束不硬**：用 git status 前后对比兜底（见上）。
3. **计费跟 provider 走**：`anthropic/...` + pi OAuth 登录 = 订阅额度；配了 API key 的 provider = 按量。由 pi 的 AuthStorage 决定，本设计不额外处理。

## 测试

- `deep-dive-smoke.ts`：真跑一次便宜验证（skill 可见性 + 会话能跑通），对应现有 `ai-smoke.ts` 的定位。
- note / status 接口单测，纳入 `cd app && pnpm test` 体系。
