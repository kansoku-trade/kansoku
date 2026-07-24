# Position Box Overlay for Intraday Entry Plan — Design

Date: 2026-07-24
Status: approved

## Goal

Replace the four `price line` primitives that render the intraday entry plan
(`entry` / `stop` / `target1` / `target2`) with a three-block filled rectangle
("Position box") in the style of TradingView's Long/Short Position tool,
whenever the plan has been triggered by price action (`entry_status ∈
{triggered, stopped}`). Before trigger (`waiting` / `invalidated`) the existing
four horizontal dashed price lines stay in place.

The current implementation lives in
`apps/web/src/features/charts/intraday/useIntradayCharts.ts:387–476`, where the
plan is drawn via `addPriceLine` calls into `h.planLines`. That code path stays
for `waiting` / `invalidated` and for the non-plan levels (resistance zones, day
levels, option walls); only the four plan lines are swapped out.

## Visual specification

Three stacked rectangles, extending horizontally from the first bar that
touched `entry` (`triggered_at`) to the right edge of the chart:

| slot | y-range | fill | border |
| --- | --- | --- | --- |
| stop block | `stop` ↔ `entry` | `theme.down` @ α=0.18 | `theme.down` @ α=0.7 |
| near-target block | `entry` ↔ `target1` | `theme.up` @ α=0.12 | `theme.up` @ α=0.5 |
| far-target block | `target1` ↔ `target2` | `theme.up` @ α=0.22 | `theme.up` @ α=0.7 |

`direction=short` needs no special-case: the `target1` / `target2` values are
already below `entry` in the data, and `stop` above, so `priceToCoordinate`
lays the three blocks out correctly.

A 1 px `theme.up` @ α=0.9 line is drawn at `target1` so the near/far target
blocks read as two adjacent bands rather than one gradient.

**Dimmed state** — when `entry_status === 'stopped'`:

- All alpha values × 0.5.
- A 10 px "已止损" tag is drawn top-left inside the stop block.

**Z-order**: `'bottom'`, mirroring `zhongshuPrimitive`. Candles, markers, and
connector lines sit on top.

**Labels**: none. All price labels on the four plan levels disappear once the
box shows; the user reads exact prices from the chart's built-in
crosshair/hover.

## Components

### 1. Primitive — `apps/web/src/features/charts/intraday/positionBoxPrimitive.ts` (new)

New file, structured after `zhongshuPrimitive.ts`: an `ISeriesPrimitive` with
a paneView that translates the box data into pixel rectangles each redraw.

Internal data shape (not exported to `packages/shared`):

```ts
interface PositionBoxData {
  startTime: number;    // triggered_at, unix seconds
  endTime: number;      // lastBarTime, unix seconds
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  dimmed: boolean;      // stopped
}
```

Public API: `setData(data: PositionBoxData | null)`. `null` produces no rects.

Edge handling for time coordinates copies `zhongshuPrimitive` exactly: if
`timeToCoordinate` returns `null` and the timestamp is inside `visibleRange`,
clamp to `0` / `ts.width()`; otherwise skip.

### 2. Shared type — `packages/shared/types.ts`

Add `triggered_at?: string | null` to `IntradayEntryPlan`. ISO string,
`null` whenever the plan has never been touched.

### 3. Core — `packages/core/src/analysis/intraday/entryPlan.ts`

`resolveEntryPlanStatus` return type becomes
`{ status; note; triggered_at: number | null }`. The scan loop already tracks
`triggered`; capture the candle time on the transition:

```ts
if (touchesEntry(c)) { triggered = true; triggeredAt = c.time; }
```

`triggered_at` propagates through both terminal branches (`stopped` keeps its
original `triggeredAt`, `triggered` returns the same). `waiting` and
`invalidated` return `null`.

### 4. Core — `packages/core/src/analysis/intraday/orchestrator.ts`

At line 167 where `entry_status` / `entry_status_note` are copied, also copy
the new field:

```ts
entryPlan.triggered_at = st?.triggered_at != null
  ? new Date(st.triggered_at * 1000).toISOString()
  : null;
```

### 5. Web wiring — `apps/web/src/features/charts/intraday/useIntradayCharts.ts`

- Init: `h.positionBox = new PositionBoxPrimitive(); h.candle.attachPrimitive(h.positionBox);`
  in the same block that attaches `h.zhongshu` / `h.fvg`.
- Per redraw:
  ```ts
  const boxOn = toggles.levels && ep
    && (ep.entry_status === 'triggered' || ep.entry_status === 'stopped')
    && lastBarTime !== undefined;

  const triggeredAt = boxOn
    ? (ep.triggered_at
        ? Math.floor(Date.parse(ep.triggered_at) / 1000)
        : firstTouchTime(d.candles, ep.entry, direction))
    : null;
  ```
