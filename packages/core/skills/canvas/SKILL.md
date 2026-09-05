---
name: canvas
description: >-
  A canvas is a live React panel the user opens beside the chat, saved as
  journal/canvases/<slug>.canvas.tsx. You MUST use a canvas whenever you produce a
  standalone analytical artifact — multi-symbol comparisons, capital-flow or price reads
  across several names, event before/after studies, scenario-and-plan write-ups, session
  or weekly post-mortems, multi-period chart layouts, coverage-and-gap reports, or any
  answer that is carried by numbers laid out visually. If you catch yourself about to
  write a markdown table of market data, stop and build a canvas instead. You MUST also
  read this skill once per conversation before creating, editing, or debugging any
  .canvas.tsx file — save_canvas and apply_patch refuse until you have. Do not use a canvas for a
  single quote or one-line answer, or for the four fixed chart types (flow / cohort /
  sepa / intraday), which belong to the `chart` skill. Triggers: 画布、自定义面板、
  拼一张图、并排对比、自定义图表、多标的对照, canvas, save_canvas, custom panel,
  side-by-side comparison.
---

A canvas is one `.canvas.tsx` file the app compiles so the user can open it beside the chat.

> Rule text is English so it survives every runtime. **Canvas content is output — it follows
> TD-LANG-01: 中文白话.**

## Workflow

### 1. Decide whether to use a canvas

The trigger is whether the numbers **are** the deliverable. If they are a step toward
something else, skip the canvas.

**Use one when:** several symbols are compared across the same metrics; a read spans
multiple periods or charts; an event is studied before and after; a directional call comes
with scenarios or an entry/stop/target plan; a session or week is reviewed; any structured
table longer than a handful of rows.

**Do NOT when:** the answer is one quote or one sentence; the user wants one of the four
fixed chart types (`chart` skill); the user wants a journal entry or stock note (markdown
under `journal/` and `stocks/`); the data was an intermediate step; you do not have the
numbers yet.

### 2. Fetch first, then embed

`fetch_kline` / `read_data_pack` / bash `longbridge` / research files. Write the numbers into
the TSX, or offload them to a data file (see "Where data comes from" below). A canvas itself
still cannot `fetch` — no sandboxed network access — but it can pull live quotes and K-line
through the two hooks in that section.

Indicators are computed server-side and passed in; `CandleChart` draws, it does not compute
(`ema` needs `{ label, points }`, not periods). Attribute every number's vintage in the
caption (TD-DATA-02). What you could not fetch goes in `Coverage`, never into a guess
(TD-DATA-01).

### 3. Write the canvas

- One file, saved via `save_canvas({ slug, title, source })`. Slug is kebab-case. A canvas may
  have sibling data files (see below); it has no other helper `.tsx`/`.ts` files.
- Exactly one `export default`, the top-level component.
- Import from `@kansoku/canvas`, or a same-directory JSON data file (`./<name>.json`). No
  other relative paths, no `react`, no `node:`, no npm.
- Banned in source: `fetch(`, `XMLHttpRequest`, `import(`, `require(`, `setTimeout` /
  `setInterval`, `document.`, `window.`. 64 KB limit.
- Revising: if the current source is not already in this conversation (you wrote or read it
  earlier and nothing else changed it), use bash `cat -- journal/canvases/<slug>.canvas.tsx`
  first; otherwise patch directly. Do not re-read after a successful `apply_patch` — its
  result already confirms the write. Send one `apply_patch` call carrying every hunk (`*** Begin Patch` / `*** Update File: <path>` /
  `@@ context` / ` `, `-`, `+` lines / `*** End Patch`). Keep the same path. Use `save_canvas`
  only when creating a canvas or replacing the whole source. One question, one slug.
- Free builds may keep at most 3 canvases. Overwriting an existing slug is always allowed;
  a fourth new slug is rejected until the user upgrades to Pro.

### 4. Where data comes from

- **Small data** (a handful of numbers, a short series): inline it in the TSX as before.
- **K-line, always through a tool — never hand-typed `bars`.** Use `snapshot_candles({ slug,
  name, symbol })` for a post-hoc read: the server builds a three-timeframe `CandleFeed` and
  writes `journal/canvases/<slug>.<name>.json`; `import snap from './<name>.json'` and pass it
  to `CandleChart` as `source={snap} tf="m5"`. Use `useCandles(symbol)` instead only when the
  user explicitly wants to watch the market live — it returns a live-updating `CandleFeed`.
  Either way `CandleChart` never takes hand-typed `bars` for real market data.
