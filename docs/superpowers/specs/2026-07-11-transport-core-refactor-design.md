# 传输无关实现层（@trade/core）重构设计

日期：2026-07-11
状态：已与用户逐段确认

## 目标

把 server 的 API 实现和实时引擎抽成独立的实现层包 `@trade/core`，让同一份业务逻辑通过两条传输通道暴露：

- 浏览器环境：HTTP（Tsuki/Hono controller 薄壳）
- Electron 环境（dev 与打包一致）：类型化 IPC（[electron-ipc-decorator](https://github.com/Innei/electron-ipc-decorator)），每条 server 路由对应一个 IPC 方法

web 端做一层客户端抽象，按运行环境自动选择 HTTP 或 IPC 实现。完成后：

- `pnpm dev:desktop` 不再需要旁挂 standalone server 进程（今天临时加的三进程方案撤销）；
- 打包版的 `app://` 协议不再拦截 `/api`，降级为只服务静态资源；
- 桌面与浏览器的 API 行为由同一份 core 实现保证一致。

## 已确认的决策

1. **IPC 覆盖范围**：dev 与打包版统一走 IPC（不是 dev-only）。
2. **web 抽象形态**：端到端类型化服务客户端（调用点迁移到 `client.charts.list()` 形态），不保留字符串 path 入口。
3. **实现层位置**：独立 workspace 包 `packages/core`，不留在 server 内。
4. **core 体量**：吸收整个内核——`services/`（44 文件）、`ai/`（25）、`realtime/`（14）、`db/`（3，含 drizzle 迁移目录）以及从 controller 抽出的路由实现。server 只剩 HTTP 壳。
5. **防路由漂移**：contract 旁挂路由元数据表，web HTTP 客户端由表驱动（泛型分发器，不手写 fetch 包装）；server controller 手写薄适配 + 路由对账测试（枚举 Tsuki 实际注册路由与元数据表逐条比对 method+path）。

## 包结构与依赖方向

```
.                          （仓库根即 workspace 根）
├── packages/core          @trade/core —— 实现层（新）
│   └── src/
│       ├── contract/      每模块：API 接口 + 路由元数据 + 输入输出类型
│       ├── modules/       每模块实现（从 controller 抽出的纯逻辑）
│       ├── services/      ← 搬自 server/src/services
│       ├── ai/            ← 搬自 server/src/ai
│       ├── realtime/      ← 搬自 server/src/realtime（引擎本体）
│       ├── db/            ← 搬自 server/src/db（drizzle 迁移目录一并搬）
│       └── runtime/       runtimeInit / env / errors / dotenv 等公共骨架
├── apps/server/           @trade/server —— Tsuki 薄 controller + HTTP/WS host + main.node.ts
├── apps/desktop/          @trade/desktop —— Electron 壳 + src/ipc/（每模块一个 IpcService 薄适配）
└── apps/web/              @trade/web + src/client/（HTTP 实现 + IPC 实现，按环境二选一）
```

依赖严格单向：`server → core`、`desktop → core`、`web → core（只 import contract，不碰实现）`。core 不依赖 Hono、不依赖 Electron。

调用链：

- 浏览器：`client(HTTP) → fetch → Tsuki controller → core 模块实现`
- 桌面：`client(IPC) → createIpcProxy → IpcService → 同一个 core 模块实现`

实时数据不动：引擎搬进 core，传输仍是 WS（浏览器）/ MessagePort（桌面），`wsHub`/`PortTransport` 的环境探测原样保留；聊天流式骑在这条通道上，不受影响。

## 契约形态

以 charts 为例：

```ts
// packages/core/src/contract/charts.ts
export interface ChartsApi {
  list(input?: { type?: string }): Promise<ChartSummary[]>;
  get(input: { id: string }): Promise<ChartDoc>;
  create(input: CreateChartInput): Promise<ChartDoc>;
  update(input: { id: string } & ChartPatch): Promise<ChartDoc>;
  remove(input: { id: string }): Promise<void>;
  built(input: { id: string; count?: number }): Promise<BuiltChart>;
}

export const chartsRoutes = defineRoutes<ChartsApi>("charts", {
  list:   { method: "GET",    path: "/" },
  get:    { method: "GET",    path: "/:id" },
  create: { method: "POST",   path: "/" },
  update: { method: "PATCH",  path: "/:id" },
  remove: { method: "DELETE", path: "/:id" },
  built:  { method: "GET",    path: "/:id/built" },
});
```

**统一调用约定：每个方法只收一个扁平对象参数。**

- web HTTP 实现是一个泛型分发器：按路由表取 method/path，入参对象里匹配 `:param` 的键填路径，GET 剩余键转 query，非 GET 剩余键转 JSON body；
- IPC 端入参原样过 `ipcRenderer.invoke`，零转换；
- 聚合类型 `AppApi = { charts: ChartsApi; symbols: SymbolsApi; ... }`，`client: AppApi` 对两种实现统一约束。

个别现有签名（如 `PUT /annotations/:symbol` 的裸 body）需要重排为扁平对象，属预期内的破坏性调整，随调用点迁移一并处理。

## 错误语义

`ClientError(status, code, hint)` 与 `ApiResult` 信封搬进 core，两条传输承载同一个信封：

- HTTP：照旧由 server 的 filter 序列化信封 + HTTP 状态码；
- IPC：**错误不走 promise reject**（electron-ipc-decorator 的 reject 只能携带字符串，会丢 code/status）。IpcService 适配层 catch 后把 `{ok:false, error, code, status, hint}` 作为正常返回值传回；
- web 两个实现共用同一个解包器：`ok:false` → 抛 `ApiError(status, code)`；503 + 凭证错误码照旧触发受限模式（`markRestricted`）。调用方在两个环境拿到完全一致的错误。

## 三端落地

**Server**：controller 退化为一行委托（`return chartsService.update({ id, ...body })`）；新增路由对账测试。例外：`legacy` 模块（serve 旧版 HTML 图表页 + 其文件列表）是浏览器专属页面，桌面端从未走通它（`app://` 只转发 `/api*`），SPA 也不引用——留在 server 原地，不进 contract，对账测试将其列入白名单。

**Desktop**：

- `desktop/src/ipc/` 每模块一个类（`class ChartsIpc extends IpcService`），`@IpcMethod()` 方法一行委托 core + 套信封（约 43 个一行方法，这层就是桌面的 controller）；主进程 `createServices()` 注册。
- preload 暴露 `createIpcProxy` 所需的 `ipcRenderer` 白名单面；暴露门槛从「仅 `app://`」放宽为「`app://` 或（`ELECTRON_DEV` 且 origin 为 `http://localhost:5199`）」——这是 dev 摆脱 standalone server 的机关。
- 既有 `credentials:*`、`external-api:*` IPC 是桌面专属能力（非 server 路由镜像），**本次不迁移**到 decorator 体系。
- `protocolHost` 删除 `/api` 拦截，只服务静态资源。

**Web**：

- `client/http.ts`（路由表驱动分发）、`client/ipc.ts`（`createIpcProxy` + 信封解包）、`client/index.ts` 按桌面探测选实现；
- 迁移约 30 个调用点：`useQuery<T>("/api/...")` → `useQuery(() => client.charts.list())` 形态（`useQuery` 签名从 path 改为 thunk + 缓存键）；
- `api.ts` 最终只剩 `ApiError` 与信封解包工具。

## 开发/构建流

- `pnpm dev`（浏览器开发）不变：Vite + server，proxy 到 5200；
- `pnpm dev:desktop` 回到两进程：Vite + Electron，API 走 IPC 到内嵌内核（撤销 2026-07-11 临时加的 web+server+desktop 三进程方案）；
- tsconfig：core 开 `experimentalDecorators`（electron-ipc-decorator 要求）；workspace 与各包 references 相应调整。

## 测试

- server 现有测试里打内核的（大多数）随代码迁至 `packages/core/test`；
- server 保留：host、薄 controller、路由对账测试；
- desktop 新增：IpcService 信封（成功/错误/凭证错误码）测试；
- web 新增：HTTP 分发器与 IPC 解包器的单测；
- 既有 5 个失败测试（charts clamp + realtimeCharts×4）原样搬迁，不在本次修复。

## 迁移顺序（每步全绿可提交）

1. 建 `packages/core` + 整体搬内核 + 改 import——纯搬家不改行为，server/desktop 照常工作；
2. contract + 路由表 + server 薄化 + 对账测试，逐模块推进；
3. web client + 调用点迁移（浏览器路径全部切到新客户端）;
4. desktop IPC 层 + preload 放宽 + `app://` 瘦身 + dev 走 IPC;
5. dev 脚本收尾（`dev:desktop` 去掉 server）。

## 风险

- **import churn**：~119 文件搬家，机械但量大；靠每步全绿约束。
- **drizzle 路径**：`resolveMigrationsDir` 的兜底路径基于 db/index.ts 文件位置推算（2026-07-11 刚修过惰性求值），db 目录挪进 core 后需同步调整，迁移目录随包走。
- **electron-ipc-decorator 接线**：sandbox + contextIsolation 下 preload 如何暴露 `ipcRenderer` 面需按库文档核对；库要求 `experimentalDecorators`。
- **打包版 env 常量早求值**（既有疑似隐患，见交接文档）：core 搬家会重排 bundle 合并顺序，实施第 1 步时顺带验证 `TRADE_PROJECT_ROOT` 相关常量在打包版的求值时机，必要时一并惰性化。
