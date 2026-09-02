# 画布活数据：JSON 旁路文件 + 实时钩子 + Live K 线

日期：2026-09-02
范围：画布的外置 JSON 数据文件、服务端 K 线快照、`useQuote` / `useCandles` 两个实时钩子、`CandleChart` 的 `source` 喂法。存储、编译、沙箱、对话分栏的模型不变。延续 [agent-canvas-design](./2026-08-28-agent-canvas-design.md) §8 里「活行情 hooks 下一版做」的口子。

## 背景与问题

现在画布只有一种数据来源：写死在 TSX 里。两处顶不住：

- **K 线塞不下。** `mrvl-chain-tape` 一份 20 KB，绝大多数是 `const BARS = [...]`；源码上限 64 KB，再多一个周期就爆。Agent 还得把几百根 K 线一根根重打进源码，费 token 又容易抄错。
- **图是死的。** 画布是分析当时的快照，盘中打开看不到最新一根。驾驶舱有一整套实时层（`quotes` / `preview` 通道、60 秒重算、推送降级），画布一点没沾。

外置 JSON 现在也不支持：`check.ts` 只放行 `@kansoku/canvas`，编译是 sucrase + `new Function` 没有模块解析。

## 设计

### 1. 数据文件

- 位置 `journal/canvases/<slug>.<name>.json`。`name` 只允许 `[a-z0-9-]+`，单文件上限 512 KB。
- 画布里 `import bars from './<name>.json'`。`checkCanvasSource` 放行且只放行同目录 `./<name>.json` 形式的相对导入；文件不存在时 `save_canvas` / `edit_file` 拒收，理由写明缺哪个文件。
- `CanvasDoc` 增加 `data: Record<string, unknown>`。`canvas.get` 读源码时把所有 `<slug>.*.json` 一并读出来。`listCanvases` 照旧只扫 `.canvas.tsx`，`.json` 不进列表、不进研究库。
- 编译：`toFactoryBody` 把 `import x from './a.json'` 改写成 `const x = __kansoku_canvas_data__['a']`，与 SDK 注入同一套路。`instantiateCanvas` 多接一个 `data` 参数。iframe 照旧不碰文件系统。
- 现有画布没有 JSON 文件，`data` 为空对象，行为不变。

### 2. 工具

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `save_canvas_data` | `slug` `name` `json`（字符串） | Agent 自己写任意 JSON。落盘前 `JSON.parse` 一遍，坏的拒收。 |
| `snapshot_candles` | `slug` `name` `symbol` | 服务端用 `preview` 同一套 builder（`buildChart({ type: 'intraday', ... })`）算完，把三周期的 `CandleFeed` 写进文件。数据不经过模型。 |
| `read_canvas` | 不变 | 返回值多一段 data 清单：每个文件的名字、字节数、顶层形状（数组长度或对象键名），不回内容。 |

两个写工具都要求 `slug` 对应的画布已存在，画布不存在先 `save_canvas`。都受 `skillLoaded` 门禁。

### 3. 实时钩子

SDK 只新增两个钩子，其余照旧禁 `useEffect`。

```ts
useQuote(symbol: string): QuoteCell | null
useCandles(symbol: string): CandleFeed | null
```

`CandleFeed` 是 `IntradayBuilt` 的画布视图：

```ts
interface CandleFeed {
  symbol: string;
  asOf: string;
  timeframes: Record<'m5' | 'm15' | 'h1', IntradayTfData>;
}
```

`snapshot_candles` 写的就是这个形状，静态就是冻结的 live。

**数据走法。** iframe 不开 WS、不 fetch。钩子内部向外层 `postMessage({ type: 'sub', kind: 'quotes' | 'preview', symbol })`，`CanvasFrame` 用现有 `subscribeChannel` 代订，收到推送转发 `{ type: 'feed', kind, symbol, data }` 进 iframe；钩子卸载时发 `unsub`。同一 iframe 内同一标的只订一次（引用计数），跨 iframe 由 `wsHub` 自己去重。`quotes` 推的是 `QuoteSnapshot`，`CanvasFrame` 挑出该标的的 `QuoteCell` 再转发；`preview` 推的是 `IntradayBuilt`，转成 `CandleFeed` 再转发。

