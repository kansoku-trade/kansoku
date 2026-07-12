# 首启 Onboarding 向导设计

日期：2026-07-12（2026-07-13 增补第 ③ 步）
状态：已确认，待写实施计划

> 2026-07-13 增补：新增第 ③ 步「连接 X/Twitter（opencli）」，见文末增补章节。原文中「两步向导」的描述由增补章节覆盖为三步。

## 背景

桌面端（Electron）现在的首启引导只有一张卡片（`app/web/src/onboarding/Onboarding.tsx`）：探测本机 Longbridge CLI 的安装与登录状态，三态展示（`cli_missing` / `login_required` / 修复登录），给出安装命令和「重新检测」。gate 逻辑在 `gateStatus.ts` + `useCredentialsGate.ts`，只在存在 desktop bridge 时生效，纯实时读凭据状态。web 部署不走引导（服务器上 CLI 已配好）。

与此同时，App 的 AI 能力现在有三种来源：

- `openai-codex`：直接读本机 codex CLI 的登录文件（`~/.codex/auth.json`），白嫖它已有的登录，无需额外 API Key（`packages/core/src/ai/credentialStore.ts`）。
- `lobehub`：LobeHub Cloud，Device Flow 登录，登录后用云端个人额度，无需自己填 key（gateway/provider/IPC 已实现，`packages/core/src/ai/lobehub/`）。
- 内置 API-key 厂商：openai / anthropic / google 等（来自 pi-ai `builtinModels()`），自己贴 key。

现在要把「连接数据 + 配置 AI」做成一个人性化、快捷的首启向导，而不是只卡长桥。

## 目标

- 首启把用户从「什么都没配」一步步带到「图表能用、AI 也能用」。
- 长桥作为硬前置：没装/没登录就进不了主界面，且掉线随时能被拉回修复。
- AI 作为软前置：能配则配，也能明确跳过、以后在设置里补；跳过后不再反复打扰。
- AI 配置走「智能推荐」：自动探测本机已登录的 codex，优先一键复用；没有则主推 LobeHub 登录；再不行手填 key。
- 连上任一 AI 来源后「配完即用」，用户不必再进设置手挑模型。

## 非目标

- 不做 web 端引导（仅 Electron）。
- App 不自己下载/安装任何 CLI，只做安装引导（命令 + 官网链接）。
- 第一版本地 CLI 只探测 codex，不接 claude 或其它。
- 不新做 LobeHub 的登录后端（复用已实现的 gateway/Device Flow）。
- 不改设置页既有的 AI 配置能力，仅让引导跳过后回落到设置页。

## 整体流程与外壳

两步向导，顶部进度指示 `① 连接数据 —— ② 配置 AI`。仅在 Electron（`gate.bridge` 存在）出现。

- 不做单独欢迎屏，直接进第 ① 步；第 ① 步屏顶放一句欢迎语。
- 外壳复用现有 `onboarding-drag-bar`（顶部拖拽条 + 红绿灯占位），保持无边框窗口可拖拽。
- 进度指示反映当前步骤；第 ② 步可返回第 ① 步查看（长桥若掉线则被强制留在 ①）。

## 第 ① 步 —— 连接数据（长桥，硬门槛）

沿用现有 `Onboarding.tsx` 的卡片内容与三态（`cli_missing` / `login_required` / 修复登录 + 安装命令 + 已找到路径 + 错误信息 + 重新检测）。变化：

- 屏顶加一句欢迎语。
- 底部加「下一步」按钮：**仅当实时凭据状态为「已装且已登录」时可点亮**，否则灰置。
- 过不了这步进不了第 ② 步，也进不了主界面。

## 第 ② 步 —— 配置 AI（智能推荐，软门槛）

进入这屏时先请求一次探测：`{ codex: 是否已登录, lobehub: 是否已连接 }`。codex 判定 = 能否从 `~/.codex/auth.json` 读到有效凭据（复用 `credentialStore`）。据此分两种画面。

### 画面 A —— 探到 codex 已登录

- 置顶大卡：`✓ 检测到 codex（已登录）— 一键直接用，不产生额外费用`，主按钮「使用 codex」。
- 下方两个次要小入口：`登录 LobeHub` ·「手动填 API Key」。

### 画面 B —— 没探到 codex