- **Any other data too big or awkward to inline**: `save_canvas_data({ slug, name, json })`
  writes `journal/canvases/<slug>.<name>.json`, then `import x from './<name>.json'` in the
  source. Both data tools require the canvas (the `slug`) to already exist — `save_canvas`
  first if it does not.
- **Live quotes**: `useQuote(symbol)` returns a live-updating `QuoteCell | null`, e.g. for
  `Stat`. Its fields are `last`、`pct`、`regularLast`、`regularPct`、`session`、`turnover?`、
  `asOf?`；`QuoteCell` / `CandleFeed` / `CandleFeedTf` / `TimeframeKey` 的完整定义在
  `$KANSOKU_APP_SKILLS_DIR/canvas/sdk/shared.d.ts`。
- **Caption discipline**: a canvas driven by `useQuote` / `useCandles` writes `Source` as
  「实时」; one driven by a snapshot file writes the data's cutoff time, taken from
  `CandleFeed.asOf`.
- **The only permitted empty state** is `<CandleChart source={null} .../>` rendering its
  built-in「等待行情…」placeholder while a live feed has not delivered a first frame. Every
  other empty state is still forbidden (see below).
- **Live subscription budget**: at most 6 combined `useQuote` / `useCandles` calls per canvas.

**Never render empty states.** No data means omit the element — no placeholder text, no
「暂无数据」, no zeroed rows, no empty chart frame. `Coverage` is the sole exception; naming
gaps is its job. If the whole canvas would be empty, say what is missing instead.

**Label every plot.** Charts get screenshotted alone. Each needs a `title` naming the
specific measure (`08-28 相对各自开盘价（都从 0 起）`, not `走势图`), `yUnit` only when the
axis carries a real dimension (`%` / `USD` / `亿`) — a category axis of tickers takes no
`xUnit` — series names when multi-series, and any transformation stated (归一化 / 累计 /
相对开盘). A missing title renders as `Untitled` — never ship that. A `Section` holding one
chart gets no title of its own: the chart title is the heading.

**Components.** The table below is the complete allow-list; referencing an export that does
not exist — or inventing a prop — is the most common failure, and an unknown prop is
silently dropped rather than erroring. Exact prop shapes are declared next to this file in
`$KANSOKU_APP_SKILLS_DIR/canvas/sdk/`. **Use bash `cat` to read them instead of guessing**, starting with
`core.d.ts` — it holds everything the mandatory parts of the skeleton use (layout, text,
`Stat`, `Table`, `Compare`, `Coverage`, `Source`). Read the rest only when you reach for
them: `charts.d.ts`, `CandleChart.d.ts`, `analysis.d.ts` (`Scenarios` / `RRPlan` /
`Timeline`), `control.d.ts`, `theme.d.ts`, `live.d.ts` (`useQuote` / `useCandles`), `shared.d.ts`
(`QuoteCell` / `CandleFeed` 等行情数据结构).

| Group | Components |
| --- | --- |
| Layout | `Canvas` (root), `Section`, `Grid`, `Row`, `Stack`, `Card`, `Divider` |
| Text | `H1` `H2` `H3`, `Heading`, `Text`, `Link`, `Callout`, `Pill`, `Badge`, `Source` |
| Numbers | `Stat`, `Metric`, `Table`, `Compare`, `Coverage` |
| Conclusions | `Scenarios`, `RRPlan`, `Timeline` |
| Controls | `Toggle`, `Select`, `Param` |
| Charts | `LineChart`, `BarChart` (`signed`), `AreaChart`, `PieChart`, `Sparkline`, `CandleChart` (`bars` or `source`+`tf`) |
| Live | `useQuote(symbol)`, `useCandles(symbol)` — hooks, not components; feed `Stat` / `CandleChart source` |

Four of them validate themselves against the discipline rules: `Scenarios` flags
probabilities that miss 100 (TD-SCENARIO-01), `RRPlan` reddens reward-to-risk under 1.5
(TD-RR-01), `Coverage` carries TD-DATA-01, `Source` carries TD-DATA-02.

Interactivity is `useState` / `useMemo` plus `Toggle` / `Select` / `Param`. There is no `useEffect`.

`Param` only rewrites numbers already in the canvas. Do not use it to switch symbols, switch timeframes, or trigger a new fetch. Give both `min` and `max` or neither — one side alone is rejected at save. Native `<input>` / `<textarea>` are rejected; use `Param` / `Toggle` / `Select`.

## Design guidance

Flat, dense, square. No gradients, no emojis, no shadows, no corner radius beyond 2px. A
canvas that looks like a generic dashboard is a failed canvas.

