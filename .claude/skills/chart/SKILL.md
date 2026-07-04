---
name: chart
description: >
  Render financial charts via the local chart web app (`app/` — Hono server +
  React front end, port 5199). Four chart types: intraday capital-flow line
  (`flow`) and cross-symbol signed-bar comparison (`cohort`) — both Recharts —
  plus SEPA strategy dashboard (`sepa`) and short-term multi-timeframe
  prediction dashboard (`intraday`) — both TradingView Lightweight Charts.
  Multi-timeframe K-line review lives inside `intraday` (the standalone kline
  chart type was removed). The server fetches Longbridge data itself
  (kline / capital flow) and computes all indicators (MA, MACD, RS, trend
  template, volume profile, divergence/beichi detection) in TypeScript; the
  caller only POSTs `{type, symbol, ...}` to `/api/charts` and gets back
  `{id, url, technicals?}`. Charts persist as data JSON under
  `journal/charts/data/` and render live at `http://localhost:5199/#/charts/<id>`.
  Triggers: 出图、生成图表、画 K 线、画资金流曲线、画对比图、SEPA 仪表盘、
  短线预测、多周期K线、MACD、入场判断可视化、可视化、render chart, plot,
  visualise, sepa dashboard, intraday prediction dashboard.
---

# chart

Creates charts through the local chart app so the user can browse them in one
place instead of squinting at tables. The server pulls market data and computes
everything; charts are stored as versioned data JSON and always rendered by the
latest front-end code.

> **Response language**: match the user — 简体 / 繁體 / English.

## When to call

- After running `longbridge capital --flow` context or when the user wants a flow visual ⇒ `flow`
- For K-line review (multi-timeframe candles + MACD + auto signals) ⇒ `intraday`
- After collecting cumulative net inflow across a cohort of symbols ⇒ `cohort`
- After running `sepa-strategy` on a single name ⇒ `sepa`
- When inside `intraday-signal` ⇒ `intraday` (two-call pattern: POST preview → PATCH prediction)
- When inside `capital-rotation` / `market-session-tracker` / `stock-deep-dive`,
  call this as the LAST step and append the chart URL to the markdown journal entry.

Skip when the user only wants a single number or a tiny series — a Unicode
sparkline in the chat reply is faster.

## Server lifecycle

The app must be running before any API call:

```bash
curl -s http://localhost:5199/api/health          # {"ok":true,...} = up
```

If it is down, start it (long-running process — use run_in_background):

```bash
cd app && pnpm start                               # serves API + built web UI on :5199
```

First-time setup only: `cd app && pnpm install && pnpm build`.

## API

Base URL `http://localhost:5199`. All responses follow the
`{ok, data, meta}` / `{ok:false, error, hint}` contract.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness check |
| `GET /api/charts?type=&symbol=&limit=` | list chart metas (newest first) |
| `POST /api/charts` | create a chart; body below |
| `GET /api/charts/:id` | full chart doc |
| `GET /api/charts/:id/built?count=` | ephemeral intraday rebuild with a larger bar window (history view; max 1000, never persisted) |
| `PATCH /api/charts/:id` | merge fields into input and rebuild (e.g. add `prediction`) |
| `DELETE /api/charts/:id` | remove a chart |
| `GET /api/legacy` | list old single-file HTML archives (served at `/legacy/<file>`) |
| `GET /api/stream/quotes?extra=` | SSE quote snapshots (watchlist ∪ positions ∪ extra), 10s cadence |
| `GET /api/stream/charts/:id` | SSE live rebuilds for flow/intraday charts, 60s cadence |
| `GET /api/symbols/:sym/{flow,benchmark,position,analyses,latest}` | live per-symbol cockpit data (server-computed, never AI) |

The stream endpoints power the web UI's realtime display; the AI workflow never
needs them — created charts update themselves in the browser while open, and
the persisted JSON stays frozen at analysis time.

### Symbol cockpit (`/#/symbol/<SYM>`)

