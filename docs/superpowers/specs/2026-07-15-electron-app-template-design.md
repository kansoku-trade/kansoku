# Electron 应用模板抽取设计

日期：2026-07-15
状态：已确认

## 目标

把 `app/` 现有的 Electron + Web 全套架构（四包 workspace、HTTP/WS 与 IPC 双通道通信、Sparkle 自动更新、发版流水线）抽成一个独立的模板仓库，以后开新桌面/Web 应用时 clone 一份、跑一次 init 脚本就能开工。

## 决策记录

| 问题 | 决定 |
|---|---|
| 模板形态 | 独立 git 仓库（暂名 `electron-web-template`），GitHub 设为 template repository |
| 基建范围 | SQLite + drizzle、桌面基础（窗口/菜单/tabs/协议）、日志 + 凭据、发版流水线、server 与 IPC 同构逻辑，全部保留 |
| AI 层 | 进模板，带一个最小 agent 聊天示例（pi-ai / pi-agent-core） |
| 示例功能 | 带一个 notes 示例模块走通整条链路 |
| 改名机制 | `scripts/init.mjs` 一次性脚本，跑完自删 |
| 制作路线 | 剥离式复制：整体复制 `app/`，删交易领域模块，验证 + 审计 |

## 新仓库结构

```
electron-web-template/
├── apps/
│   ├── desktop/        Electron 壳：IPC、Sparkle 更新、窗口/菜单/tabs/协议/日志/凭据
│   ├── server/         Tsuki(Hono) HTTP 壳 + WS，main.node.ts 单进程
│   └── web/            Vite + React，HTTP/IPC 双传输自动选择
├── packages/
│   ├── core/           内核：db(drizzle+sqlite) / contract / realtime / ai / services / modules
│   └── shared/         共享类型与工具（收编为 workspace 包）
├── patches/            app-builder-lib 补丁原样保留
├── scripts/init.mjs    改名脚本
├── .github/workflows/  ci / desktop-tag / desktop-release
└── docs/               架构与操作指南（English）
```

`pnpm-workspace.yaml` 的 packages 改为 `apps/*` + `packages/*`；`allowBuilds`、`patchedDependencies` 等配置原样保留。包名在模板里统一为占位符 `@app/*`。

## 留删清单

### 保留（通用基建）

- core / server / desktop 三层的模块：`credentials`、`health`、`settings`、`realtime`（WS hub 推送骨架）、`chat`（瘦身为最小 agent 示例）
- desktop 基建：`boot`、`window`、`menu`、`contextMenu`、`tabs`、`protocol`（deep link）、`updater` + `native/sparkle-bridge`、`logging`、`dataRoot`、`onboarding`（简化成空壳）
- web：`desktop/`（标题栏、tabs、更新器 UI）、`client/`（wsHub、portTransport、apiHooks、router）、`settings`、`logViewer` 页面
- 全部 predev / ABI 脚本（`ensureNativeAbi`、`ensureDevNative`、`rebuild-native`）、tsdown / vite 配置、`generate-icon.sh`、`release-dry-run.sh`、`dev.mjs`、`afterPack.cjs`、`afterAllArtifactBuild.cjs`

### 删除（交易领域）

- 模块：`annotations`、`charts`、`positions`、`research`、`symbols`、`overview`、`lobehub`、`assistant`（chat 留一个即可）
- web：`charts`、`cockpit`、`palette`
- desktop：`dataImport`、`stageSkills.mjs`、`verifyBundledCodexAuth.mjs`
- core：行情、指标计算全部

## 示例功能

### notes 模块（链路范本）

每一层都是新模块的抄写范本：

1. `packages/core/src/db/schema` — `notes` 表（drizzle）+ 一条迁移
2. `packages/core/src/modules/notes` — service（增删改查）+ contract（typebox 请求/响应类型）
3. `apps/server/src/modules/notes` — Tsuki controller 暴露 REST；变更事件经 realtime hub 推 WS
4. `apps/desktop/src/ipc/notesIpc.ts` — 同一 service 走类型化 IPC
5. `apps/web/src/pages/notes` — 列表 + 编辑 UI，`apiHooks` 双传输取数，WS/IPC 实时刷新；同一份页面代码在浏览器与 Electron 内都能跑

