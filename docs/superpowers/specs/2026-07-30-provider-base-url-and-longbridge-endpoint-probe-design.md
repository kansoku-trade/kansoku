# AI 服务商自定义 Base URL + 长桥域名探针设计

日期：2026-07-30
状态：已确认

## 背景

用户反馈两个问题：

1. 绑定 AI 模型时，各服务商的 base URL 写死为官方地址，用不了国内中转站 / 反向代理。
2. `openapi.longbridge.com` 被墙时应用整个卡死，只能手动改代码换成 `.cn` 域名。

现状调查结论：

- AI 模型运行时是 `@earendil-works/pi-ai`，`builtinModels()` 的静态目录里每个模型自带官方 `baseUrl`；请求 URL 由 API 实现从 `model.baseUrl` 读取。`MutableModels.setProvider()` 支持按 id 覆盖 provider。
- 长桥域名只在 `packages/core/src/marketdata/longbridgeSocket.ts` 两处：取 OTP 的 HTTP 地址（`LONGBRIDGE_HTTP_URL` 可覆盖，默认 `https://openapi.longbridge.com`）和行情 WS（`LONGBRIDGE_QUOTE_WS_URL` 可覆盖，默认 `wss://openapi-quote.longbridge.com/v2`）。
- 卡死根因：OTP 的 `fetch` 没有超时；WS 建连的 open 等待没有超时。域名被墙是黑洞式丢包，会挂起几分钟。
- `.cn` 配对域名（`openapi.longbridge.cn` / `openapi-quote.longbridge.cn`）真实存在且可用；报告问题的用户切 `.cn` 后同一登录态直接可用，说明两个集群共用同一套 token。
- pi-ai 目录里 OpenAI 的全部模型走 `/v1/responses` 接口，而国内中转站大多只实现 `/v1/chat/completions`。

## 设计 A：AI 服务商自定义 Base URL

范围：全部 17 家 key 型服务商（`SINGLE_KEY_PROVIDERS`）。不含 `openai-codex`（走 CLI 登录态）和 LobeHub（OAuth 网关）。模型列表仍用内置目录，不支持自定义模型 ID。

### 数据层

- drizzle 迁移 `0012`：新表 `provider_endpoints`（`provider` 主键、`base_url` 非空、`updated_at` 非空），`schema.ts` 同步。不动 `provider_credentials`——它的 `secret` 非空，「先填地址后填 key」无法落在同一行。
- 地址明文存储（不是密钥）。删除该服务商凭证时连带删除端点行；「重置凭证」一并清空。

### 生效链路

新增 `packages/core/src/ai/runtime/providerOverrides.ts`：

- `applyBaseUrlOverride(models, providerId, baseUrl | null)`。
- 通用路径：首次覆盖前留存内置 provider 引用；注册包装对象——`provider.baseUrl` 换成自定义地址，`getModels()` 把每个模型的 `baseUrl` 换掉（去尾斜杠），`stream` / `streamSimple` 委托回原 provider。请求 URL 取自 `model.baseUrl`，委托即生效。
- openai 特例：填了自定义地址时用 `createProvider` 重建 provider——模型 `api` 从 `openai-responses` 改写为 `openai-completions`，流实现换成 pi-ai 的 completions 实现（官方接口本身也兼容 completions，纯镜像站不受影响；OpenAI 兼容性差异由 pi-ai 按地址自动探测）。
- `baseUrl` 传 `null` 恢复留存的内置 provider。
- `initAiSettings` 启动时读全表逐个应用；保存 / 清除时即时重新应用。

「测试连接」「模型目录」「角色 stale 检查」都经由 `models.getModel` / `getProvider` 取值，覆盖后自动跟随，不改。

### 接口与 UI

- 契约新增 `putProviderBaseUrl({ provider, baseUrl: string | null })`，`packages/pro-api` 与 `packages/core/src/contract` 同步；key 与地址可独立修改。
- `getAi()` 返回值加顶层 `endpoints: Array<{ provider, baseUrl }>`（不挂在凭证条目上——地址可以独立于 key 存在）。
- 校验：非空时必须是 `http(s)` URL；空串视为清除（存 `null`）；provider 必须在 `SINGLE_KEY_PROVIDERS` 内。
- UI（`ProviderCredentialsSection`）：每家服务商 key 输入框下加可选「自定义 Base URL」输入框，占位符显示官方地址，带自己的保存按钮；已设置时显示当前值。

### 测试

- providerOverrides 单测：模型地址被改写、openai 协议切换为 completions、传 `null` 恢复内置。
- 校验单测：URL 合法性、空串清除、非法 provider 拒绝。
- settings service 单测：putProviderBaseUrl 持久化 + listEntries 回带。

## 设计 B：长桥域名探针 + 防卡死

### 端点模块

新增 `packages/core/src/marketdata/longbridgeEndpoints.ts`，两组配对域名（HTTP 与 WS 永远同区）：

| 线路 | HTTP | WS |
| --- | --- | --- |
| 国际站 com | `https://openapi.longbridge.com` | `wss://openapi-quote.longbridge.com/v2` |
| 境内站 cn | `https://openapi.longbridge.cn` | `wss://openapi-quote.longbridge.cn/v2` |

`resolveEndpoints()` 优先级：

1. 环境变量 `LONGBRIDGE_HTTP_URL` / `LONGBRIDGE_QUOTE_WS_URL`（保持现状，各自独立覆盖）。
2. 设置页手动固定：`appMeta` 键 `longbridge_region_v1`，值 `auto | com | cn`，缺省 `auto`。
3. 自动探针：进程内缓存有赢家直接用；否则对两个 HTTP 域名并发探活——3 秒 `AbortSignal.timeout`，收到任何 HTTP 响应（含 4xx）即算通，谁先响应用谁，缓存进程内。

`reportFailure(region)`：清缓存并把另一区提为下次首选，重连时自然换区重探。只在 `auto` 模式下生效——用户手动固定线路或设置了环境变量时，失败不换区，只走既有重连退避。

### 卡死根因修复（独立于探针生效）

- `fetchSocketOtp` 加 8 秒 `AbortSignal.timeout`。
- WS 建连 open 等待加 10 秒定时器，超时主动 `close()` 并拒绝，走现有指数退避重连。
- 连接失败（OTP 网络错误 / 建连超时 / error 事件）调用 `reportFailure`。

### 设置与 UI

- 契约新增长桥线路读写接口（放 credentials/settings 契约，`pro-api` 同步）。
- `LongbridgeSection` 加「线路：自动 / 国际站 / 境内站」三选。

### 测试

- 端点模块单测（注入假 fetch）：env 优先、手动固定优先、竞速取先响应者、`reportFailure` 换区。
- socket 测试沿用现有假 socket，补建连超时用例。

## 不做的事

- 不支持中转站自定义模型 ID（自定义兼容 provider），本次范围已明确排除。
- 不给 openai 加「接口风格」开关，自定义地址一律走 completions。
- 不用 CLI 登录态的 `dc_region` 决定线路（归属不等于可达）。
- 不改 `ensureModelsRuntimeFromEnv` 的 env 凭证路径（bench/CLI 运行时），base URL 覆盖只走数据库配置。
- 长桥 CLI 自身访问哪个域名不在本仓库控制范围。
