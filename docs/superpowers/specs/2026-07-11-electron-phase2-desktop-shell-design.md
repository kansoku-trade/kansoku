# 第二期：Electron 桌面壳

日期：2026-07-11（同日修订：打包器定为 electron-builder，构建定为 tsdown，更新器定为 Sparkle）
上游：`2026-07-11-electron-app-design.md`（总体设计）
前置：第一期完成（不 listen 的 Tsuki 内核已就位）
状态：待评审

## 目标

给内核加上第三种宿主：Electron。本期结束时能产出一个可安装的 macOS dmg，双击打开即是完整 App（无终端、无端口），并具备 Sparkle 自动更新（含增量更新与原生弹窗）。

1. `apps/desktop/` 包：main / preload / 打包配置 / Sparkle 桥。
2. `protocol.handle('app')` 宿主：渲染进程 `fetch('app://…')` 直达内核，零 localhost 监听。
3. 实时通道的桌面传输绑定（MessagePort）。
4. electron-builder 打包（dmg + zip），原生模块正确处理。
5. **Sparkle 更新链路**：自研 Node-API 桥 + EdDSA 签名 + appcast + delta，全程无 Apple 签名依赖。
6. CI：打 tag 自动构建、签 EdDSA、生成 appcast、挂 Release。

## 非目标

- 不做凭证设置页/钥匙串/建图 UI（第三期）。本期桌面版仍读 `.env`，数据目录仍可指向 repo——**本期交付物是给自己用的内测版**，第三期才是分发版。
- 不做 Apple 签名/公证（Sparkle 路线下也非必需；将来要上 Mac App Store 之外的「无警告首装」再买账号补签，更新机制不变）。
- 不做 Windows/Linux 打包。
- 不用 electron-forge / electron-vite / electron-updater——构建管线自持（见「构建管线」）。

## 目录

```
apps/desktop/
├─ src/
│  ├─ main.ts            # app ready → 注册协议 → 起内核 → 开窗口 → 初始化 Sparkle 桥
│  ├─ protocolHost.ts    # protocol.handle('app', req => kernel.fetch(req))
│  ├─ realtimeBridge.ts  # 实时通道桌面绑定（MessagePort）
│  ├─ preload.ts         # contextBridge 暴露白名单 API（CJS 单文件）
│  ├─ updater.ts         # Sparkle 桥的 JS 封装 + 兜底弱更新
│  └─ ipc/               # 原生能力 handler（本期只有窗口控制 + 通知占位）
├─ native/sparkle-bridge/ # ObjC++ Node-API addon，链接 Sparkle.framework
├─ scripts/              # dev.ts / build.ts / package.ts（薄脚本）
├─ tsdown.config.ts
├─ electron-builder.yml
├─ .npmrc                # node-linker=hoisted（builder 对 pnpm 符号链接兼容性差）
└─ package.json
```

## 构建管线（自持）

不引入 forge / electron-vite，管线四条薄脚本：

| 命令 | 内容 |
|---|---|
| `dev` | tsdown --watch（main ESM / preload CJS）+ electron 自动重启；窗口加载 web 的 Vite dev URL |
| `build` | `vite build`（web/）+ tsdown 三入口（main、preload、server 内核单文件，原生模块 external） |
| `package` | electron-builder（dmg + zip，arm64） |
| `release` | CI 串 build + package + Sparkle 签名 + appcast（见 CI 节） |

- tsdown（rolldown 内核，与 Vite 8 同源）：main 与 server 内核出 ESM；preload 出 CJS（sandbox 下 preload 必须单文件 CJS）。
- electron-builder 的 `files` 用白名单：只带构建产物入口 + 原生模块，`asarUnpack` better-sqlite3 与 longbridge，压最小包体，也绕开 pnpm 依赖树遍历的坑。
- Sparkle.framework 经 `extraFiles` 进 `Contents/Frameworks/`。

## 协议宿主

- `protocol.registerSchemesAsPrivileged` 注册 `app` scheme：`standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true`（须在 `app.ready` 前调用）。
- `protocol.handle('app', ...)`：
  - `app://api/*` → 内核 `fetch`（Request 原样转发，Response 原样返回，流式响应直通）。
  - 其余路径 → serve 预构建的 web 静态资源（读 asar 内文件，正确的 mime + SPA fallback）。
- 窗口加载 `app://-/index.html`（生产）或 Vite dev URL（开发，`ELECTRON_DEV=1` 时）。开发态下 `app://` 协议照常注册，http origin 页面可跨源 fetch 它（scheme 已开 CORS）。

## 实时通道桌面绑定

第一期已抽出 `Connection` 抽象。桌面绑定用 **MessagePort**：

