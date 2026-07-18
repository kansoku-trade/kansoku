# 驾驶舱 AI 实时分析（pi-agent-core 内嵌）设计

日期：2026-07-05
状态：已批准，待实现

## 背景

驾驶舱（`/#/symbol/<SYM>`）目前的分工线是：server 只做确定性计算，判断类内容（预测、新闻打标、AI 综合结论）由用户在 Claude Code 里手动跑 `intraday-signal` 工作流生成，写进 chart JSON 存档。"实时"依赖人肉反复跑工作流。

本设计把这个人肉环节自动化：server 内嵌 AI agent，盘中自动做两层分析。手动开 Claude Code 跑 `intraday-signal` 的路完全保留，两者产物格式相同、互不干扰。

## 核心决定

1. **两层 AI**：
   - **点评员（Commentator）**——高频轻量。事件驱动 + 5 分钟心跳，读 server 打包好的数据快照，产出一条短点评。
   - **分析员（Analyst）**——低频完整重估。手动按钮或点评员升级触发，跑一次等价 `intraday-signal` 的完整流程，产出新的 chart JSON 存档。不设固定定时。
2. **进程内嵌，不 spawn 子进程**：用 `@earendil-works/pi-agent-core`（0.80.x，连带 `pi-ai`）在 `apps/server` 里直接 `new Agent()`。多 provider 支持由 pi-ai 提供。
3. **窄工具面**：agent 不碰 shell、不碰文件系统。工具是 server 里的普通 TS 函数，直调现有 services。结构化输出靠"提交工具 + typebox schema + terminate"保证，不解析自由文本。
4. **监控范围**：自动运行只针对「当天有 intraday 存档的标的」；手动重估按钮对任意标的可用。只在美股盘中时段运行（复用现有 session 判断）。

## 模块结构

新增 `apps/server/src/ai/`：

- `models.ts` — 解析 `.env` 的 `AI_COMMENT_MODEL` / `AI_ANALYST_MODEL`（`provider/id` 格式），`getModel()` 实例化；API key 用各 provider 标准环境变量。任一变量缺失则对应层整体停用（server 正常跑，AI 功能静默关闭）。
- `triggers.ts` — 纯函数触发检测器。输入：60 秒重算后的最新指标 + 当前存档预测。输出：触发列表。信号集：金叉/死叉、突破/跌破存档预测的入场/止损/目标价位线、资金流方向翻转、异常放量。另有 5 分钟心跳兜底（无触发也跑一次）。
- `datapack.ts` — 数据包构建（纯函数）。点评包：最新报价、近 48 根 m5 K 线+指标（约 4 小时）、当日资金流序列、当前存档预测摘要（方向/锚点/止损/目标）、最近几条已发点评（防重复）、触发原因。重估包：三周期 K 线+指标+资金流+当前存档+持仓。
- `commentator.ts` — 点评员。每次触发一次性 `new Agent()`，无会话；系统提示词 + 点评包为 prompt；唯一工具 `submit_comment`（schema：`{level: info|warn|alert, text, escalate: boolean}`），工具返回 `terminate: true` 结束。text 要求中文白话、不超过两句。
- `analyst.ts` — 分析员。一次性 `new Agent()`，五个工具：
  - `read_data_pack` — 返回重估包
  - `fetch_news` — 按需拉 longbridge 新闻（只读）
  - `fetch_kline` — 按需拉更长历史 K 线（只读）
  - `submit_prediction` — schema 校验后走现有 chart 创建逻辑生成新存档，成功后 terminate
  - `append_comment` — 往点评流写一条"重估完成"摘要
- `comments.ts` — 点评流存储。按天按标的追加写 `journal/charts/data/comments/<SYM>-YYYY-MM-DD.json`。

## 触发与调度

- 点评员：挂在现有 60 秒指标重算之后。检测器有输出 → 触发；连续 5 分钟无触发 → 心跳触发一次。
- 分析员：
  - 手动：`POST /api/symbols/:sym/reassess`。
  - 升级：点评员 `escalate=true`（结论与存档预测矛盾、或触及止损/目标位）时自动触发，30 分钟冷却，冷却期内的升级信号只记录不执行。

## UI（驾驶舱右栏）

- 新增「AI 点评」tab：打开先加载当天点评历史，SSE 实时追加新条目；按 level 着色；升级过的条目链接到触发生成的新存档。
- tab 顶部"重新分析"按钮，运行中显示状态、禁止重复点击。
- 心跳条目视觉压暗，连续心跳折叠成一行（如"13:40–14:20 无事 ×8"）。
- 最新一条 warn/alert 级点评在顶部报价条露出小徽章，用户停在其他 tab 时不漏警报。
- 重估产物是普通 chart 存档，现有 stale 徽章、历史列表自动生效。

## 护栏与错误处理

- 同一标的同一层同时只跑一个（内存锁去重）。
- 超时用 AbortController 中止 agent 循环：点评 60 秒、重估 10 分钟。
- AI 调用失败不影响 server 主流程，静默降级，往点评流写一条 error 级记录。
- 点评/预测输出由工具参数的 typebox schema 校验，不合格即工具报错，agent 可重试一次，仍失败则放弃本轮。

## 测试

- `triggers.ts` / `datapack.ts` / 点评流读写：纯函数与文件 IO 单测。
- agent 层：注入假 `streamFn`（或假 Agent 工厂），断言"给定数据包 → 调了 submit 工具 → 落盘/SSE 推送"，不真调模型。
- 工具函数直接单测（它们就是普通 TS 函数）。
- 手动冒烟脚本走一次真实模型链路（不进 CI）。

## 成本预估

点评员心跳 5 分钟 × 6.5 小时 ≈ 每标的每天约 78 次 + 事件触发，Haiku 级模型可忽略不计；分析员按需触发，单次成本与手动跑 `intraday-signal` 相当。

## 不做的事

- 不做多标的全市场扫描（范围限定在当天分析过的标的）。
- 不给 agent shell / 文件系统 / 写任意文件的能力。
- 不改动手动 `intraday-signal` 工作流和现有 chart 存档格式。
- 点评流不写进 chart JSON 存档（存档保持"分析时刻冻结快照"的定位）。
