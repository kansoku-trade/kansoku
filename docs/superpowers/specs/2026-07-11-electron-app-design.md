# 图表 App 桌面化 + 双模式架构设计

日期：2026-07-11
状态：已与用户对齐，待实施拆解

## 背景与目标

本仓库的 workspace（现即仓库根，宿主在 `apps/`、共享库在 `packages/`）目前是本地图表 web 应用（Fastify + Vite middleware 模式 + React），图表由 Claude Code skills 通过 `POST /api/charts` 创建，仅自己使用。目标是把它演进成**可正经分发的桌面 App**，同时保留 **Server + Web 自部署**的运行形态。

### 已确认的约束

| 决策点 | 结论 |
|---|---|
| 目标用户 | 对外分发（不只自用） |
| 桌面平台 | 先只做 macOS，CI 架子留扩展空间 |
| 数据源 | 用户自带 Longbridge 开放平台凭证，App 内设置页填写 |
| 签名 | 先不买 Apple 开发者账号：无签名 + 弱更新，架构按可升级到签名 + 自动更新设计 |
| 仓库 | 留在本仓库（workspace 即仓库根），接受目录与架构重构 |
| 运行形态 | 双模式共存：① Server + Web（Linux 自部署）② Electron 桌面分发 |
| 服务端框架 | Fastify → Tsuki（https://github.com/Innei/Tsuki ，Hono 上的 NestJS 风格框架：装饰器 + tsyringe DI + 模块 + OpenAPI） |

## 产品形态

从「个人工具链的渲染端」变成「自带数据源和 AI 的独立看盘 App，同时保留被外部工具驱动的 API」：

- **自足的图表工作台**：用户填好 Longbridge 凭证后，App 内直接输 ticker → 选周期/指标 → 生成图表；实时报价、流式刷新照旧。
- **AI 分析保留为卖点**：server 已内置 pi-agent 与多 provider 模型设置，分发版即「用户自带 AI key，App 内跑分析」。
- **HTTP API 保留但降级为进阶玩法**：`POST /api/charts` 不删，Claude Code skills 仍可驱动 App；桌面版默认关闭，设置页可开启。
- **journal/markdown 不进 App**：日志仍是个人仓库的东西，App 只管图表 + 实时 + AI 分析。

## 架构：一个不 listen 的内核，三种宿主

核心利用 Hono 的本质——app 就是一个 `fetch(Request) => Response` 函数，不绑定端口：

```
.                           # 仓库根即 workspace 根
├─ apps/server/             # Tsuki 化
│  ├─ src/modules/          # charts / quotes / credentials / ai … 各业务模块
│  ├─ src/bootstrap.ts      # createApplication(AppModule) → 返回 hono app（不 listen）
│  └─ src/main.node.ts      # 宿主二入口：@hono/node-server serve()
├─ apps/desktop/            # 宿主三：Electron 壳
│  ├─ src/main.ts           # protocol.handle('app', req => honoApp.fetch(req))
│  ├─ src/preload.ts        # IPC 白名单桥
│  └─ forge.config.ts       # electron-forge 打包（dmg + zip）
├─ apps/web/                # 不感知宿主，仅 API base URL 一个开关
└─ packages/shared/
```

| 运行态 | 宿主 | Vite | 说明 |
|---|---|---|---|
| 开发 | Vite dev server（`@hono/vite-dev-server` 内嵌 hono app） | 热更新 | 单进程，web 与 server 代码都热重载 |
| Linux 自部署 | `@hono/node-server` | 预构建静态 | Docker 化按 Tsuki starter 减掉 postgres/redis，继续 better-sqlite3 + drizzle |
| 桌面 App | Electron `protocol.handle('app')` | 预构建静态 | 零端口零监听，渲染进程 `fetch('app://…')` 直达内核 |

### 关键设计点