- 主推大按钮：`登录 LobeHub Cloud —— 登录即用，无需 API Key`。点击走 Device Flow（复用设置页那套弹窗：验证码 + 打开授权页 + 轮询），成功即连上。
- 次要区：
  - 「装了 codex 可白嫖本地额度」卡，展开给**安装引导**：复制安装命令按钮 + 官网链接（App 不自己安装）。
  - 「手动填 API Key」入口（openai / anthropic / google）。

### 两画面共有

- 屏底常驻一条弱化链接「跳过，稍后在设置里配置」。

### 连上后自动设默认模型

光连上 provider 不够——AI 各角色还得指到具体模型才能跑。因此连上任一来源后，向导**自动把该 provider 的首个可用对话模型指给 `primary` 角色**，其余角色保持 `inherit`：

- codex：指向其内置默认对话模型。
- lobehub：登录后刷新目录，取第一个 `enabled` 的对话模型。
- 手填 key 的厂商：取该厂商目录的首个对话模型。

用户由此「配完即用」，无需再进设置挑模型；之后想改仍可去设置页。

## Gate 与「完成」判定（双轨）

- **长桥 = 实时轨**：`computeGateStatus` 照旧实时读长桥凭据。掉登录 / CLI 消失 → 随时强制拉回第 ① 步修复。
- **AI = 一次性标记轨**：用户在第 ② 步**连上任一来源 或 主动点「跳过」** → 写一次性标记 `onboardingCompleted`（存 Electron `userData`，与 `external-api.json` 同级）。
- **合并判定**：
  - `长桥实时 OK && onboardingCompleted` → 进主界面。
  - 否则走向导，且从第一个未满足的步骤进：长桥没好 → ①；长桥好但无标记 → ②。
- 补配 / 改 AI 一律走设置页，不再从向导进。

## 数据与接口

### 一次性标记存取

- 桌面侧新增 `onboarding-state.json`（`userData` 下），字段 `{ completed: boolean }`，读/写方式对齐 `externalApi` 的文件 store（`createExternalApiFileStore` 那套：JSON、容错默认、`0o600`）。
- 通过既有 desktop credentials/IPC 通道暴露读写给 web 层。

### 探测接口

- 新增 `ai.detectProviders` → `{ codex: { loggedIn: boolean }, lobehub: { connected: boolean } }`。
  - codex：复用 `credentialStore` 读取 `~/.codex/auth.json`，能读到有效凭据即 `loggedIn`。
  - lobehub：读现有 LobeHub 账号/连接状态。

### 连上后设默认模型

- 连 codex / lobehub / 厂商成功后，写角色配置：`primary = { mode: custom, provider, modelId: 该 provider 首个可用对话模型 }`，其余角色 `mode: inherit`。复用现有设置存储（`settingsStore`）。

## 落到代码（预计改动面，实施计划中可微调）

- `gateStatus.ts` / `useCredentialsGate.ts`：并入 `onboardingCompleted` 读取，gate 从「单值」升级为「长桥实时 + 一次性标记」双轨；从第一个未满足步骤进入。
- 桌面侧新增 `onboarding-state.json` 文件 store + IPC，对齐 `externalApi` 写法。
- 新增探测接口 `ai.detectProviders`。
- 新增「连上后设默认模型」动作（写 `settingsStore` 角色配置）。
- `Onboarding.tsx` 拆为外壳（进度条 + 拖拽条）+ 两个 step 组件：`StepLongbridge`（现有内容 + 欢迎语 + 下一步按钮）、`StepAi`（新，画面 A/B、探测、下载引导、跳过、连后设模型）。
- LobeHub Device Flow 弹窗复用设置页实现。

## 边界情况

- **进第 ② 步后长桥掉线**：实时轨优先，强制回第 ① 步；`onboardingCompleted` 尚未写则不受影响。
- **codex 探到但凭据已过期/失效**：按「未登录」处理，回落到画面 B。
- **LobeHub 登录中关闭弹窗**：终止本地轮询，不写标记，不删已有凭据（沿用设置页语义）。
- **连上但设默认模型失败**（目录为空/刷新失败）：仍写 `onboardingCompleted`（用户已完成选择），但提示「AI 已连接，模型稍后在设置里选择」，不阻断进主界面。
- **用户直接跳过**：写 `onboardingCompleted`，不连任何 provider，不设模型；主界面 AI 功能表现为未配置。