### 最小 agent 示例

`chat` 模块瘦身版：一个对话页，流式输出，走 pi-ai / pi-agent-core，system prompt 留占位文件（promptPolicy 空壳）。API key 从 settings 页录入，存入 credentials（钥匙串）模块——顺带演示这两个基建模块。

示例代码用注释标出「删除示例时删这些文件」的边界，README 列完整文件清单。

## init 脚本

`scripts/init.mjs`，Node 原生零依赖，clone 后运行一次。

询问项（均带默认值推导）：

1. 项目名（kebab-case）→ 仓库级名称、workspace 根 `package.json`
2. 包作用域（默认 `@<项目名>`）→ 全部 `@app/*` 引用（package.json + 源码 import）
3. 产品显示名 → electron-builder `productName`、窗口标题、菜单
4. bundle id（默认 `com.example.<项目名>`）→ electron-builder `appId`、Sparkle、钥匙串 service 名
5. deep link 协议名（默认取项目名）→ `protocol` 模块注册的 scheme
6. Sparkle feed URL 与签名身份 → 可跳过，跳过则写 `TODO` 占位并在 README 发版章节标明

行为：

- 纯文本替换 + 定点改写，结束时列出全部被修改的文件
- 询问是否删除 notes 示例模块（按标注的文件清单删）
- 自删 `scripts/init.mjs`，提示 `git init` / 首次 commit
- 幂等防护：检测到占位符已不存在则拒绝重复运行

## 发版流水线与 Sparkle 脱敏

- `ci.yml` — 基本原样：全包 typecheck + test
- `desktop-tag.yml` — 原样：版本 bump + CHANGELOG 合入后打 tag
- `desktop-release.yml` — 保留骨架（tag 触发 → mac arm64 打包 → 签名/公证 → 生成 Sparkle appcast → 发 GitHub Release），删交易相关步骤（skills 打包、codex auth 校验）。证书、公证凭据、Sparkle 私钥走 repo secrets，README 列 secret 名称与获取方法
- `electron-builder.yml` — `appId` / `productName` 换占位符（init 改写）；`extraResources` 只留 `web-dist` 与 `drizzle` 迁移；icon 换通用占位图标，README 说明 `generate-icon.sh` 换图流程
- `release-dry-run.sh` 保留，本地完整演练打包发版
- CHANGELOG 机制保留：`CHANGELOG.md` 顶部段落即当次 release notes，appcast 由此生成

## 验证清单（交付门槛，全部必过）

1. `pnpm dev` — 浏览器模式：notes 增删改查走 HTTP；两个窗口同页 WS 实时同步
2. `pnpm dev:desktop` — Electron 模式：同一页面走 IPC，无 server 进程
3. `pnpm test` / `pnpm typecheck` 全绿
4. `pnpm package:desktop` 本地出 dmg，安装可跑，notes 数据落 SQLite
5. `release-dry-run.sh` 演练通过
6. 在新 clone 上跑 `node scripts/init.mjs`，改名后重复 1–4

残留审计：全局搜索 `trade|kansoku|longbridge|innei|symbol|chart|position` 等词，确认零残留（init 占位符除外）。

## 文档（English，模板仓库内）

- 架构总览：四层结构图、双传输选择逻辑、realtime 推送路径
- How to add a module：照 notes 示例逐层加文件
- Release guide：secrets 清单、Sparkle 密钥生成、首次发版步骤
- How to remove the examples：notes 与 chat 的删除文件清单

## 语言约定

模板仓库不受 trade-skills「中文文档」规则约束：其内的 README、docs、代码注释一律 English。本设计文档留在 trade-skills 仓库内，故用中文白话。
