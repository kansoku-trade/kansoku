# README 重构设计（AI 主线产品页 + skill 工具链外迁）

日期：2026-07-17

## 背景与目标

产品形态多次转变（图表脚本 → web app → Kansoku 桌面应用），README 虽在 `cbfc36f` 围绕桌面应用重写过，但仍是「功能列表 + 研究工作台全文」的混合体，长约 14.6K。本次重构目标：

1. README 定位为**产品主页**，主要读者是来下载 Kansoku 的产品用户。
2. 叙事以 **AI 能力**为主线，行情图表降级为 AI 的工作台背景。
3. skill 工具链（数据源、三层架构、纪律、数据坑、环境变量）整体搬去 `docs/research-toolchain.md`，README 只留一句话加链接。
4. 语言保持纯中文白话，不做英文版。

## 新 README 结构

| 节 | 内容要点 | 素材 |
|---|---|---|
| 头部 | lockup 横幅；tagline 改写，AI 前置（方向：「装在你 Mac 上的 AI 看盘搭子——用你自己的券商数据和 AI key，盘中点评、追问分析、研究改稿，全部本地完成」）；驾驶舱大图 | kansoku-lockup.svg、app-cockpit.png |
| 下载安装 | 照搬现有：Releases 链接、longbridge CLI 前置、右键打开、首次引导 | app-onboarding.png |
| AI 能做什么 · 盘中自动点评与后台巡检 | 从「个股驾驶舱」抽出 AI 点评、跟进通知、Bull/Base/Bear 情景推演；图表细节移去「看盘本体」 | — |
| AI 能做什么 · 追着分析问下去 | 现有小节基本保留（本就是 AI 视角） | app-chat.png |
| AI 能做什么 · 研究库 AI 助手 | 改稿提议（采纳/拒绝/撤销）、按信源刷新流水线、同一时间线 | app-research.png |
| AI 能做什么 · 模型自由 | codex 登录态 / LobeHub Cloud / 自带 key；按用途分配模型；key 加密存本地 SQLite | app-settings.png |
| 看盘本体 | 压缩现有约 5 个功能小节为一节 + 要点列表：多周期 K 线实时刷新、画线工具与样式预设、SEPA 仪表盘、盘面与复盘、多市场支持（现 NOTE 块压成一两句并入）、桌面原生体验（⌘K、标签页、Sparkle 自动更新） | app-sepa.png、app-home.png |
| 本地优先 | 新增短节（三五句）：行情走自己的长桥账户、指标本地实算、AI key 加密本地、研究结论落本地文件 | — |
| 开发 | 合并现有「架构 + 发版流程」：workspace 结构图 + dev/test/typecheck 命令保留；发版流程压成两三行 | — |
| 研究工作台 | 两三句话：仓库同时是 Claude Code 研究工作台（宏观/监管文件/新闻流/资金轮动），链接 `docs/research-toolchain.md` | — |
| 许可证 | 照搬 AGPL-3.0 + Commons Clause 说明 | — |

## 新文件 `docs/research-toolchain.md`

从 README 原样搬运（允许行文微调，不改事实）：

- 三层架构说明（数据源 / 编排工作流 / 落档）
- 数据源表格（Longbridge、HiThink、FRED、SEC EDGAR、GDELT、Trump Truth Social、Yahoo Finance）
- 工作流清单与路由 TIP
- 落档文件清单
- Python 脚本约定（stdlib-only、`--smoke`、输出协议、`_shared/`）
- 第三方 skill 与 `skills-lock.json` 说明
- 环境变量说明（`FRED_API_KEY`、`SEC_USER_AGENT`、`HITHINK_FINANCE_API_KEY`）
- 纪律清单与数据坑 WARNING

文件开头声明：**权威纪律源头在 `.claude/skills/trading-discipline/SKILL.md`，此处仅为概览**，避免成为第三份漂移拷贝。

## 不做的事

- 不动 `CLAUDE.md`、`app/` 下各 README。
- 不制作新截图，全部复用现有 GitHub release 附件图。
- 不写英文版 README。
- 不修改任何代码。

## 验收标准

- README 通读下来是一个 AI 产品页：AI 四小节在功能主体的最前面，行情图表压缩为单节。
- README 中不再出现数据源表格、纪律清单、数据坑、环境变量等研究工作台内容。
- `docs/research-toolchain.md` 覆盖上述搬运清单，且开头有纪律源头声明。
- README 内所有相对链接（LICENSE、app/desktop/README.md、docs/research-toolchain.md）有效。