## 已知取舍

- 第一版 LobeHub 暂用 `lobehub-cli` 的 Client ID，与 `2026-07-12-lobehub-cloud-provider-design.md` 中「生产不复用 lobehub-cli client id」的约定有出入。这是为尽快点亮登录路径的临时决定，待 Cloud 侧正式开发者 OAuth Client 就绪后替换，不影响本向导的其余设计。

## 测试

- gate 双轨：长桥 OK + 有标记 → 主界面；长桥 OK + 无标记 → 第 ②；长桥掉线 → 第 ①（无视标记）。
- `onboardingCompleted` 读写：容错默认、连上后写、跳过后写、写后不再走向导。
- 探测：codex 有效凭据 → 画面 A；无 → 画面 B；codex 凭据失效当作无。
- 连后设默认模型：codex / lobehub / 厂商各自写对 `primary`，其余 `inherit`；目录为空时的降级提示。
- LobeHub Device Flow 在引导内的成功 / 取消 / 关闭弹窗路径。

## 增补（2026-07-13）—— 第 ③ 步 连接 X/Twitter（opencli）

### 背景

AI 分析（如深度研究、消息面解读）需要抓取 X/Twitter 上的市场消息，数据通道是 [opencli](https://github.com/jackwener/opencli)（`npm install -g @jackwener/opencli`）：通过 Chrome 的 Browser Bridge 扩展复用浏览器登录态读推特，`opencli doctor` 一条命令可检查「已装 + daemon + 扩展连接 + x.com 登录态」。因此向导增加一步引导用户配好它。

### 流程与门槛

流程变为 `① 连接数据（长桥，硬）→ ② 配置 AI（软）→ ③ 连接 X/Twitter（软）`，顶部进度指示改三格。第 ③ 步与第 ② 步同为软门槛：可跳过，跳过后不再打扰，以后在设置里补。

### 第 ③ 步画面（按探测状态分档）

进入时探测一次 opencli 健康状态，四态：

- `not_installed` —— 没找到 `opencli` 命令 → 安装引导：复制 `npm install -g @jackwener/opencli` 按钮 + GitHub 链接（App 不代装，同 codex 的约定）。
- `extension_missing` —— 已装但 Browser Bridge 扩展未连接 → 给扩展安装步骤（Releases 下载 zip → `chrome://extensions` 开发者模式 → Load unpacked）。
- `no_session` —— 扩展已连但 x.com 未登录 → 提示去 Chrome 登录 x.com 后「重新检测」。
- `ready` —— 全通 → 大卡 `✓ X/Twitter 已连接，AI 分析可引用推特消息面`，主按钮「完成」。

每态都有「重新检测」；屏底常驻弱化链接「跳过，稍后在设置里配置」。文案讲清用途：AI 分析时抓取推特上的市场消息。

### 探测接口

内核新增 opencli 探测（归属 credentials 或 ai 模块，实施时定）：定位 `opencli` 可执行文件 → 运行 `opencli doctor` 并解析输出，映射到上述四态。`doctor` 会顺带拉起 daemon，这是期望的副作用（连通即代表可用）。返回形如 `{ state, cliPath, lastError }`，与长桥 `credentials.status` 同构。

### 完成标记与 gate

复用现有一次性标记 `onboardingCompleted`，不新增标记——写入时机从「第 ② 步连上/跳过」后移到「第 ③ 步完成/跳过」。gate 双轨逻辑不变：长桥实时轨照旧；`onboardingCompleted === false` 时进向导，从第一个未满足步骤进。opencli 状态不参与 gate——掉线不拉回向导，AI 分析抓不到推特时降级跳过该数据源。

### 边界情况

- **已完成 onboarding 的老用户**：`onboardingCompleted` 已为 true，不因新增步骤被重新拉进向导（符合软门槛定位）。
- **`doctor` 超时 / 输出解析失败**：归入 `not_installed` 兜底文案 +「重新检测」，不阻断「跳过」。

### 测试

- 四态映射：未装 / 扩展未连 / 未登录 / 全通各自渲染对应引导。
- 完成 / 跳过后写 `onboardingCompleted`；写标记时机后移不影响第 ② 步的连接动作本身。
- 老用户（已有标记）不回炉。
- `doctor` 异常时降级到 `not_installed` 且「跳过」仍可用。
