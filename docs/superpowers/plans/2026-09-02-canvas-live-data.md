# 画布活数据 — 实施计划

Spec: `docs/superpowers/specs/2026-09-02-canvas-live-data-design.md`（唯一权威，冲突以 spec 为准）。

## Global Constraints

- 零注释、零 JSDoc（`~/.claude/CLAUDE.md`）。文件 ≤ 500 行，React 组件 ≤ 300 行。
- 只 lint/typecheck 改动的包：`pnpm --filter @kansoku/core typecheck`、`pnpm --filter @kansoku/web typecheck`、`pnpm --filter @kansoku/canvas typecheck`。测试用包内 `pnpm test`（`apps/web` 不要用 `--filter exec vitest`）。
- iframe 永远不开 WS、不 fetch；`useEffect` 对画布源码仍是禁词（SDK 内部可用）。
- `CandleFeed` 形状固定：`{ symbol: string; asOf: string; timeframes: Record<'m5'|'m15'|'h1', IntradayTfData> }`，`IntradayTfData` 来自 `packages/shared/types.ts:229`。放在 `packages/shared/types.ts`，SDK 与 core 都从那里引。
- 数据文件命名 `journal/canvases/<slug>.<name>.json`，`name` 匹配 `/^[a-z0-9-]+$/`，单文件 ≤ 512 KB。
- 每个 task 在分支 `feat/canvas-live-data` 上提交一次，提交信息中文、`feat(canvas): …` 形式，不加 AI 署名，末尾加一行 `Claude-Session: https://claude.ai/code/session_01F7A3FbhSVhm2xz12dR7VSN`。不 push。
- 文档与代码内文案用中文白话。

## Task 1: 数据文件 + 工具 + 静态检查

**改动文件**：`packages/core/src/canvas/store.ts`、`check.ts`、`compile.ts`、`tools.ts`、`packages/core/src/contract/canvas.ts`、`packages/shared/types.ts`，以及对应 `*.test.ts`。

1. `packages/shared/types.ts` 新增 `CandleFeed` 接口（见 Global Constraints）。
2. `contract/canvas.ts`：`CanvasDoc` 加 `data: Record<string, unknown>`。
3. `store.ts`：
   - `canvasDataPath(dir, slug, name)`；`loadCanvas` 读出所有 `<slug>.*.json` 填进 `data`（坏 JSON 的文件跳过并在 `check` 里不动）。
   - `saveCanvasData(dir, { slug, name, json: string })`：画布不存在 → `{ ok:false, issues:['canvas not found'] }`；`name` 不合法 / `JSON.parse` 失败 / 超 512 KB → 各自一条 issue；成功写文件后返回 `{ ok:true }`。
   - `saveCanvas` 在静态检查后、落盘前，对源码里每个 `./<name>.json` 导入检查文件存在，缺则拒收 `missing data file: <slug>.<name>.json`。`listCanvases` 不变。
4. `check.ts`：
   - `IMPORT_RE` 命中的 spec 若匹配 `/^\.\/([a-z0-9-]+)\.json$/` 放行；其余相对路径照旧拒。导出 `canvasDataImports(source): string[]` 给 store 和 compile 用。
   - 源码里出现 `function useQuote` / `function useCandles` / `const useQuote` / `const useCandles` 拒收 `useQuote / useCandles must come from @kansoku/canvas`。
   - live 标的计数：统计 `useCandles(` 与 `useQuote(` 出现次数之和，> 6 拒收 `at most 6 live subscriptions per canvas`。