- When `boxOn && triggeredAt != null`:
  - `h.positionBox.setData({ startTime: triggeredAt, endTime: lastBarTime, direction, entry, stop, target1, target2, dimmed: entry_status === 'stopped' })`
  - Skip the four `addPriceLine` calls for entry / stop / T1 / T2 (the resistance
    zones, day-level lines, and option walls stay as-is).
- Else: `h.positionBox.setData(null)` and fall through to the existing
  price-line path.

`firstTouchTime` is a small local helper in the same directory,
implementing the same predicate as `touchesEntry` in `entryPlan.ts`. Its sole
job is to make old journal JSON (with no `triggered_at` field) still render a
box; new data always uses the core-supplied field.

## Non-goals

- No new price levels or trade logic — the four values (`entry`, `stop`,
  `target1`, `target2`) are unchanged.
- No box for `invalidated` — the plan was never touched, so a "position" box
  would be misleading. Keeps the existing greyed-out dashed lines.
- No user-drawn variant. The `drawings` module is unrelated.
- No new indicator toggle. The box is bound to the same `toggles.levels`
  switch that controls the four plan lines today.
- No color-theme tokens carved out of `theme.up` / `theme.down`. If box color
  ever needs to diverge from directional candle color, that is a follow-up.

## Testing

**Core** — `packages/core/test/intraday.test.ts`:

1. `triggered` case: `triggered_at` equals the first candle whose
   `[low, high]` bracketed `entry`.
2. `stopped` case: `triggered_at` retained from the earlier trigger, not
   overwritten by the stop candle.
3. `waiting` case: `triggered_at === null`.
4. `invalidated` case (both long and short): `triggered_at === null`.

**Web** — `apps/web/src/features/charts/intraday/positionBoxPrimitive.test.ts` (new):

Mock `timeToCoordinate` / `priceToCoordinate` (same pattern as
`zhongshuPrimitive.test.ts`) and assert:

- long triggered → three rects with y ascending as `stop → entry → t1 → t2`.
- short triggered → three rects with y descending as `stop → entry → t1 → t2`.
- dimmed → alpha values halved, "已止损" tag written top-left.
- `setData(null)` → zero rects.

**Manual verification** on `pnpm dev:desktop`:

1. Load an intraday analysis whose plan has triggered → box shows, four plan
   lines gone, resistance / day-level lines unchanged.
2. Load one that stopped out → dimmed box + "已止损" tag.
3. Load one still waiting → four dashed lines, no box.
4. Load an invalidated plan → dashed lines in grey (existing dead-plan
   colouring), no box.
5. Toggle "levels" off → both box and lines disappear.
6. Load an older journal JSON that predates `triggered_at` in core → fallback
   `firstTouchTime` still produces a box.

## Files touched

| File | Change | Rough size |
| --- | --- | --- |
| `packages/shared/types.ts` | `IntradayEntryPlan.triggered_at?` | +1 line |
| `packages/core/src/analysis/intraday/entryPlan.ts` | capture + return `triggered_at` | +5 lines |
| `packages/core/src/analysis/intraday/orchestrator.ts` | write `triggered_at` on plan | +3 lines |
| `packages/core/test/intraday.test.ts` | four assertions | +20 lines |
| `apps/web/src/features/charts/intraday/positionBoxPrimitive.ts` | new | ~180 lines |
| `apps/web/src/features/charts/intraday/positionBoxPrimitive.test.ts` | new | ~80 lines |
| `apps/web/src/features/charts/intraday/useIntradayCharts.ts` | attach primitive, boxOn branch, skip four lines | ±40 lines |

## Risks and open trade-offs

- `invalidated` deliberately does not get a box, even though the user's
  original phrasing was "any state after trigger, including stop-loss and
  take-profit counts". `invalidated` means the plan was never touched, so a
  position visualization would misrepresent history. Reversing this decision
  is a one-line change: add `'invalidated'` to `boxOn` with `dimmed=true`.
- The box uses raw `theme.up` / `theme.down` with alpha. It may visually
  collide with FVG / zhongshu overlays that share nearby palette territory.
  If so, a dedicated `theme.plan.up` / `theme.plan.down` token is a small
  follow-up.
- `firstTouchTime` duplicates the `touchesEntry` predicate. Kept as a
  short-term compatibility shim; once historical journal data has been
  re-baked with `triggered_at` populated, the fallback can be removed.