Every symbol also gets a stable dashboard URL, `http://localhost:5199/#/symbol/<SYM>`,
that aggregates live data with the symbol's latest `intraday` analysis — it is
the caller-facing counterpart of `GET /api/symbols/:sym/*`. `/#/charts/<id>`
remains the frozen per-analysis archive; the cockpit page is a live view on top
of the same underlying chart docs, not a replacement. These `/api/symbols/*`
routes are server plumbing for that page — direct callers rarely need them,
listed here only for completeness:

- `GET /api/symbols/:sym/flow` — today's capital-flow curve + large/medium/small distribution (live, via `longbridge capital`)
- `GET /api/symbols/:sym/benchmark` — SMH/QQQ normalized same-session comparison (live, via `longbridge kline`)
- `GET /api/symbols/:sym/position` — shares/cost/unrealized + distance to stop/target from the latest analysis's entry plan (live)
- `GET /api/symbols/:sym/analyses` — past `intraday` analyses for this symbol with mechanical outcome judgments (`hit_target` / `hit_stop` / `open`, computed server-side from post-anchor bars — never AI recall)
- `GET /api/symbols/:sym/latest` — the latest `intraday` chart doc in full, plus `prediction_stale`

The client-side indicator toggle bar (show/hide 金叉死叉、自动背离、自动背驰、123
结构、K线形态、AI 标注、价位线、EMA 均线; state in localStorage) has no API surface —
it's a pure front-end feature on both the cockpit and archive pages. Swing 高低点
are not one of the toggles — they're baked into the divergence/beichi/pattern123
detectors as the underlying pivot data, not a standalone overlay (deliberate
deviation from the earlier spec draft).

### POST body per type

The server fetches Longbridge data itself when `symbol` is given; pass `data`
(or `kline` / `timeframes`) only to override with hand-assembled rows.

```jsonc
// flow — server runs `longbridge capital <SYM> --flow`
{ "type": "flow", "symbol": "MU.US", "subtitle": "单位推断为千 USD · 仅供参考" }

// cohort — data is always caller-assembled
{ "type": "cohort", "title": "存储 vs Mag 7 主力净流",
  "data": [{ "symbol": "MU", "value": -17087 }, { "symbol": "NVDA", "value": 9540 }] }

// sepa — server pulls 260 day bars + SPY.US automatically
{ "type": "sepa", "symbol": "MRVL.US", "name": "Marvell Technology",
  "position": { "shares": 1, "cost": 100.00 },       // optional
  "context": { /* see sepa context schema below */ } }

// intraday — server pulls 5m/15m/1h × 150 bars automatically (--session all:
// pre/post-market bars included by default; pass "session": "intraday" to exclude)
{ "type": "intraday", "symbol": "MU.US", "name": "Micron Technology",
  "ema_periods": [9, 21, 55],                        // optional, fast/mid/slow EMA overlay (default 9/21/55, max 4)
  "position": { "shares": 1, "cost": 100.00 },       // optional
  "prediction": null }                                // omit for preview mode
```

Success returns `data.id`, `data.url` (paste this into journal entries), plus
type-specific meta: sepa → `verdict_tier / passes / fails / bars`; intraday →
`mode / bars / technicals`.

### sepa `context` schema

All fields optional:

```jsonc
{
  "earnings_dates": ["2026-05-29"],       // E markers on those bars
  "stage": "Stage 2 末期",                 // 阶段判断 sidebar card
  "stage_note": "Stage 3 顶部嫌疑",
  "base_count": "3-4 (减半仓)",
  "pattern": "无可买（扩张振幅）",
  "verdict": {                             // override the auto verdict
    "tier": "watch",                       // pass / watch / buy
    "label": "👀 WATCH LIST",
    "color": "#ffc107",
    "reason": "..."
  },
  "entry_plan": {                          // 入场计划 card + price lines
    "pivot": 260.00,                       // required: consolidation-range high
    "stop": 241.80,                        // default pivot × 0.93 (-7%)
    "target1_pct": 8,                      // default 8 (Phase 2: 卖一半 + 移至本钱)
    "target2_pct": 15,                     // default 15 (Phase 3: 再卖 25% + 沿 20MA 跟踪)
    "note": "...",
    "hypothetical": true                   // 标注 "假设性" 徽章
  },
  "support_zones": [                       // omit → auto zones (MA50 / MA200 / volume cluster)
    { "low": 217, "high": 226, "tier": "watch",   // warning / watch / buy / value
      "label": "MA50 关注区", "note": "...", "sources": ["MA50 $221.75"] }
  ],
  "auto_support_zones": true,              // false disables the auto fallback
  "volume_profile": { "lookback_days": 120, "bins": 30 }
}
```

