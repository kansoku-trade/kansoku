# 复盘日志区「跑一次分析」常驻按钮

## 背景

symbol 页复盘区「日志」标签的空态目前只有一行纯文字提示（`JournalSection.tsx:56`：
「还没有分析日志——跑一次 intraday-signal 会写入 journal/」），用户无法直接从这里触发分析。
而手动触发的能力早已存在：

- server：`POST /api/symbols/:sym/reassess`（`app/server/src/routes/symbols.ts`），
  调用 `runAnalyst({origin: "manual"})`，AI 分析员按 intraday-signal 流程跑完、落图、写 journal。
- web：`GenerateAnalysis` 组件（「AI 生成分析」按钮），但只出现在 symbol 页完全没有
  intraday 分析时的空态，完成信号是轮询最新图表文档 `/latest`。

本设计把这个动作接入日志区：**常驻按钮 + 以日志列表出现新条目作为完成信号**。
在日志空态场景下，`/latest` 信号不可靠（图表可能早已存在而日志尚未写入），轮询日志列表
与该区块展示的内容一致，最可靠。

## 改动范围

只改 web 前端 3 处，server 零改动。

### 1. `app/web/src/pages/cockpit/useReassessSymbol.ts`

把 `GenerateAnalysis.tsx` 里的 `REASON_TEXT`（"analyst layer disabled" / "already running" /
"escalation on cooldown" 对应的中文提示）挪到本文件导出，`GenerateAnalysis` 与新按钮共用。

### 2. `app/web/src/pages/cockpit/JournalSection.tsx`

日志标签页顶部加常驻按钮「跑一次分析」：

- 点击 → `reassess()`。
  - 启动失败（`started: false`）：显示 `REASON_TEXT` 对应文案，不进入 running 态。
  - 接口报错：走现有 `ErrorBox`。
- 启动成功进入 running 态：按钮显示 Spinner 并禁用；记录点击时刻的日志条目名集合作为基线。
- running 期间每 5 秒调用父层传入的 `reloadJournal()` 重拉列表；`entries` 中出现基线之外的
  新名字 → 完成，停止轮询，新条目自然出现在列表里。
- 超时兜底：10 分钟（与 `GenerateAnalysis` 一致）未见新条目则停止轮询，提示
  「等待超时——分析可能失败了，稍后刷新页面看看」。
- 空态文案改为「还没有分析日志——点上面的按钮跑一次」。

### 3. `app/web/src/pages/SymbolCockpit.tsx` / `app/web/src/pages/cockpit/ReviewTab.tsx`

journal `useQuery` 的 `reload` 顺着 props 传进 `JournalSection`（`reloadJournal`）。

## 组件接口

```
JournalSection({
  symbol, entries, selected, onSelect,
  reloadJournal: () => void,   // 新增
})
```

## 验证

web 侧无现成测试基建。验证方式：

1. `cd app && pnpm lint`（仅改动文件）。
2. `cd app && pnpm start`，进入某 symbol 页复盘区「日志」标签：
   - 未配置 analyst 模型时点按钮 → 显示「AI 分析未配置」提示。
   - 正常配置下点按钮 → running 态（Spinner + 禁用），分析完成后新日志条目自动出现。
   - 分析进行中再点（另一入口触发）→「已在分析中」提示。

## 不做的事

- 不改 server、不新增接口。
- 不动 symbol 页顶部空态的 `GenerateAnalysis` 按钮及其 `/latest` 轮询逻辑。
- 不在有日志时隐藏按钮（常驻，方便同一天补跑）。
