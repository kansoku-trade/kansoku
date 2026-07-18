---
name: korea-market
description: >
  Korean market quotes (KOSPI / KOSDAQ / SK Hynix / Samsung) with capitulation-reversal detection.
  Use whenever reading the US memory/storage complex (MU / DRAM / SNDK / WDC / STX / SMH) —
  Korea is the SOURCE market and leads the US tape; Longbridge does not cover KRX.
  Triggers: 韩国 / 韩股 / KOSPI / 海力士 / SK Hynix / 三星 / Samsung / 韩国爆仓 / 韩国追保 /
  存储板块见底了吗 / 洗盘结束了吗 / capitulation / Korean margin calls / has the flush ended.
---

# Korea Market

Korean quotes + a **capitulation-reversal** test, from the Yahoo Finance chart API. Stdlib only, no third-party deps, goes through `_shared/client.py` (cache + throttle + output contract).

## Why this skill exists

**Longbridge does not cover KRX.** It returns `[]` for `000660.KS` / `005930.KS`.

The tempting workaround — read Korea through the US-listed proxies **EWY** (Korea ETF) and **KORU** (3× Korea) — **lies to you**:

- They are **FX-contaminated** (a won move shows up as a price move).
- They are **frozen while Seoul is still trading** — they only reprice during US hours.

**The 2026-07-14 proof.** Reading the proxies, EWY looked ~flat (−0.13%) — nothing to see. The real Seoul tape that same session:

|          | Seoul (real)                                                                           | Proxy said |
| -------- | -------------------------------------------------------------------------------------- | ---------- |
| SK Hynix | low −9.1% intraday → **closed +2.9% on 1.55× volume** (heaviest of the entire selloff) | EWY "flat" |

**That was a textbook capitulation bottom, and the proxy hid it completely.** Anyone watching EWY would have missed the exact session they were waiting for.

**Rule: when the question is about Korea, read Korea.**

## Usage

```bash
python3 .claude/skills/korea-market/scripts/quote.py --smoke     # connectivity self-test
python3 .claude/skills/korea-market/scripts/quote.py             # default: KOSPI, KOSDAQ, SK Hynix, Samsung
python3 .claude/skills/korea-market/scripts/quote.py --fresh     # bypass 5-min cache (use intraday)
python3 .claude/skills/korea-market/scripts/quote.py 000660.KS   # single name
python3 .claude/skills/korea-market/scripts/quote.py --range 6mo # longer history
```

Yahoo symbols: KRX stocks are `NNNNNN.KS` (SK Hynix `000660.KS`, Samsung `005930.KS`); indices are `^KS11` (KOSPI), `^KQ11` (KOSDAQ).

## The exhaustion evidence (the point of this skill)

**A capitulation bottom BY DEFINITION prints a new low.** Testing for "no new low for two sessions" — the obvious naive rule — **skips the exact session you are waiting for**. That mistake was made on 2026-07-13 and corrected the next day by the data.

Look for **exhaustion** instead: heaviest selling _into_ a new low, then buyers taking the other side.

| Condition                                                        | Field           | Reference                            |
| ---------------------------------------------------------------- | --------------- | ------------------------------------ |
| **New low** — sellers pushed below the prior floor               | `made_new_low`  | `low < prior low`                    |
| **Heavy volume** — selling was maximal, not a drift              | `heavy_volume`  | `rel_volume ≥ 1.3×` (20-session avg) |
| **Green close** — buyers won the session                         | `green_close`   | `close > prev_close`                 |
| **Closed strong** — decisively, not on a last-minute bell bounce | `closed_strong` | `(close−low)/(high−low) ≥ 0.6`       |

**A washout on light volume is not capitulation** — it is a drift lower with nobody home, which has no natural floor. Volume is what separates _"sellers are done"_ from _"buyers left."_

### These are references, not a rule. **You judge.**

The script deliberately does **not** emit a verdict. It reports each measurement next to the reference it is being read against, plus a `conditions_cleared` tally — and stops there.

**Why:** collapsing this into a boolean throws away the distinction that actually matters. On 2026-07-14, Samsung cleared 3 of 4 with volume at **1.11× against a 1.3× reference** — a near-miss. A hard threshold reads that as an identical outcome to KOSDAQ's 1 of 4 (still red, still no bid). Those are not the same animal, and a script that says so is lying to you.

Read the numbers. Weigh them against the tape. Then decide.

- **`--min-rel-volume` / `--min-close-position`** tune the references if a name's normal volume profile warrants it.
- **Indices (`^KS11` / `^KQ11`) are context, not evidence.** Index volume is a poor exhaustion gauge — it dilutes the memory names across ~900 constituents. Weight the individual names much more heavily.
- **A single name reversing is not a sector washout.** Look for agreement across SK Hynix and Samsung, and confirm on the next session before treating anything as a floor.

## Interpretation rules

- **Korea leads, the US follows.** Read the Seoul close _before_ forming a view on MU / DRAM / SNDK / SMH. Two instances on record: 2026-07-02 (KOSPI −7.9%, sidecar halt) and 2026-07-13 (SK Hynix −15.4%, its biggest one-day drop ever) — the US memory complex followed both times.
- **Forced liquidation ≠ informed selling.** A margin cascade dumps at market regardless of price or fundamentals, so a big slice of the move carries **no information** about memory fundamentals. See `journal/lessons.md`.
- **A leverage flush burns out in days, not weeks** — leveraged money self-destructs (a 3× ETF down 24% only needs two more such days to be gone). Do not wait weeks for it. See `stocks/_leveraged-etf-mechanics.md`.
- **But leverage explains the VIOLENCE, not the DIRECTION.** A capitulation bottom in Korea does not un-announce SK Hynix's $51B fab or MU's $250B plan. Do not let a washout signal overwrite a real supply-side signal.
- **The margin-call rate is not in this API.** Korea's Financial Supervisory Service publishes it with a lag; it must be sourced from news/X.

## Output contract

Standard repo envelope — success → `{"ok": true, "data": {...}, "meta": {...}}`, exit 0; failure → `{"ok": false, "error": ..., "hint": ...}`, non-zero.

`data.symbols[]` carries `close`, `change_pct`, `high`, `low`, `volume`, `rel_volume`, `recovery_from_low_pct`, `close_position_in_range`, `drawdown_from_20d_high_pct`, `is_index`, a `conditions_cleared` tally, and `exhaustion_evidence` — where each condition reports its `value`, the `reference` it is read against, whether it `clears`, and `why` that condition matters.

**There is no `verdict` field, by design.** See "These are references, not a rule" above.

Cache TTL 300s; pass `--fresh` when polling intraday.
