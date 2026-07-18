# 第三期：分发产品化

日期：2026-07-11
上游：`2026-07-11-electron-app-design.md`（总体设计）
前置：第二期完成（内测版 dmg 可用）
状态：待评审

## 目标

把内测版变成陌生用户拿到就能用的 App。本期结束时：一个没有 repo、没有 `.env`、没有 Claude Code 的用户，下载 dmg → 填长桥凭证 → 输 ticker 出图。

1. 首次启动引导 + 凭证设置页（macOS 钥匙串存储）。
2. App 内建图入口：ticker → 周期/指标 → 生成图表。
3. 数据目录迁到 `app.getPath('userData')`，与开发态并存。
4. 外部 API 开关：可选监听 127.0.0.1 + token，供 Claude Code skills 驱动。
5. 发布配套：README 下载/安装说明（含 Gatekeeper 右键打开）。

## 非目标

- 不做 Apple 签名/公证（自动更新已由第二期 Sparkle 链路解决，签名只影响首装 Gatekeeper 体验）。
- 不做多账户/多券商。
- journal/markdown 工作流不进 App。

## 凭证与首启引导

- **存储**：Electron `safeStorage`（macOS 下走钥匙串加密）加密后落 userData 的 sqlite，不存明文文件。读写只经 IPC（`preload` 白名单），凭证密文不过 `app://` 协议。
- **注入**：内核的 marketdata 层（第一期保留的 `services/marketdata/registry`）改为从注入的 `CredentialProvider` 取长桥凭证；开发/自部署态实现读 `.env`，桌面态实现读 safeStorage。AI provider key 沿用现有 `ai/credentialStore`（已有 secretBox 加密），桌面态把主密钥也挪进 safeStorage。
- **首启引导**：检测无凭证 → 引导页（长桥开放平台申请指引 + 三个凭证输入框 + 连通性测试按钮，测试即调一次 quote）。跳过则进入受限模式（只能看已有图表，顶部横幅提示）。
- **凭证失效**：长桥调用返回鉴权错误时，横幅提示 + 一键跳设置页，不弹死循环报错。

## App 内建图

- 顶栏加「新建图表」：输入 ticker（US only，复用现有 `normalizeSymbol` 校验）→ 选类型（复用现有 chart schema 的类型枚举）→ 选周期/指标预设 → 调现有 `POST /api/charts` 同款内核逻辑生成。
- 不新造 API：UI 直接调既有 charts 模块的创建接口（走 `app://`），服务端零新增。
- 预设先给 2~3 个（日K + 常用指标、盘中多周期），不做自由指标编辑器（YAGNI，等真实反馈）。

## 数据目录

- 桌面态：`userData/charts/`（图表 JSON）、`userData/db/`（sqlite）。第一期的 `dataDir` 注入点直接换值即可。
- 开发态不变（repo 内路径），两态互不迁移——内测版若在 repo 路径攒了数据，提供一次性「从 repo 导入」菜单项（复制文件，不做同步）。

## 外部 API 开关

- 设置页「本机 API」开关：开启时在 Electron 内用 `@hono/node-server` 把同一内核实例挂到 `127.0.0.1:5199`（占用则递增），并生成随机 token 显示在设置页（一键复制，支持重置）。
- 鉴权：该监听入口全路由校验 `Authorization: Bearer <token>`，`app://` 协议入口不受影响。实现为宿主层 middleware，不进内核业务代码。
- chart skill 侧：`SKILL.md` 补充「桌面版模式」用法（带 token 的 curl 示例）。

## 发布配套

- README（或 repo 内 `apps/desktop/README`）：下载链接、系统要求、Gatekeeper 右键打开图解、凭证申请指引链接、常见问题。
- Release notes 模板：功能变化 + 已知问题。

## 测试

- `CredentialProvider` 两种实现的单测（safeStorage 用内存 fake）。
- 外部 API token 鉴权中间件单测（无 token / 错 token / 正确 token）。
- 建图 UI 走既有 charts 路由测试兜底，另加一条「无凭证 → 受限模式」的状态测试。
- 手动验收脚本：全新 macOS 用户目录（新建测试账户）走一遍完整首启流程。

## 风险

- `safeStorage` 在无签名 App 上钥匙串条目按 bundle id 区分，改名/换 id 会丢凭证——bundle id 在第二期就定死，本期不改。
- 长桥开放平台凭证申请有门槛（需长桥账户），引导页把这一步写透，否则会成为最大流失点。
- 外部 API 开启后凭证保护依赖 token 与 localhost 绑定，README 里明示「不要暴露到局域网」。
