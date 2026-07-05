---
name: intraday-signal
description: >
  Short-term multi-timeframe (5m/15m/1h) technical read for a single symbol —
  pulls K-line across three timeframes, reads MACD + swing structure, writes a
  direction call (long/short/neutral) with an explicit anchor price, 3-scenario
  forward read, a range-bound playbook (long tactic + short tactic), an
  entry/stop/target plan with direction-aware R/R, and MACD-divergence signal
  annotations (candle patterns like Pin Bar are auto-detected server-side) —
  then renders it via the `chart` skill (type `intraday`,
  POST preview → PATCH prediction) and logs a journal entry. US-only, single-symbol, short horizon (intraday to
  a few sessions) — a companion to `market-session-tracker`, not a replacement.
  Triggers: 短线预测、日内多周期、做多做空、5分钟15分钟1小时、MACD 背离、
  Pin Bar、入场点、盈亏比、short-term call, intraday prediction, entry point,
  risk reward ratio, multi-timeframe MACD.
---

# intraday-signal

Single-symbol, short-horizon technical read across 5 分钟 / 15 分钟 / 1 小时—
produces an explicit long/short call anchored to a price, a probability-weighted
forward read, and a concrete entry/stop/target plan, backed by named K-line
signals (MACD divergence plus server-side auto-detected candle patterns such as
Pin Bar). Ends by rendering an interactive dashboard and writing a journal entry.

> **Scope**: one symbol per run. For a cross-section "where is money moving"
> question use `capital-rotation`; for live tracking of a watchlist across a
> session use `market-session-tracker`; this skill is the deep single-symbol
> drill-down when the user wants a concrete short-term trade read.

## When to use

- "MU 短线怎么走", "这里能不能做多/做空", "给我一个短线入场点"
- "5分钟15分钟1小时怎么看", "MACD 有没有背离", "这是不是 Pin Bar"
- "盈亏比多少", "入场点在哪", "止损止盈怎么设"
- **Not** for a broad market/sector scan (`capital-rotation`)
- **Not** for live multi-symbol session monitoring (`market-session-tracker`)
- **Not** for weeks/months-horizon swing entries (`sepa-strategy`)

## Workflow

### Step 1 — Resolve the symbol

If ambiguous (e.g. a company name with multiple listings), ask back rather than guessing.

### Step 2 — Tiered grounding context

The chart server pulls the three timeframes of K-line itself (5m/15m/1h × 150
bars) — no manual `longbridge kline` calls needed. Multi-source grounding is
tiered so runs stay fast — pull the "always" tier every run, judge the rest by
the day's tape:

- **Always, check first**: `twitter-reader` — X is the fastest tape on breaking
  news and sentiment; on an intraday horizon its lead time over aggregated feeds
  is exactly the window that matters. Search the symbol, read the last few hours.
- **Always**: `longbridge-news` on the symbol — official/aggregated headlines.
  It lags X by minutes to hours, so treat it as confirmation and source-anchoring
  for what X surfaced, not as the breaking-news feed; its item timestamps are
  publish times, not event times. The chart server also auto-attaches raw
  headlines to the sidebar's `news` list, but that's unclassified — the AI must
  still read and tag them for `context`.
- **On-demand** (judge by the day's tape, don't run every time): `trump-truth-monitor`
  (policy-sensitive days), `sec-edgar` (filing/insider leads), `gdelt` / `fred`
  (macro event days).
- Whatever was actually pulled goes into `context.sources_used` (Step 4).
- Housekeeping, pulled as needed regardless of tiering: `longbridge capital
  <SYM>.US --format json` (triple-bucket flow, checks for distribution), the
  user's live position via `longbridge positions --format json` if they hold
  this symbol.

### Step 3 — Preview: read the technicals

Check the chart server is up (`curl -s http://localhost:5199/api/health`; if
down: `cd app && pnpm start` in the background), then POST a preview (no
`prediction`):

```bash
curl -s -X POST http://localhost:5199/api/charts \
  -H 'Content-Type: application/json' \
  -d '{"type":"intraday","symbol":"<SYM>.US","name":"...","position":{"shares":1,"cost":100.00}}'
```