连接状态一起转发（`{ type: 'feed-status', connected, degraded }`），给顶栏圆点用。

### 4. `CandleChart`

新增 `source` 与 `tf` 两个 prop，老的 `bars` 写法保留：

```tsx
<CandleChart source={useCandles('MU.US')} tf="m5" zones={...} />   // live
<CandleChart source={snap} tf="m5" zones={...} />                  // import snap from './mu.json'
<CandleChart bars={...} macd={...} />                              // 老写法
```

- `source` 是 `CandleFeed | null`，`tf` 缺省 `m5`。`source` 为 `null` 时渲染空图框加「等待行情…」，这是唯一允许的空态（skill 里注明）。
- 从 `IntradayTfData` 取 `candles` / `volumes` / `emas` / `macdDif` / `macdDea` / `macdHist` / `offSession` 画，服务端已算好的东西一律不重算。`markers` 只画 Agent 自己传的，不画服务端的自动标记，避免和 Agent 的标注打架。
- `source` 和 `bars` 同时给报运行时错误。
- live 时图不重建：首帧 `setData`，之后每次推送只对最后一根 `update`，新 bar 到了再 `update` 追加。切 `tf` 才重建。
- Agent 的 `priceLines` / `zones` / `markers` 仍是静态叠加，与数据来源无关。

### 5. 呈现与 skill

- `CanvasPane` 顶栏标题旁加一个 6px 圆点：绿 = 有订阅且已连接，灰 = 断线或降级；画布没订阅时不显示。
- `Source` 组件不动；skill 要求 live 画布 `Source` 写「实时」，快照画布写数据截止时间（取 `CandleFeed.asOf`）。
- skill 新增一节「数据从哪来」：小数据内联；K 线一律 `snapshot_candles` 或 `useCandles`，禁止手打 bars；用户明确要盯盘才用 live，事后复盘用快照。同步 `.claude/skills/canvas/sdk/*.d.ts`。
- 研究库第三档打开 live 画布同样是活的，走同一个 `CanvasFrame`，不另做。

### 6. 静态检查改动

- 相对导入：只放行 `./[a-z0-9-]+\.json`，其余相对路径仍拒。
- 新增：`useQuote` / `useCandles` 必须从 `@kansoku/canvas` 导入，源码里自己声明同名函数拒收。
- 每份画布 live 标的上限 6 个（`preview` 每个标的一条通道，WS 每连接最多 16 条），超了拒收。

## 不做

- 画布自己开 WS 或 fetch。沙箱不开口。
- 活行情写回 JSON、自动把 live 冻结成快照。
- 除 `useQuote` / `useCandles` 以外的钩子。
- 非 K 线的 live 图（`LineChart` 接实时流）。`useQuote` 喂 `Stat` 已经够用。
- 删画布连带删 JSON：当前没有删画布的接口，等有了再一起做。

## 落地顺序

1. 数据文件 + `save_canvas_data` + `snapshot_candles` + 静态检查 + `read_canvas` 清单。单测和文件系统就能验。
2. `CandleChart` 的 `source` / `tf` prop + 编译注入。用 `snapshot_candles` 出一份静态画布端到端。
3. 钩子 + `CanvasFrame` 代订 + 顶栏圆点。live 端到端。
4. skill 与 `.d.ts`。

## 验证

1. 静态检查单测：放行 `./a.json`、拒 `../a.json` 与 `./a.ts`、文件不存在拒收、live 标的超 6 拒收。
2. 编译单测：带 JSON 导入的画布能编出可执行函数，`data` 注入取得到。
3. 工具单测：`save_canvas_data` 拒坏 JSON、拒不存在的 slug；`snapshot_candles` 写出的文件形状是 `CandleFeed`；`read_canvas` 清单只有元信息。
4. `CandleChart` 单测：`source` + `tf` 取对周期；`source` 为 `null` 渲染等待态；推送更新只 `update` 不 `setData`。
5. 端到端：对话里让 Agent 用 `snapshot_candles` 出一份三周期静态画布；再让它改成 `useCandles`，盘中最后一根在动，断网圆点变灰。
6. 免费版可用：纯免费组合下钩子和快照照常工作。