- preload 里 `window.postMessage` 握手换一对 `MessageChannel` port，一端交渲染进程，一端经 `ipcRenderer.postMessage` 交 main。
- main 侧把 port 包成 `Connection` 交给 `handleConnection`——协议层零改动。
- web 端客户端加一个传输探测：`window.__DESKTOP_RT__`（preload 注入）存在则走 MessagePort，否则照旧 WebSocket。消息格式两端完全一致（一层 `{key, payload}` 信封）。

不选 SSE-over-protocol 的原因：MessagePort 双向、无 HTTP 语义负担，也绕开 `protocol.handle` 流式回压的坑。

## Sparkle 更新链路（本期重点自研件）

选型理由：electron-updater 在 macOS 强制要求 Apple 签名；Sparkle 用自有 EdDSA 验证，**无签名也能完整自动更新**，且支持增量更新与原生弹窗。生态无现成 Electron 桥（electron/electron#29057 未实现），自研。

### 桥（`native/sparkle-bridge/`）

- ObjC++ + Node-API，链接 Sparkle.framework，暴露最小接口：`init(appcastURL, publicEDKey)`、`checkForUpdates()`（触发标准弹窗）、`setAutomaticChecks(bool)`。
- UI 直接用 `SPUStandardUpdaterController` 标准更新窗口（release notes + 安装并重启），不做自定义 user driver。
- `SUPublicEDKey` 与 appcast URL 写入 Info.plist（electron-builder `extendInfo`），桥内不硬编码。
- 构建：node-gyp / cmake-js，产物随 asarUnpacked 分发；只编 arm64。

### 密钥与签名

- `generate_keys` 生成 EdDSA 密钥对：私钥进本机钥匙串 + CI secret，公钥埋 Info.plist。
- **私钥即发布权**：泄露 = 任何人可给全体用户推更新。CI 里只存 GitHub Actions secret，不落文件。

### 发布产物与 appcast

- CI 用 `generate_appcast`：输入本次 zip + 从 GitHub Releases 拉回的前 2~3 版 zip → 输出签好名的 `appcast.xml` + `.delta` 增量包。
- 全部挂 Release 资产；appcast URL 固定 `releases/latest/download/appcast.xml`。
- Release notes 写在 Release body，appcast 里引 `releaseNotesLink`。

### 兜底

- 桥写通之前（或桥初始化失败时），`updater.ts` 退化为弱更新：查 Releases API + semver 比对 + 通知跳下载页。两种模式共用触发入口。

### 实施顺序

先打通「空壳 dmg + 打包链路 + 弱更新」，Sparkle 桥排在其后作为本期最后一块（估 2~4 天），失败不阻塞内测版交付。

## CI

- GitHub Actions：push tag `desktop-v*` → macos-14 runner（arm64）→ pnpm install → 测试 → build + package → `generate_appcast`（EdDSA 私钥自 secret）→ 产物挂 draft Release → 手动补 notes 后发布。
- desktop 独立版本号（`desktop-v0.1.0`），不与 repo 其他内容混用。

## 测试

- `protocolHost` 的请求转换（URL 映射、静态 fallback、mime、路径遍历防护）单测。
- `realtimeBridge` 的 `Connection` 适配单测（mock port）。
- `updater.ts` 弱更新的 semver 比对与频控单测；Sparkle 桥用手动冒烟（发一个测试版本走完整更新回路，验证 delta 与全量两条路径）。
- 端到端：手动冒烟清单（开 App → 图表加载 → 实时刷新 → 断网重连 → 触发更新弹窗 → 安装重启后版本号正确）。

## 风险

- **Sparkle 桥是本期唯一自研硬骨头**（估 2~4 天）：ObjC++/Node-API/框架嵌入三样都要对。已用「弱更新兜底 + 排期最后」隔离风险。
- 无 Apple 签名时 Sparkle 完全依赖 EdDSA 链——密钥管理纪律见上；换密钥 = 老用户断更（appcast 验签失败），密钥定了就不换。
- delta 更新要求用户本地 bundle 与归档 zip 逐字节一致；若曾手动改过 app 内文件会回退全量更新（Sparkle 自动处理，无需我们兜）。
- `protocol.handle` 流式响应的回压问题在部分 Electron 版本存在——选当前稳定大版本并用长 SSE 验证；实时主通道走 MessagePort，影响面小。
- asar 内静态文件 serve 的路径遍历要防（规范化 + 前缀校验）。
- electron-builder 对 pnpm workspace 的兼容用 `.npmrc` hoisted + files 白名单双保险，spike 时先打空壳 dmg 验证全链路。