The response's `data.technicals` gives, per timeframe: the latest DIF/DEA/HIST,
the last ~6 swing highs/lows, the most recent 金叉/死叉 (`last_cross`), any
auto-detected `divergence_candidates` / `beichi_candidates`, and `pattern_123` —
auto-detected 123 reversal structures (①extreme → ②reaction pivot → ③higher-low /
lower-high), each with `status` (`forming` = trigger not yet broken, `confirmed` =
close broke the ② trigger), `trigger`, and `invalidation` prices. A `forming`
pattern_123 is a ready-made entry setup: entry at the ② trigger break, stop
beyond ① (all confirmed pivots only — the chart itself also draws these
automatically, in both preview and final render).
Read these numbers — don't guess MACD direction from eyeballing candles. Note the
auto-detector can't confirm a pivot on the last 1-2 bars (needs bars on both sides);
for very recent action, read `last_dif`/`last_dea`/`last_hist` directly and reason
about it yourself (e.g. a sharp reversal-and-close-on-the-low bar is a real signal
even before any swing/divergence algorithm can confirm it — see the MU 2026-07-01
session for an example: the auto-divergence check didn't catch the final-hour
blow-off because the session's last bar can't be a confirmed pivot yet).

### Step 4 — Write the technical read

**First, classify the day from Step 2's pull (消息面权重定级):**

- **催化日** — a live symbol-moving item exists today: earnings/guidance, policy
  or tariff news touching the name, a major industry headline, or any story that
  already visibly moved the price. News leads, technicals follow: technical
  levels are demoted to "where does it land after the shock" rather than
  direction; every scenario's probability must state how the news shifted it;
  if the news points against the technical read, cap the technical-side scenario
  at ≤40% or call `neutral`.
- **平静日** — no such item. Technicals lead; news is confirmation only and must
  not override a clean structure read.

State which regime was applied in `conclusion.summary`. Then, using the
timeframe data + Step 3's numbers, decide:

1. **Direction + anchor** — `long` / `short` / `neutral`, anchored to a specific
   timeframe + time + price (never a bare directional call with no anchor).
   **Timeframe roles（周期分工）**: h1 定趋势方向, m15 定结构与入场, m5 只做触发
   与微调。**The anchor lives on m15 by default** — `anchor.timeframe` also sets
   the dashboard's default tab. Anchor on m5 only for a pure scalp call, on h1
   only for a swing-level statement. Align `anchor.time` to a bar boundary of its
   timeframe (m15 → :00/:15/:30/:45).
2. **Scenarios** — at least 2, probabilities summing to ~100%, each with a `path`
   (what the K-line likely does) and a `trigger` (what confirms it). Reuse the
   3-scenario discipline from `market-session-tracker` (Bull/Base/Bear-style).
3. **Range-bound playbook** — if one scenario is "震荡/oscillating", fill
   `range_bound_plan` with an explicit tactic for **both** directions (`long_tactic`
   and `short_tactic`) — never describe only one side of a two-sided range.
4. **Entry plan** — `entry`, `stop`, `target1_pct`, `target2_pct`. R/R is
   direction-aware: for `long`, `risk = entry-stop`, `reward = target2-entry`;
   for `short`, `risk = stop-entry`, `reward = entry-target2`. **State the R/R
   explicitly; if < 2:1, say so — do not silently proceed with a poor ratio.**
5. **Signals** — MACD divergence / other custom notes, each anchored to a
   specific `timeframe` + `time` + `price` (divergence needs the two comparison
   points, each ideally carrying `macd_value` so the dashboard can draw the
   connecting line on the MACD sub-pane too). Never write "看起来背离了" without
   pointing at the two actual bars being compared. **Never emit a `pin_bar` (or
   any candle-shape) signal type** — candle patterns (pin bar / hammer /
   engulfing / stars …) are auto-detected server-side and drawn as 🕯️ markers;
   hand-labeling duplicates the detector and has mislabeled shapes before. If a
   candle pattern matters to the thesis, cite the auto-detected marker in the
   report, or anchor an `other`-type note to that bar.