Derived values (auto-computed server-side): `buy_zone_high = pivot × 1.05`,
`target1/2 = pivot × (1 + pct/100)`, `R/R = (target2 − pivot) / (pivot − stop)`
— based on T2, not T1, because T1 is the SEPA Phase-2 partial exit. R/R < 2:1
renders a red warning.

**Verdict auto-detection** (when `context.verdict` omitted): any trend-template
fail → `PASS` 🚫; all 8 pass + price ≥ 25% above MA50 → `WATCH · Extended` 👀;
all 8 pass otherwise → `WATCH · No pattern detected` 👀. `STRONG BUY` ✅ is never
auto-emitted — pass `context.verdict` after manually confirming a valid pattern
+ pivot ±5% buy zone.

**Auto markers on the main K-line**: earnings (`context.earnings_dates`),
climax top (volume ≥ 2.5×20MA + red close + local high), MA50/MA200 breakdowns,
52w high. Hardcoded lines: 52w high/low, MA50 × 1.25 extended warning.

### intraday two-call pattern

1. **POST without `prediction`** → preview. Read `data.technicals` from the
   response: per timeframe `last_dif / last_dea / last_hist`, `emas` (latest
   fast/mid/slow EMA values — price vs EMA stack tells the short-term trend
   posture), recent swing highs/lows, `last_cross` (金叉/死叉),
   `divergence_candidates`, `beichi_candidates`. Read these numbers — don't
   eyeball candles.
2. **PATCH `/api/charts/:id` with `{"prediction": {...}}`** → final dashboard.
   Add `"refresh": true` to any PATCH to refetch the latest bars (incl. pre/post
   market) and recompute everything before rebuilding — same id, same URL.

`prediction` schema:

```jsonc
{
  "direction": "short",                              // long | short | neutral
  "anchor": { "timeframe": "m15", "time": "2026-07-01T17:00:00Z", "price": 1049.81 },
  "scenarios": [                                      // ≥ 2, probabilities ≈ 100
    { "label": "继续探底", "probability": 45, "path": "...", "trigger": "..." }
  ],
  "range_bound_plan": { "condition": "...", "long_tactic": "...", "short_tactic": "..." },
  "entry_plan": { "entry": 1049.81, "stop": 1030.00, "target1_pct": 3, "target2_pct": 6, "note": "..." },
  "price_zones": [                                      // only real resistance/pressure zones drawn on chart
    { "kind": "resistance", "label": "反弹压力带", "low": 60.90, "high": 61.35,
      "note": "短线均线和第一修复位重合", "sources": ["5m EMA9/21", "第一修复位"] }
  ],
  "signals": [
    { "type": "pin_bar", "timeframe": "m15", "time": "...", "price": 1044.17,
      "bias": "bullish", "label": "看涨 Pin Bar" },
    { "type": "macd_divergence", "timeframe": "h1", "bias": "bearish",
      "points": [ { "time": "...", "price": 1097.0, "macd_value": 12.3 },
                  { "time": "...", "price": 1085.0, "macd_value": -4.1 } ],
      "label": "顶背离：价格新高但 MACD 走弱" }
  ]
}
```

R/R is direction-aware (`long`: risk = entry−stop; `short`: risk = stop−entry);
the sidebar flags rr < 2:1 in red. `entry_plan` can carry structured level
context so the chart explains why a point was selected instead of hiding the
reason in prose:

