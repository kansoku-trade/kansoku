# SB (Second Breakout) Structure Annotation — Design

Date: 2026-07-20
Status: approved

## Goal

Auto-detect and annotate SB (Second Breakout, Al Brooks High 2 / Low 2) structures on the
`intraday` multi-timeframe dashboard (5m / 15m / 1h), alongside the existing 123-structure,
divergence, and candle-pattern detectors. Detection runs server-side in `@kansoku/core`,
results are frozen into the chart JSON, rendered as markers in the web app, and summarized
into `technicals` text so AI reads (e.g. the `intraday-signal` skill) can use them.

## Definition being implemented

SB is a with-trend continuation structure:

1. A clear trend is in place (trend filter below).
2. Price pulls back, then makes a first with-trend attempt (H1 in an uptrend, L1 in a
   downtrend) that fails: it does not break the prior trend extreme and price falls back
   into the pullback, making a new pullback extreme.
3. A second with-trend attempt forms. The bar that breaks the second attempt's signal-bar
   high (uptrend) or low (downtrend) is the trigger bar: the SB structure is confirmed
   and annotated on that bar.
4. Both attempts must belong to the same pullback structure. If they are too far apart or
   the market has degraded into a range, no SB is counted.

Counting method: swing-pivot based (approved choice), not Brooks bar-by-bar counting.
Pivots come from the existing swing detection, mirroring `pattern123.ts`'s
`findPivots`-style alternating pivot sequence.

## Trend filter

EMA20 on each timeframe's own bars:

- Price above EMA20 and EMA20 rising → uptrend: count H2 only.
- Price below EMA20 and EMA20 falling → downtrend: count L2 only.
- Price repeatedly crossing the EMA (range) → no SB annotation.

The concrete "repeatedly crossing" rule and the "too far apart" cap (max bar distance
between the two attempts) are implementation-tuned constants defined in the detector with
the same fixture-driven approach used by `pattern123.ts` thresholds.

## Components

### 1. Detector — `packages/core/src/services/secondBreakout.ts`

New service following the `pattern123.ts` pattern:

- Input: OHLC series + timestamps for one timeframe.
- Reuses swing/pivot detection (`findSwings` in `indicators.ts`, or a local
  `findPivots`-style alternating sequence like `pattern123.ts`).
- Computes EMA20 internally for the trend filter.
- Output: `SecondBreakout[]`.
- Status is two-valued like `Pattern123`: `forming` (second attempt visible, trigger not
  yet broken) and `confirmed` (trigger bar closed beyond the signal bar extreme).

### 2. Shared type — `packages/shared/types.ts`

```ts
interface SecondBreakout {
  kind: 'H2' | 'L2'
  firstAttempt: { time: number; price: number }   // H1/L1 pivot
  signalBar: { time: number; price: number }      // second-attempt signal bar + its extreme
  trigger?: { time: number; price: number }       // trigger bar, present when confirmed
  status: 'forming' | 'confirmed'
}
```

(Exact field names may be adjusted during implementation to match neighboring types like
`Pattern123`; semantics above are fixed.)

### 3. Orchestrator wiring — `packages/core/src/services/intraday.ts`

- Run the detector once per timeframe (5m / 15m / 1h).
- Emit results into the intraday chart JSON document next to `pattern123` / `fvgZones`.
- Append a line per timeframe to the `technicals` text (e.g. "5m: H2 confirmed at 108.10
  (trigger 14:35), trend up") so AI consumers see it without reading the JSON.

### 4. Rendering — `apps/web`

- `apps/web/src/charts/intraday/useIntradayCharts.ts`: draw via `attachMarkers`:
  - H2: amber/gold arrow-up marker below the trigger bar, text "H2".
  - L2: arrow-down marker above the trigger bar, text "L2".
  - H1/L1: small grey markers at the failed first attempt, same toggle, for context.
  - `forming` structures render the H1/L1 + signal-bar marker in grey without the
    trigger marker.
- `apps/web/src/charts/intraday/useIndicatorToggles.ts`: new toggle key `sb`, label
  "SB 结构", default on, persisted to localStorage like existing toggles.

## Non-goals

- No Brooks bar-by-bar counting mode (explicitly rejected).
- No standalone chart type; annotation lives only on the `intraday` dashboard.
- No entry/stop/target logic — this is annotation only; trade logic stays in the
  `intraday-signal` skill layer.
- No user-drawn/manual variant (the `drawings` system is unrelated).

## Testing

Unit tests in `packages/core` with hand-crafted candle fixtures:

1. Uptrend H2: full sequence detects one confirmed H2 at the right bar.
2. Downtrend L2: mirrored sequence detects one confirmed L2.
3. Range: price oscillating across EMA20 produces no SB.
4. Attempts too far apart / structure degraded: no SB despite two nominal attempts.

Plus: `.claude/skills/chart/SKILL.md` indicator inventory updated to document the new
overlay and toggle.