6. **`context`** — besides `prediction`, write the `context` payload (see
   `chart` skill's `context` schema): tag every news/sentiment item pulled in
   Step 2 with `source` + `tag` + a one-line `note`, list what was actually
   pulled in `sources_used`, and write the `conclusion` card (`stance` /
   `summary` / `action`). `generated_at` = now, ISO timestamp.

### Step 5 — Final render

PATCH the same chart with BOTH `prediction` and `context` filled in, in one
call (see `chart` skill's `prediction` / `context` schemas for the full shapes):

```bash
curl -s -X PATCH http://localhost:5199/api/charts/<id-from-step-3> \
  -H 'Content-Type: application/json' \
  -d '{
    "prediction": { "direction": "short", "anchor": {"timeframe":"m15","time":"2026-07-06T14:15:00Z","price":61.10}, "scenarios": [ ... ] },
    "context": {
      "generated_at": "2026-07-06T14:30:00Z",
      "conclusion": { "stance": "short", "summary": "一句话综合判断", "action": "现在该做什么" },
      "news": [ { "time": "2026-07-06T13:10:00Z", "source": "longbridge", "tag": "catalyst", "title": "...", "note": "AI 一句话解读" } ],
      "sources_used": ["longbridge-news", "twitter-reader"]
    }
  }'
```

Include `position` in the Step-3 POST (from the optional `longbridge positions`
pull) if the user holds this symbol — the dashboard renders a 持仓视角 card.

### Step 6 — Report structure

Present in this order (mirrors the user's original ask):

1. 方向判断 + 锚点（在哪个位置做的判断）
2. 情景推演（后续 K 线可能的多种走势，带百分比）
3. 震荡应对（若为震荡情景：多、空两种打法）
4. 入场计划（盈亏比 + 具体入场点/止损/目标）
5. 支撑信号（MACD 背离 + 服务端自动检测的 K 线形态如 Pin Bar，指到具体 K 线）
6. 图表链接：主链接是标的驾驶舱 `http://localhost:5199/#/symbol/<SYM>`（聚合活数据 +
   最新分析），存档链接 `data.url`（本次分析的冻结快照）附后
7. 免责声明：仅供参考，不构成投资建议

### Step 7 — Journal

Write `journal/YYYY-MM-DD-<symbol>-intraday.md` (US session date). Same-day
re-run on the same symbol appends a new timestamped section — never overwrite.
The cockpit's 历史 tab (`GET /api/symbols/:sym/analyses`, rendered on
`/#/symbol/<SYM>`) now lists past analyses for this symbol with a mechanical
outcome judgment (`hit_target` / `hit_stop` / `open`, computed server-side from
post-anchor bars) — that's a quick mechanical scoreboard, not a substitute for
the journal's narrative record.

## Anti-patterns

- ❌ A directional call with no anchor price/time
- ❌ Scenarios that don't sum to ~100%, or only one scenario
- ❌ A range-bound call that only covers one direction (must give both long and short tactics)
- ❌ Omitting or silently glossing over an R/R below 2:1
- ❌ "看起来有背离" without naming the two specific bars being compared
- ❌ Hand-labeling a `pin_bar` / candle-shape signal — the server auto-detects candle patterns; AI signals are macd_divergence and `other` notes only
- ❌ Skipping the preview call and guessing MACD values instead of reading them
- ❌ Skipping the journal write
- ❌ Contradicting a live `market-session-tracker` read for the same symbol without reconciling — this is a narrower, single-symbol lens, not an override
- ❌ Writing a `context.news` item without a `source`
- ❌ Skipping the 催化日/平静日 classification, or trading pure technical levels on a 催化日 without stating how the news shifted each scenario's probability
- ❌ Calling a day 平静 from `longbridge-news` alone without having checked X — longbridge lags; "no headline yet" there doesn't mean no news
- ❌ A `conclusion.action` that contradicts the prediction's direction without explaining why
- ❌ Pulling every on-demand source (`trump-truth-monitor` / `sec-edgar` / `gdelt` / `fred`) on every run — tiering exists to keep runs fast; judge by the day's tape

## Related skills

- `chart` — renders type `intraday`; this skill is chart's primary caller for that type
- `longbridge-kline` — same data the chart server pulls; call directly only for in-chat analysis
- `longbridge-capital-flow` — optional grounding context (distribution check)
- `twitter-reader` — always-tier, checked first (fastest tape on breaking news/sentiment)
- `longbridge-news` — always-tier grounding context (lagging official headlines; confirmation + source anchor)
- `trump-truth-monitor` — on-demand grounding context (policy-sensitive days)
- `sec-edgar` — on-demand grounding context (filing/insider leads)
- `gdelt` / `fred` — on-demand grounding context (macro event days)
- `market-session-tracker` — broader live multi-symbol session monitoring; this skill is the single-symbol short-term drill-down
- `sepa-strategy` — the weeks/months-horizon counterpart for swing entries