5. `compile.ts`：`toFactoryBody` 把 `import x from './a.json'` 改写成 `const x = __kansoku_canvas_data__["a"];`；`instantiateCanvas(code, sdk, react, data = {})` 用 `new Function(INJECTED, 'React', '__kansoku_canvas_data__', code)`。
6. `tools.ts` 的 `buildCanvasTools` 返回值追加两个工具（三个载体自动带上）：
   - `save_canvas_data`（`slug`、`name`、`json`）：受 `skillLoaded` 门禁；调 `saveCanvasData`；成功回 `saved data slug=<slug> name=<name> bytes=<n>`，失败回 `rejected:\n<issues>`。
   - `snapshot_candles`（`slug`、`name`、`symbol`）：受 `skillLoaded` 门禁；画布不存在拒；`normalizeSymbol` 后调 `buildChart({ type:'intraday', symbol, session:'all', skip_news:true, day_kline_lazy:true, enrichment_lazy:true })`（`packages/core/src/charts/build.ts:304`），从 `result.built`（`IntradayBuilt`）取 `timeframes` 组成 `CandleFeed`（`asOf` 为当前 ISO 时间），JSON 化后走 `saveCanvasData`。回 `snapshot saved slug=<slug> name=<name> symbol=<symbol> bars m5=<n> m15=<n> h1=<n>`。构建失败回 `rejected: <message>`。
   - `read_canvas` 返回体去掉 `data` 内容，换成 `dataFiles: [{ name, bytes, shape }]`，`shape` 为数组时 `array[<len>]`，对象时 `object{<keys>}`。
   - `save_canvas` / `edit_file` 的 description 各加一句：K 线数据用 `snapshot_candles`，任意数据用 `save_canvas_data`，源码里 `import x from './<name>.json'`。
7. `canvas.service.ts` 不需要新路由；`get` 自然带出 `data`。
8. 测试：`check.test.ts`（放行 `./a.json`、拒 `../a.json` `./a.ts` `./A.json`、自定义 hook 拒、超 6 拒）；`compile.test.ts`（JSON 导入注入取得到）；`store.test.ts`（`saveCanvasData` 四种拒收 + 成功、`loadCanvas` 带 `data`、`saveCanvas` 缺文件拒）；`tools.test.ts`（`snapshot_candles` mock `buildChart` 后文件形状是 `CandleFeed`；`read_canvas` 只回清单）。先写测试再实现。

## Task 2: `CandleChart` 的 `source` / `tf` + 前端注入

**改动文件**：`packages/canvas-sdk/src/CandleChart.tsx`（若超 300 行拆出 `candleFeed.ts` 放取值逻辑）、`apps/web/src/features/canvas/canvasRuntime.ts`、`canvas-guest-entry.tsx`、`CanvasFrame.tsx`、`CanvasPane.tsx`、`.claude/skills/canvas/sdk/CandleChart.d.ts`（跑 `pnpm --filter @kansoku/canvas types:skill` 重生成），以及测试。

1. `CandleChartProps` 新增 `source?: CandleFeed | null`、`tf?: 'm5'|'m15'|'h1'`（缺省 `m5`）。`source` 与 `bars` 同时给 → `throw new Error('CandleChart: pass either source or bars')`。
2. `source` 为 `null`/`undefined` 且无 `bars` → 渲染与图同尺寸的空框，中间一行 `等待行情…`（用 `theme.textMuted`）。
3. `source` 有值：从 `source.timeframes[tf]` 取 `candles`→蜡烛、`volumes`→成交量、`emas`→EMA 线、`macdDif`/`macdDea`/`macdHist`→MACD 副窗、`offSession`→盘前盘后底色。不画 `markers`/`autoDivergence` 等服务端标记。Agent 传的 `priceLines`/`zones`/`markers` 照旧叠加。
4. 增量更新：`source` 引用变化且 `tf` 不变时，不重建 chart；对比上次的最后一根时间戳，相同则 `series.update(last)`，更新则 `update` 追加新根。`tf` 变化或 `bars` 模式照旧重建。
5. `canvasRuntime.ts`：`loadCanvasComponent(source, data)` 把 `data` 传给 `instantiateCanvas`。`canvas-guest-entry.tsx` 的 `source` 消息多带 `data`。`CanvasFrame` props 加 `data?: Record<string, unknown>`，`postSource` 一并发。`CanvasPane` 与 `ResearchPage` 里调 `CanvasFrame` 的地方传 `doc.data`。
6. 测试：`CandleChart` 单测（`source`+`tf` 取对周期；`null` 等待态；同时给两者抛错）；`canvasRuntime.test.tsx` 带 JSON 导入能渲染。
7. 端到端由控制器另行验证，本 task 不做。

## Task 3: 实时钩子 + `CanvasFrame` 代订 + 顶栏圆点

