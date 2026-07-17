<p align="center">
  <img src="./app/web/public/brand/kansoku-lockup.svg" alt="Kansoku" width="560">
</p>

# Kansoku

> 装在你 Mac 上的 AI 看盘搭子——用你自己的券商数据和 AI key，盘中点评、追问分析、研究改稿，全部本地完成。

**Kansoku（観測）** 是一个 macOS 桌面应用：行情从你自己的长桥账户拉，指标全部本地实算，AI 用你自己配置的模型盯盘、答疑、改研究稿，结论落成本地文件。数据和 key 都不出你的机器。

![Kansoku 个股驾驶舱](https://github.com/Innei/kansoku/releases/download/web-preview/app-cockpit.png)

## 下载安装

去 [Releases](https://github.com/Innei/kansoku/releases) 下载最新 `desktop-v*` 版本的 `Kansoku-x.y.z-arm64.dmg`（macOS · Apple Silicon），拖进「应用程序」即可。应用内置 Sparkle 自动更新（EdDSA 签名 + 增量包），装一次就不用再回来手动下载。

前置依赖：本机安装并登录 [longbridge CLI](https://open.longbridge.com/docs/cli/install)（行情和账户数据都走它）。应用当前没有付费开发者签名，首次打开需要右键 →「打开」，详见 [`app/desktop/README.md`](./app/desktop/README.md)。

首次启动有引导：连上长桥数据，再选一个 AI 接入方式（本机 codex 登录态 / LobeHub Cloud / 自带 API key），也可以先跳过。

<img src="https://github.com/Innei/kansoku/releases/download/web-preview/app-onboarding.png" alt="首次启动引导" width="100%">

## AI 能做什么

**盘中自动点评，关掉图表还在巡检** —— 打开一只票，AI 结合多周期 K 线、形态标注和实时行情给出短线方向判断，以及 Bull/Base/Bear 三档情景推演（概率合计 100%，附触发条件）。开启跟进后，关掉图表它仍在后台按行情巡检，判断变了就通知你。右栏还带财报与宏观事件日历，页签在预测、环境、消息、复盘和 AI 点评之间切换。

**追着分析问下去** —— 每份分析都能就地追问「凭什么」。面板浮在图上，可拖走、可缩放、可全屏。AI 会先读你的画线再结合实时行情回答；让它标关键价位时会直接画到图上（紫色虚线，悬停看说明），工具条可一键只清 AI 画的线。查了什么数据全程留痕，点开就是工具调用详情；答歪了随时停止，半截回答不会丢；空面板会先替你想好三个最该问的问题。已归档的预测是冻结记录，追问只解释、不改写。

![追着分析问下去](https://github.com/Innei/kansoku/releases/download/web-preview/app-chat.png)

**研究库 AI 助手** —— 在应用里翻看和搜索本地的股票档案与研究日志，文档内直接对话提问。助手能提议改稿（采纳 / 拒绝 / 撤销），也能按信源刷新研究内容（制定计划 → 核查文档 → 检查市场 → 综合证据 → 生成提案），刷新结果、改稿提议、关联资料和历史记录都在同一条对话时间线里。

![研究库](https://github.com/Innei/kansoku/releases/download/web-preview/app-research.png)

**模型自由，key 不出机器** —— 盘中快评、升级分析、深度研究、追问四个用途各自选模型：跟随主模型、单独指定或停用。Provider 支持本机 codex 登录态（不额外收费）、LobeHub Cloud（登录即用）和自带 API key（openai / anthropic / google / deepseek），key 加密存本地 SQLite。

![设置页](https://github.com/Innei/kansoku/releases/download/web-preview/app-settings.png)

## 看盘本体

AI 之下是一套完整的本地看盘工具：

- **多周期 K 线**（5m/15m/1h）打开时跟着行情实时刷新，叠加均线、MACD、形态标注和入场/止损/目标价位线。
- **画线工具**：趋势线、多段线、水平线、矩形、斐波那契，可改颜色/粗细/虚线/箭头；样式预设画之前先调好，之后每条线自动带上。
- **SEPA 策略仪表盘**：Minervini 趋势模板 8 条逐项打钩，长期均线价值区、成交密集区、52 周高低距离、RS 相对强弱（vs SPY）、量能比一屏呈现，自动给出 Buy / Watch List / Avoid 结论。
- **盘面与复盘**：盘中看板和历史复盘随时段自动切换，可点的交易日时间线、判断与结果追踪、历史预测命中率、当日资金流向和 AI 花费流水。
- **多市场**：美股为主，港股（`700.HK`）和 A 股（`600519.SH` / `000001.SZ`）已接入，交易时段、午休断档、时区显示按各自市场处理；美股专属能力在非美股代号上自动隐藏。
- **桌面原生体验**：应用内标签页（⌘T 新开）、⌘K 命令面板、系统菜单、窗口状态记忆、盘前/盘后/夜盘实时推送、应用内自动更新。

![SEPA 策略仪表盘](https://github.com/Innei/kansoku/releases/download/web-preview/app-sepa.png)

![盘面复盘](https://github.com/Innei/kansoku/releases/download/web-preview/app-home.png)

## 本地优先

- 行情和账户数据从你自己的长桥账户拉，不经过任何中间服务器。
- 均线、MACD、RS、趋势模板、成交分布、K 线形态、背离/背驰等指标全部在本机用 TypeScript 实算。
- AI key 加密存在本地 SQLite；用哪个模型、花了多少钱，都在你自己的账上。
- 分析结论和图表快照落成本地 markdown / JSON，随时可审计、可迁移。

## 开发

`app/` 是 pnpm workspace，内核与宿主分离：

```text
app/
├── packages/core/   # @kansoku/core 内核：调 longbridge CLI 拉数据，TypeScript 实算全部指标
├── server/          # 薄 HTTP 宿主（Tsuki 控制器 + WebSocket），浏览器模式用
├── desktop/         # Electron 壳：内嵌同一个内核，走类型化 IPC，Sparkle 自动更新
└── web/             # Vite + React 前端，按运行环境自动选 HTTP 或 IPC 传输
```

```bash
cd app && pnpm install       # 首次
cd app && pnpm dev           # 浏览器模式：web + server，http://localhost:5199
cd app && pnpm dev:desktop   # 桌面模式：web + Electron，不起 server 进程
cd app && pnpm test          # 全 workspace 测试
cd app && pnpm typecheck     # 全 workspace 类型检查
```

发版全链路自动化：`/release` skill 写更新说明、升版本、开 PR，合并后 CI 自动打 tag、构建签名并发布 Release，已装用户收到应用内更新提示。更新说明维护在 `app/desktop/CHANGELOG.md`，workflow 见 `.github/workflows/`。

## 研究工作台

仓库同时是一个 Claude Code 研究工作台：一套自研 + 第三方 skill 覆盖宏观数据、监管文件、全球新闻流、资金轮动和交易决策关卡，研究结论落成本地日志。详见 [`docs/research-toolchain.md`](./docs/research-toolchain.md)。

## 许可证

本项目采用 **AGPL-3.0 + Commons Clause** 授权（见根目录 [LICENSE](./LICENSE)）：

- 允许个人使用、公司内部自用、fork、学习和修改；修改后对外提供服务需按 AGPL-3.0 开放源码。
- **禁止「出售」本软件**——不得把本软件本体（或其功能的实质部分）作为收费产品或收费服务（含托管、付费支持等）提供给第三方。
- 该组合不是 OSI 认证的开源许可证，属于 source-available。