### Structure — five parts, fixed order

Skip a part with no content. **Never reorder. Never push the conclusion to the bottom.**

| Part | Components | Rule |
| --- | --- | --- |
| 1 Conclusion | `Callout` | One paragraph answering the question asked. Answer first. |
| 2 Key numbers | `Grid` + `Stat` | ≤ 4. The ones part 1 depends on. |
| 3 Evidence | `Compare` / `Table` / charts | Everything traces back to part 1. |
| 4 Forward view | `Scenarios` / `RRPlan` | Only with a real directional call. |
| 5 Boundaries | `Coverage` + `Source` | What is missing, and when the data is from. |

Parts 1 and 5 are mandatory. All data and no conclusion is not acceptable.

### Hierarchy and color

The conclusion and the number driving it get space; detail stays compact. Squint test: blur
your eyes — can you tell what this canvas concluded?

`tone` encodes **price direction only** (`up` / `down` / `neutral`), never good-versus-bad —
「亏损收窄」is good news with a down direction, and `up` makes it read backwards.
Directionless numbers (成交额, 市值, 天数) take no `tone`. `Callout tone="warn"` means "hold
off", at most one per canvas.

### Hard limits

`Grid columns` ≤ 4 · `Stat` ≤ 4 per screen · charts ≤ 6 per canvas · `Text` paragraph ≤ 3
lines · no `Section` for fewer than 2 elements.

### Say X → use Y

**Nothing on the left may be hand-rolled with `Table`.**

| To show | Use | Not |
| --- | --- | --- |
| Symbols across the same metrics | `Compare` | `Table` / a row of `Pill` |
| Cases with probabilities and triggers | `Scenarios` | `Table` / several `Callout` |
| Entry / stop / target and reward-to-risk | `RRPlan` | `Table` / three `Stat` |
| Events in time order | `Timeline` | `Table` / a run of `Text` |
| Which data exists and which does not | `Coverage` | `Table` |
| A tiny inline trend | `Sparkline` | `LineChart` |
| One number with its change | `Stat` (`delta` = the number only; words like「30 天最强」go in `note`) | a number inside `Text` |
| A number the user should change so other numbers update | `Param` | a native input, a slider plus a separate field, `Text` |
| Genuine multi-row detail | `Table` | — |

### Slop patterns — forbidden

**Two or more of these means redesign.**

- **All data, no conclusion** — the most common failure.
- **Hand-rolled tables** — anything from the mapping table rebuilt as `Table`.
- **Intent attribution** — 「主力在出货」「有人故意砸盘」. Unfalsifiable (TD-INTENT-01);
  cite price, volume, structure.
- **Narrating noise** — giving a ±2% day a cause (TD-NOISE-01).
- **Unlabeled numbers** — no unit, no time basis.
- **Emojis** as icons, status markers, or bullets.
- **Rainbow coloring** — most elements are neutral; color is scarce and means something.
- **Wall of identical cards** — mix open sections with cards.
- **Giant text** — nothing above `H1`, never `H1` stacked on `H1`.

### Self-check before saving

1. Conclusion visible on the first screen?
2. Every number carries a unit and a time basis?
3. Nothing from the mapping table hand-rolled with `Table`?
4. `Coverage` or `Source` states the data boundary?
5. Slop list scanned?
6. Squint test: does one thing stand out?

## Skeleton

The five-part shape as a real, typechecked file:
`apps/web/src/features/canvas/demo/skeleton.canvas.tsx`. Read it and adapt it — do not
invent another structure. Every component at once:
`apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx`, viewable at `/canvases/demo`.

## Handing it over

Tell the user the slug so they can open it beside the chat. First canvas of the
conversation: one sentence on what a canvas is. Canvas they did not ask for: one sentence on
why it beat plain text. Later ones: just the slug.

## Troubleshooting

`rejected:` lists one line per reason — fix those, do not work around them. `save_canvas`
refuses outright until this skill has been read once in this conversation.

Compile and runtime errors are written into `journal/canvases/.meta.json`; inspect that file
with bash `cat -- journal/canvases/.meta.json` when the diagnostic record is needed.

A blank canvas almost always referenced an export that does not exist. A prop that has no
effect was invented — use bash `cat` to check it against the declarations in
`$KANSOKU_APP_SKILLS_DIR/canvas/sdk/`.

`missing data file: <slug>.<name>.json` means the source imports a data file that has not
been written yet — call `save_canvas_data` or `snapshot_candles` with that `name` first, then
`save_canvas` / `apply_patch`.