```jsonc
{
  "entry": 61.10,
  "stop": 62.52,
  "target1": 60.00,                 // optional explicit target price; overrides pct-derived price
  "target2": 57.92,
  "rationale": "反弹到 60.90-61.35 压力带后受阻才入场。",
  "stop_note": "站回上一段反弹高点，空头计划失效。",
  "entry_zone": { "kind": "resistance", "label": "反弹压力带", "low": 60.90, "high": 61.35 },
  "target1_label": "T1 · 日内低点",
  "target1_note": "整数位和日内低点，首次触及先看是否止跌。",
  "target1_zone": { "kind": "support", "label": "日内低点", "low": 60.00, "high": 60.00 },
  "target2_label": "T2 · 深一档支撑",
  "target2_condition": "60.00 跌破并反抽失败后才成立。",
  "target2_zone": { "kind": "support", "label": "深一档支撑", "low": 57.90, "high": 58.00 }
}
```

`entry_plan.entry_zone` and `target1_zone` / `target2_zone` are explanation
context for the right panel only; they are not drawn as chart zones and should
not be named `入场区`, `T1 区域`, or `T2 区域`. Put only genuine upper supply
areas in top-level `price_zones` with `kind: "resistance"`; those are rendered
as chart boundaries and in the sidebar's key-zone section.

Supported zone kinds remain `entry`, `stop`, `target`, `support`, `resistance`,
`invalidation`, `watch`, but the intraday chart-zone overlay intentionally
filters to explicit `resistance` zones. MACD structure signals + simplified 背离/背驰
are auto-detected and drawn on every render regardless of `prediction`. Every
DIF/DEA cross is classified by zero-line position（零上/零下金叉、零上/零下死叉）
plus structural patterns: 二次金叉（零下双金叉且低点抬高 → 底部确认）、空中加油
（零上二次金叉 → 强势延续）、二次死叉（顶部确认 / 空头中继）、上穿/下穿零轴
（趋势确认，last 2 bars marked 待确认 with a `?`）. Each marker's tooltip carries
the implication text; `technicals.<tf>.structure_signals` (last 6) and
`zero_tangle`（DIF 贴零轴缠绕 = 震荡市，交叉信号失效）expose the same data to the
analysis workflow — read them in the preview step. The swing-based divergence
auto-detectors only fire on confirmed swing pivots — the last 1-2 bars can never
be flagged; read `last_dif/last_dea/last_hist` directly for the newest bar.

14 classic K-line patterns are also auto-detected on the main pane (arrow
markers, tooltip carries the implication): 单根——锤子线/上吊线/倒锤子/射击之星;
双根——看涨吞没/看跌吞没/乌云盖顶/刺透形态/看涨孕线/看跌孕线; 三根——启明星/
黄昏星/红三兵/三只乌鸦. All require a trend-context filter (4-bar net move into
the pattern) plus a body-size filter vs the trailing 14-bar average, so quiet
chop produces few marks. One pattern max per bar (stars > soldiers/crows >
two-bar > single-bar). `technicals.<tf>.candle_patterns` (last 6) exposes them
to the analysis workflow. Caveat: the newest bar may still be forming intraday —
a pattern on it can repaint until the bar closes.

123 reversal structures (Sperandeo 1-2-3) are also auto-detected per timeframe
from confirmed swing pivots: ① a ~20-bar extreme → ② the reaction pivot → ③ a
higher low (bullish) / lower high (bearish). The price pane gets ①②③ markers, a
①→②→③ connector, and a dashed trigger line at the ② price running from ③ to the
latest bar; a close beyond ② flips the structure to confirmed (`123✓` marker on
the breakout bar), while a break of ① drops the structure silently. The ③ marker
shows `③?` until confirmation. `technicals.<tf>.pattern_123` (last 2, each with
`status: forming|confirmed`, `trigger`, `invalidation`, `p1/p2/p3`) exposes them
to the analysis workflow — a `forming` structure is a ready-made entry setup
(enter on the ② break, stop beyond ①). The sidebar's 自动信号 section lists them
with an 酝酿中/已确认 badge.

