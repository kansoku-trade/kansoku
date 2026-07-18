# 第一期：服务端换骨（Fastify → Tsuki/Hono）

日期：2026-07-11
上游：`2026-07-11-electron-app-design.md`（总体设计）
状态：待评审

## 目标

把 server 从 Fastify 迁到 Tsuki（Hono + NestJS 风格模块/DI），产出**不 listen 的内核**，为三宿主（Vite dev / node server / Electron protocol）打地基。本期结束时：

1. `bootstrap.ts` 导出 hono app 实例（不绑端口）。
2. `main.node.ts` 用 `@hono/node-server` 起服务，行为与现在的 `pnpm start` 等价。
3. 开发态迁到 `@hono/vite-dev-server`：单条 dev 命令，web 热更新 + server 热重载。
4. **对 web 的 API 契约保持逐字节不变**（路径、方法、响应 envelope、SSE/WS 消息格式），web 代码零改动。

## 非目标

- 不做 Electron（第二期）。
- 不做凭证设置/钥匙串/建图 UI（第三期）。
- 不做 services / ai / realtime 内部逻辑的重构——它们已经不依赖 Fastify，原样保留。
- 不强推全量 DI：现有 services 是模块级单例函数，本期只把 controller 层放进 Tsuki 容器，services 以现状被 import 调用。后续按需渐进。

## 现状盘点（迁移面）

Fastify 耦合集中在：

| 文件                      | 内容                                                                                              | 迁移方式                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/app.ts`              | Fastify 实例、错误处理、Vite middleware 挂载、静态托管                                            | 重写为 Tsuki `AppModule` + 异常 filter           |
| `src/index.ts`            | listen 入口                                                                                       | 拆成 `bootstrap.ts` + `main.node.ts`             |
| `src/routes/*.ts`（9 个） | charts / symbols / positions / overview / settings / chat / annotations / settingsValidation / ws | 每个改写成一个 `@Controller`，归入对应 `@Module` |
| `src/routes/ws.ts`        | `@fastify/websocket` 注册 + `handleSocket`                                                        | 见「实时通道」                                   |

`services/`、`ai/`、`realtime/`、`db/`、`shared/` 不动。

## 模块划分

```
src/modules/
├─ app.module.ts          # 根模块，聚合以下各模块
├─ charts/                # ChartsController（现 routes/charts.ts）
├─ symbols/               # SymbolsController（现 routes/symbols.ts）
├─ positions/             # PositionsController
├─ overview/              # OverviewController
├─ settings/              # SettingsController（含 settingsValidation）
├─ chat/                  # ChatController
├─ annotations/           # AnnotationsController
└─ realtime/              # 实时通道注册（见下）
```

Controller 保持薄：解析请求 → 调既有 service 函数 → 返回。路径与现有路由一一对应（`/api/charts`、`/api/symbols/:sym`、`/api/stream`…）。

## 错误契约

现有 envelope：成功 `{ok: true, data, meta?}`，失败 `{ok: false, error, hint?}` + 对应 status。迁移时用一个全局 exception filter 把 `ClientError`（保留现有类）和未知异常映射成同样的 JSON 形状。**不采用 Tsuki starter 的 `AppException` envelope**——契约以 web 现状为准。

## 实时通道

`ws.ts` 的协议层已与传输分离（`parseWsMessage` / `attachChannel` 只依赖 push 回调）。本期做两件事：

1. 抽出 `Connection` 抽象：`{ send(text), onMessage(cb), onClose(cb) }`，`handleSocket` 改为 `handleConnection(conn)`，逻辑零变化。
2. node 宿主继续提供 WebSocket 绑定：`main.node.ts` 里用 `ws` 库挂 HTTP upgrade（不再经 `@fastify/websocket`），把 socket 包成 `Connection`。

web 端 WS 客户端零改动。桌面态的第二种传输绑定（MessagePort 或 SSE+POST）留给第二期，本期只保证抽象就位。

开发态 WS：`@hono/vite-dev-server` 不代理 upgrade 的话，dev 模式由 vite `server.proxy` 把 `/api/ws` 转到 node 宿主，或 spike 里验证插件的 upgrade 支持后定（见「先行 spike」）。

## 开发态与脚本

（spike 修订：`@hono/vite-dev-server` 不处理 WS upgrade，而实时层与 HTTP 路由共享进程内状态（内存 emitter），HTTP 与 WS 必须同进程。故放弃内嵌方案，改为全量 proxy。）

- `pnpm dev`：并发起两个进程——vite dev server（web/，HMR）+ `vite-node --watch src/main.node.ts`（内核，HTTP+WS 单进程）；vite `server.proxy` 把 `/api`（含 `ws: true`）转到内核进程。
- `pnpm start`：`vite-node src/main.node.ts`（生产形态本地跑，serve 预构建的 web 静态资源；web 未构建时提示先 build）。
- 端口：对外维持 5199（vite dev 占 5199，内核进程占内部端口；start 模式内核直接占 5199）。
- `.env` 加载（`dotenv.ts`）、`env.ts` 不动。
- spike 已证实：vite-node 在 Vite 8 / vite-node 6 下正确产出 tsyringe 所需的装饰器 metadata，无需 swc 插件；tsx 与 node 原生 TS 均不可用。

## 测试策略

- 现有 78 个测试文件里，纯逻辑测试（services/ai/realtime）不动。
- 路由测试从 `fastify.inject` 改为 `app.request()`（hono 自带的测试接口，直接调 fetch，不起端口）。
- 迁移顺序上**先改测试基建（helpers.ts）再逐路由迁移**，每迁一个路由跑对应测试，全绿再迁下一个。
- 新增一个契约冒烟测试：起 node 宿主，检查 `/api/health`、一条 SSE 流、一条 WS 往返。

## 先行 spike（开工第一步，半天盒）

在分支上验证四件事，任一不通则回到设计桌：

1. Tsuki 最小 app + better-sqlite3/drizzle（无 postgres/redis）能起。
2. `@hono/vite-dev-server` + Vite 8 + React 插件共存，HMR 正常。
3. SSE 长连接穿过 vite dev server 不被缓冲。
4. dev 模式 WS 路径可用（插件 upgrade 或 vite proxy 二选一）。

## 风险

- Tsuki 是年轻框架，遇到缺口时优先给 Tsuki 提修（作者就是本人），不在本 repo hack。
- `vite-node` 与 tsyringe 装饰器（`emitDecoratorMetadata`）的兼容性需在 spike 里确认；不行就 server 侧换 tsx/swc 跑。
- 迁移期间 main 分支保持可用：整个迁移在独立分支完成，契约测试全绿后合并，不做半迁移状态合入。