**改动文件**：`packages/canvas-sdk/src/live.tsx`（新）、`index.tsx`、`names.ts`、`apps/web/src/canvas-guest-entry.tsx`、`CanvasFrame.tsx`、`CanvasPane.tsx`、`.claude/skills/canvas/sdk/*.d.ts`（重生成），测试。

1. SDK `live.tsx`：
   - 一个模块级 `FeedBridge`：维护 `Map<key, { count, listeners:Set<fn>, value }>`，`key = kind + ':' + symbol`。`subscribe(kind, symbol, listener)` 首次 `count 0→1` 时 `parent.postMessage({ type:'sub', kind, symbol }, '*')`；退订到 0 时发 `unsub`。监听 `window` 的 `message`，`{ type:'feed', kind, symbol, data }` 更新 `value` 并广播；`{ type:'feed-status', connected, degraded }` 存进 bridge 状态。
   - `useQuote(symbol): QuoteCell | null`、`useCandles(symbol): CandleFeed | null`：`useSyncExternalStore` 订阅 bridge。`symbol` 用与 `apps/web/src/lib/symbol.ts` 的 `normalizeSymbol` 相同规则处理（复制那一小段规则到 SDK，不跨包 import web）。
   - `index.tsx` 导出 `useQuote`、`useCandles`；`names.ts` 同步。
2. `CanvasFrame.tsx`：收到 `sub` 时用 `subscribeChannel`（`apps/web/src/lib/ws/wsHub.ts:133`）代订：`quotes` → `{ kind:'quotes', extra:[symbol] }`，payload 是 `{type:'data', data: QuoteSnapshot}`，挑出 `symbol` 的 `QuoteCell` 转发；`preview` → `{ kind:'preview', symbol }`，用 `decodePreviewEnvelope`（`useIntradayPreview.ts:25`）取 `built`，转成 `CandleFeed`（`asOf` 取当前 ISO 时间）转发。`unsub` 时释放。iframe 重载或卸载时全部释放。连接/降级状态变化时向 iframe 发 `feed-status`，并通过新 prop `onLiveStatus?(status: { subscribed: boolean; connected: boolean; degraded: boolean })` 报给外层。
3. `CanvasPane.tsx` 顶栏标题旁 6px 圆点：`subscribed && connected && !degraded` 绿（`colors.up`），`subscribed` 但断线/降级灰（`colors.textMuted`），未订阅不渲染。
4. 测试：SDK `live.test.tsx`（首订发 `sub`、二订不重发、退订到 0 发 `unsub`、`feed` 消息更新 hook 返回值）；`CanvasFrame.test.tsx`（mock `subscribeChannel`，`sub` 消息触发代订、推送被转发成 `feed`、`unsub` 释放、`onLiveStatus` 回调）；`CanvasPane.test.tsx` 圆点三态。

## Task 4: skill 与类型声明

**改动文件**：`.claude/skills/canvas/SKILL.md`、`.claude/skills/canvas/sdk/*.d.ts`（重生成确认）、`apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx`（加一段 `useQuote` + `CandleChart source` 示例）、`packages/core/src/canvas/check.test.ts`（若 demo 检查有覆盖）。

1. SKILL.md 新增「数据从哪来」一节，放在 Workflow 里：小数据内联；K 线一律 `snapshot_candles`（事后复盘）或 `useCandles`（用户明确要盯盘），**禁止手打 bars**；任意其他数据 `save_canvas_data` + `import x from './<name>.json'`；live 画布 `Source` 写「实时」，快照写 `asOf`；`source={null}` 的「等待行情…」是唯一允许的空态；每份画布 live 订阅 ≤ 6。
2. 组件表加 `useQuote` / `useCandles` 一行（Live），`CandleChart` 描述加 `source` / `tf`。
3. 工具表（如有）加 `save_canvas_data`、`snapshot_candles`。
4. 「Troubleshooting」加一条：`missing data file` 表示先 `save_canvas_data` / `snapshot_candles` 再 `save_canvas`。
5. `kitchenSink.canvas.tsx` 加示例并确认 `checkCanvasSource` 通过。