Off-session bars (盘前/盘后浅蓝、夜盘深蓝) get a full-height backdrop on both
panes — thin-volume price action outside regular hours is visually discounted at
a glance. Regular hours = 09:30-16:00 ET (DST-aware via America/New_York).

### `context` — AI-classified news + conclusion (optional, schema_version 2)

Both `POST /api/charts` (type `intraday`) and `PATCH /api/charts/:id` accept an
optional `context` field alongside `prediction`. It's frozen at write time like
`prediction` — the server never generates or judges it. `schema_version` is now
`2`; older (`v1`) chart docs without `context` still load and render fine.

```jsonc
"context": {
  "generated_at": "2026-07-06T14:30:00Z",         // ISO timestamp
  "conclusion": {
    "stance": "short",                            // long | short | neutral
    "summary": "一句话综合判断",
    "action": "现在该做什么（挂单/等待/减仓）"
  },
  "news": [
    { "time": "2026-07-06T13:10:00Z",
      "source": "longbridge",                     // longbridge | x | trump | sec | gdelt
      "tag": "catalyst",                          // catalyst | regulatory | sentiment | macro
      "title": "...", "note": "AI 一句话解读", "url": "可选" }
  ],
  "sources_used": ["longbridge-news", "twitter-reader"]
}
```

The dashboard shows `context.generated_at`'s age and a stale badge, sharing the
same ~15-min staleness rule as `prediction` (`prediction_updated_at` /
`prediction_stale` on chart metas cover both).

### Realtime prediction upkeep

Once the US cash session is open, intraday charts must be maintained under
these rules:

- **Cash-session rebuilds drop off-session bars.** Any PATCH after 09:30 ET
  passes `{"session": "intraday", "refresh": true}` — the prediction
  dashboard must not render pre-market / overnight bars intraday. The
  default `--session all` is for pre-market analysis only.
- **Volume calls align to prior sessions' same-time window.** Never compare
  today's running volume against full-day totals. Pull `longbridge kline
  --period 5m` (regular-session bars), sum today's bars, and compare against
  the same number of opening bars averaged over the prior ~5-8 sessions.
  Pair the ratio with per-bar direction before calling a move confirmed — a
  level break on ~0.6x same-period volume is not a confirmed breakout.
  Caveat: Longbridge daily-K volume includes extended hours; 5m-K volume
  does not — never mix the two.
- **Stale predictions get refreshed on a ~15 min loop.** The server marks an
  intraday chart's prediction stale when it is >15 min old during regular
  hours (`GET /api/charts?stale=true` lists them; the SSE envelope and chart
  metas carry `prediction_updated_at` / `prediction_stale`). Each loop
  round: fetch the stale list → re-pull quote / capital flow / klines →
  PATCH `prediction` with scenarios revised only on material change, but
  **always move `anchor` to the newest m5 bar time + latest price** — the
  anchor marker must track the live tape, never sit minutes behind it →
  append a timestamped journal note on material revisions (revision
  discipline) → stop the loop after 16:00 ET close.

## Storage

- Chart docs: `journal/charts/data/<YYYY-MM-DD>-<slug>.json` — gitignored,
  `schema_version` field for forward compatibility. Date = US session date
  (derived from the data, not local clock).
- Old single-file HTML archives stay in `journal/charts/*.html`, listed in the
  app under 旧版存档 and served at `/legacy/<file>`.
- The app itself: `app/` (pnpm workspace, `server/` Hono + TS, `web/` Vite +
  React). Analysis parity with the retired Python implementation is locked by
  vitest golden tests: `cd app && pnpm test`.

## Sparkline alternative (no API)

For tiny in-chat previews render Unicode sparklines directly: `▁▂▄▆█` plus ANSI
green/red. Use for 5-20-point series where a full chart is overkill.

## Related skills

- `longbridge-capital-flow` / `longbridge-kline` — same data the server pulls; call directly only for in-chat analysis
- `capital-rotation` — should end with a `cohort` chart
- `market-session-tracker` — may create `flow` charts
- `sepa-strategy` — calls `sepa` as the last step of its Step 10
- `intraday-signal` — calls `intraday` twice (POST preview, then PATCH prediction)
