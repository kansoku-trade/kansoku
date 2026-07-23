# 分析等待体验：活动流 + 分段交卷 设计

日期：2026-07-23
状态：已确认（等待实现计划）

## 背景与问题

进入一个还没有分析过的个股页，`SymbolCockpit` 渲染 `PreviewCockpit` 空状态，用户要手动点「AI 生成分析」，之后进入一段很长的等待（analyst 是多轮推理循环，上限 15 分钟）。等待期间只有四个粗阶段（准备中 → 研究中 → 写作中 → 收尾）加一句活动描述，没有任何中间产物可看。

用户定位的优先痛点：等待过程不可感知、无法提前消费部分结果（手动触发本身可以接受，自动化留待以后）。

## 目标与非目标

目标：

- 等待期间实时展示 agent 正在做什么（工具调用级别的活动流）。
- 分析过程中分两段提前交付可用的中间结果：技术面读数 → 消息与资金面，最终完整预测落地时替换全部中间态。
- 技术面读数中的关键价位提前画到实时预览图上。

非目标：

- 不缩短分析总时长，不换模型，不降低分析质量要求。
- 不做进入页面自动触发分析（另行立项）。
- 不做逐字流式输出。

## 范围

改造对象是免费的 analyst 流水线（`packages/core/src/ai/personas/analyst/run.ts` 的 `executeAnalystRun`）。手动触发（`POST /api/symbols/:sym/reassess`）与 Pro 自动跟踪的升级触发（`runAnalyst({origin:'escalation'})`）走同一条路，自动同时受益。分段与活动流属于免费能力，不加 feature 门控。

## 设计

### 1. 运行状态扩展（活动流）

`RunningAnalystRunStatus`（`packages/core/src/ai/personas/analyst/types.ts`）增加两个字段：

- `activities: Array<{ at: string; text: string }>` —— 环形缓冲，上限 50 条。
- `sections: { technical?: TechnicalSection; context?: ContextSection }` —— 分段结果。

事件来源：`executeAnalystRun` 给 `createAgentSession` 传 `onEvent`（`agentSession.ts` 已有该接口，当前未使用），把 `AgentEvent` 中的工具调用事件映射成中文描述。映射是一个纯函数 `describeToolCall(name, args)`：

- `fetch_kline` → 「正在读 5 分钟 K 线」（按参数带出周期）
- `fetch_news` → 「正在查 {symbol} 新闻」
- research / exec 类 → 「正在联网搜索：{摘要}」
- 未知工具 → 通用文案（「正在调用 {name}」）

模型每开始新一轮推理追加一条「第 N 轮推理中」。现有 `reportProgress` 的四阶段保留不动，活动流是其细化层。

WS 协议不变：`analyst-runs` 频道整包推 status，连接时 `init` 携带全量 activities 与 sections，断线重连、中途进入页面均可恢复现场。

### 2. 分段交卷

新工具 `submit_section`（加入 `analyst/tools.ts` 的工具集），两种载荷，schema 定义在 `packages/shared`，服务端校验：

- `technical`：
  - 各周期趋势分类（up / down / sideways，窗口口径对齐 TD-TREND-01）
  - 关键价位数组：`{ price: number; label: string }`（如「日内高点 187.4」「EMA20 失守位」）
  - 读数摘要，不超过 200 字
- `context`：
  - 消息面 / 资金面 / 事件风险摘要，不超过 200 字
  - 倾向标记：利多 / 利空 / 中性

提交后写入 run state 的 `sections` 并广播；工具返回成功回执，agent 继续执行。

提示词契约（analyst 系统提示追加两条）：读完数据包先提交 technical 段；读完消息面再提交 context 段；两段都要短；最终判断以 `submit_prediction` 为准。

约束强度：**软约束**。模型忘交不重试、不失败，体验退化为纯活动流，主流程零风险。

持久化：分段不落盘。它们是运行中的瞬时产物，跑完后被正式分析（chart doc + AI 点评）取代，run state 的生命周期正好匹配。

### 3. 前端

新组件 `AnalystRunFeed`（`apps/web/src/features/cockpit/`）：

- 上半部分：两张分段卡片（技术面读数 / 消息与资金面）。未到货显示占位骨架，到货即填充。每张卡片带「中间读数，最终结论可能修正」标注。
- 下半部分：活动流，最近若干条滚动显示，当前条带呼吸点动画。

挂载位置（两个 cockpit 的预测 tab）：

- `PreviewCockpit`：运行中时替换 CTA 按钮区域。
- `SymbolCockpit`（重新分析场景）：显示在旧预测内容上方，收成一条可展开的窄条，不挤掉旧内容。

数据来源：现有 `analystRunsStore`（扩展解析新字段），不加新的 HTTP 请求。

关键位提前上图：technical 段到货后，把关键价位作为客户端叠加层画到实时预览图上——水平虚线 + 标签，样式与正式分析的关键位区分（更淡 + 「预读」角标）。纯前端叠加，不触发服务端 chart rebuild。

### 4. 数据流

```
点击生成 → POST /reassess → runAnalyst（不变）
  → executeAnalystRun
      onEvent → describeToolCall → appendActivity → WS analyst-runs
      submit_section → runState.sections → WS analyst-runs
      submit_prediction →（不变）createChart → WS analyses → 前端切换到正式分析
  运行结束 → run state 清除 → feed 与叠加层消失
```

### 5. 错误处理与降级

- 运行失败 / 超时：状态协议里没有失败标记（运行结束一律广播 `{running:false}`），前端用近似规则识别失败：`analystRunsStore` 在「运行结束且这次运行有内容」时保留最后一次的 sections 与 activities（含 `startedAt`），`PreviewCockpit` 仅当没有晚于 `startedAt` 的新分析时才按失败态渲染——顶部显示「分析未完成」横幅，卡片保留可读，直到用户重跑或离开页面。成功的运行会产出新分析，该门控保证不会误标成失败。断线重连后中间态不再恢复（可接受）。
- `submit_section` 载荷校验失败：给模型返回错误，让它自行修正或放弃，不中断运行。
- 模型跳过分段：纯活动流兜底，无异常路径。
- WS 断连：重连后 `init` 全量恢复，前端不做本地持久化。

## 测试

- `describeToolCall`：全部已知工具的映射 + 未知工具回退。
- `runState`：activities 环形缓冲上限、sections 写入与广播、运行结束后清除。
- `submit_section` 工具处理器：合法 / 非法载荷、schema 校验、校验失败返回错误不中断。
- 前端：store 解析新字段；`AnalystRunFeed` 三态渲染（骨架 / 部分到货 / 失败）。
- 手动验收：`pnpm dev:desktop` 对一个无分析符号跑完整流程，确认活动流滚动、两段卡片先后到货、关键位预读上图、正式分析落地后中间态消失。

## 备选方案（未采纳）

- 只做仪表化（纯活动流）：改动最小，但拿不到提前的部分结果。
- 快先锋 + 主力（先用便宜模型单轮速读，完整分析跑完替换）：首内容到达时间有保证，但属于丢弃式工作，且浅判断可能与最终结论冲突。留作以后不满足时的追加项。