- **历史包袱已解**：上次 Hono → Fastify（commit `080a915`）的原因是 Hono 不吃 Vite 的 connect 风格 middleware，当时手写 fetch 反代且代理不了 HMR WebSocket。现在用官方 `@hono/vite-dev-server` 反转宿主关系，问题消失。退路：开发时 Vite 在前 + `/api` proxy 到独立 hono 进程。
- **桌面版安全模型**：业务调用全走自定义协议进 hono fetch，不监听 localhost 端口，本机其他进程与 DNS rebinding 均无法触达用户券商凭证。`protocol.handle` 支持流式 Response，SSE 原样可用（自定义 scheme 需注册 `supportFetchAPI` + stream 权限）。
- **IPC 缩到最小**：只留真原生能力——钥匙串读写、系统通知、窗口/菜单栏控制。业务接口一律 fetch，不为每个接口写 IPC handler。
- **外部 API 开关**：桌面版设置页可开启「监听 127.0.0.1 + 随机 token」，实现为在 Electron 内再挂一份 `@hono/node-server` serve，同一个 app 实例，代码零重复。
- **依赖注入边界**：内核通过 DI 注入 `dataDir` 与凭证读取器。开发/自部署态：repo 内数据目录 + `.env`；桌面态：`~/Library/Application Support/<AppName>/` + macOS 钥匙串。业务代码不感知宿主。
- **原生模块**：`longbridge` npm 包为 Node-API，Electron 直接可用；`better-sqlite3` 按 Electron ABI rebuild（electron-builder 内建处理），打包时原生模块置于 `app.asar.unpacked`。
- **构建工具链**：打包用 electron-builder（纯打包器，dev 体验已由 Vite 承担，不需要 forge 全家桶；且 GitHub Releases 发布链成熟）；main/preload/server 内核用 tsdown 构建（main、内核 ESM；preload 单文件 CJS）；管线脚本自持。

## 用户更新（Sparkle，重点特性）

采用 macOS 原生更新框架 Sparkle，通过自研 Node-API 桥接入 Electron（生态无现成桥，electron/electron#29057 至今未实现）：

- **无签名也能完整自动更新**：Sparkle 用自有 EdDSA 密钥验证更新包，不依赖 Apple 开发者账号；其安装器落盘的更新不带 quarantine，装完即用。用户只在首次安装过一次 Gatekeeper（右键打开）。
- **增量更新**：`generate_appcast` 自动从历史版本 zip 生成 `.delta` 并签名。Electron 包体大头（运行时）只有升 Electron 才变，日常发版 delta 仅几 MB。
- **原生更新弹窗**：桥直接用 `SPUStandardUpdaterController` 标准 UI（release notes + 安装并重启），不自研更新界面。
- 发布走 GitHub Releases：zip + `appcast.xml` + `.delta` 挂 Release 资产，appcast URL 用 `releases/latest/download/appcast.xml` 保持稳定。
- 桥未写通前的兜底：查 Releases API + 跳下载页的弱更新先顶着。
- electron-updater 路线放弃（macOS 上强制要求 Apple 签名，与无签名约束冲突）。

## 开发 DX

- 日常开发与现在等价或更好：单条 dev 命令起 Vite dev server（内嵌 hono），web 热更新 + server 热重载，浏览器直连调试路径保留。
- Electron 开发态：窗口加载 Vite dev URL，自定义协议照常注册（scheme 注册 CORS/fetch 支持后，http origin 页面可 fetch `app://`）。
- 只有发版走真正打包：web 预构建 + server 打成单文件进 asar。

## 分期实施

一个 spec 装不下实现细节，拆三期，各有独立 spec，各自走 plan → 实施：

1. **服务端换骨**（`2026-07-11-electron-phase1-server-tsuki-design.md`）：Fastify → Tsuki/Hono。对 web 的 API 契约保持不变（现有测试守住），产出「不 listen 的内核」`bootstrap.ts` 与 `main.node.ts` 宿主，开发态迁移到 `@hono/vite-dev-server`。
2. **桌面壳**（`2026-07-11-electron-phase2-desktop-shell-design.md`）：`desktop/` 包、`protocol.handle` 宿主、实时通道 MessagePort 绑定、electron-builder 打包（dmg/zip、原生模块处理）、Sparkle 更新链路（自研桥 + EdDSA + delta + 原生弹窗，弱更新兜底）、GitHub Releases CI。交付内测版。
3. **分发产品化**（`2026-07-11-electron-phase3-distribution-design.md`）：首启引导 + 凭证设置（safeStorage/钥匙串）、App 内建图入口、外部 API 开关（localhost + token）、数据目录迁移、发布配套。交付分发版。

每期结束 web 端功能均可回归验证；期与期之间桌面/自部署两形态互不阻塞。

## 风险与已知坑

- Tsuki 尚年轻（自研框架），starter 以 postgres + redis 为准，本项目需验证 sqlite-only 组合与 `@hono/vite-dev-server` 组合是否顺畅——第一期开工先做 spike。
- `protocol.handle` 流式响应在个别 Electron 版本有回压问题，选版本时验证 SSE 长连接。
- 无签名分发的用户体验（Gatekeeper）是已接受的取舍，非缺陷。
- **实时通道形态（已定夺）**：现有实时层是单条多路复用 WebSocket（commit `034fde1`），而 `protocol.handle` 无法承载 WS 升级。定论：协议层（`parseWsMessage` / `attachChannel`，本就与传输分离）之下抽出 `Connection` 抽象；node 宿主继续绑 WebSocket（web 零改动），桌面宿主用 MessagePort 绑定（preload 换 port），消息信封两端一致。详见第一期、第二期 spec。
