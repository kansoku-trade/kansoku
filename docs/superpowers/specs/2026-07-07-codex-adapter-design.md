# AI 模块接入本地 codex（openai-codex 适配器）设计

日期：2026-07-07

## 背景与目标

`app/server/src/ai/` 的三个 AI 层（盘中点评员 commentator、分析师 analyst、深挖 deepDive）通过 `@earendil-works/pi-agent-core` 的 `Agent` 跑模型，模型由环境变量 `AI_COMMENT_MODEL` / `AI_ANALYST_MODEL`（格式 `provider/id`）经 `models.ts` 从 pi-ai 的内置目录解析。

目标：让这些层可以使用本地 codex CLI 登录的 ChatGPT 账号（`~/.codex/auth.json`）作为模型后端，即 `openai-codex/*` 系列模型，无需 API key、无需额外登录。

## 关键事实（调研结论）

- pi-ai `0.80.3`（已在依赖中）内置 `openai-codex` provider：模型目录（`gpt-5.5` / `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.3-codex-spark` 等，含价格表）、`openai-codex-responses` API（指向 `https://chatgpt.com/backend-api`）。`builtinModels()` 已包含该 provider，`models.ts` 无需改动。
- 该 API 的鉴权只需要一个 OAuth access token（JWT，内含 account id）。`Agent` 构造参数支持 `getApiKey(provider)` 钩子，agent loop 在每次请求前调用它。
- pi-ai 使用的 OAuth client id 与 codex CLI 相同（`app_EMoamEEZ73f0CkXaXp7hrann`），因此 `~/.codex/auth.json` 里的 `tokens.access_token` / `refresh_token` 直接兼容。
- pi-ai 公开导出 `refreshOpenAICodexToken(refreshToken)`（自 `@earendil-works/pi-ai/oauth`），返回 `{access, refresh, expires}`。
- `~/.codex/auth.json` 结构：`{auth_mode, OPENAI_API_KEY, tokens: {id_token, access_token, refresh_token, account_id}, last_refresh}`。

因此适配器只是一层很薄的 token 加载器，不需要子进程包装 codex CLI，也不需要自建 OAuth 登录流程。

## 方案

### 1. 新文件 `app/server/src/ai/codexAuth.ts`（约 80 行）

导出 `getCodexApiKey(provider: string): Promise<string | undefined>`：

- provider 不等于 `"openai-codex"` 时返回 `undefined` —— 其他 provider 走 pi-ai 原有的环境变量取 key 路径，行为完全不变。
- 读取 `~/.codex/auth.json`（目录可用环境变量 `CODEX_HOME` 覆盖，与 codex CLI 约定一致），取 `tokens.access_token`。
- 解码 JWT 的 `exp`，保留 60 秒余量：未过期直接返回。
- 已过期：调用 `refreshOpenAICodexToken(tokens.refresh_token)` 刷新，成功后按 codex 原格式回写同一文件——仅更新 `tokens.access_token`、`tokens.refresh_token`、`last_refresh`（ISO 时间戳），保留 `id_token`、`account_id`、`auth_mode`、`OPENAI_API_KEY` 等字段，codex CLI 之后照常可用。
- 并发去重：刷新进行中时把 Promise 挂在模块级变量上，同时到来的调用等待同一个结果，避免并发轮换刷新令牌。
- 失败路径：文件不存在、JSON 解析失败、刷新请求失败时返回 `undefined`，并打一条清晰日志（提示先运行 `codex` 登录）。上层 Agent 请求会因缺少 key 报错，落入各层现有的错误处理（如点评员写一条 error 点评），不会影响服务本身。

为可测试性，内部实现接受可注入的依赖（auth 文件路径、refresh 函数、时钟），`getCodexApiKey` 是绑定默认依赖的导出。

### 2. 接线（3 处）

`commentator.ts`（`defaultAgentFactory`）、`analyst.ts`、`deepDive.ts` 中的 `new Agent({...})` 各加一行：

```ts
getApiKey: getCodexApiKey,
```

### 3. 使用方式（零代码）

`.env` 设置例如：

```
AI_COMMENT_MODEL=openai-codex/gpt-5.4-mini
AI_ANALYST_MODEL=openai-codex/gpt-5.5
```

现有的 usage 记账（`usage.ts` / `usageStore.ts`）依赖模型价格表自动计算成本，openai-codex 目录自带价格，无需改动。

## 已知取舍

- **刷新令牌轮换竞争**：若本 app 与 codex CLI 恰好同时刷新，会有一方的 refresh token 作废（重新 `codex login` 即可恢复）。窗口极小，接受该风险，不做跨进程文件锁。
- token 有效期内每次 `getApiKey` 都重读文件（每次 Agent 请求一次），文件极小，成本可忽略；换来的好处是 codex CLI 自己刷新后 app 立即拿到新 token。

## 测试

`app/server/src/ai/codexAuth.test.ts`（vitest，与现有测试同风格），用临时目录的假 auth.json 和注入的假 refresh 函数覆盖：

1. provider 不是 `openai-codex` → 返回 `undefined`，不读文件。
2. token 未过期 → 直接返回 access_token。
3. token 已过期 → 触发刷新、返回新 token、回写文件且保留其余字段。
4. 文件缺失 / 刷新失败 → 返回 `undefined` 不抛异常。
5. 并发两次调用且 token 过期 → refresh 只被调用一次。

## 不做的事

- 不包装 codex CLI 子进程（`codex exec`）。
- 不新增登录流程 / UI；登录始终由 codex CLI 完成。
- 不改 `models.ts` 的解析逻辑，不改前端。
