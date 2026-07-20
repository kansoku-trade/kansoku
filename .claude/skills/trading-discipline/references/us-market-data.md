# US Market Data Discipline

> Chapter of `trading-discipline`. Loaded by the app-side judgment agents alongside the shared core (see the parent SKILL.md). Not loaded by the bench episode runner — bench uses synthetic anonymous assets with no earnings, no news, and no Longbridge / GDELT / Korea data path.

---

## B. Sources and Data Traps (applies to any agent reading earnings / news / capital flow)

**TD-SOURCE-01 — Anchor every number to a primary source.** Primary = company press release / 8-K / 10-K/10-Q / real OHLCV.

- **Longbridge's aggregated news feed and `topics/*` are secondhand; never use them as the basis for a fundamental conclusion.**
- **When a claim conflicts with the 8-K / earnings PDF, the primary document wins.**
- Case study (2026-07-14): Longbridge repeatedly reported "MRVL Q2 guide missed, gross margin under pressure", while the primary 8-K showed guide $2.70B vs consensus $2.61B, non-GAAP EPS $0.93 vs $0.90 — **a beat**, with GM up four straight quarters. Trusting the aggregator would have produced a "fundamentals deteriorating → cut" call.
- **Refutation heuristic**: the print-day stock was +32.5% on 113M shares. That tape does not fit a "bad guide". **When the tape and the story disagree, doubt the story first.**

**TD-GAAP-01 — Say GAAP or non-GAAP.** Longbridge `financial-report --kind IS` returns **GAAP diluted EPS**; the market and consensus quote **non-GAAP**. **When EPS looks absurdly bad, you probably read the wrong field.**

- **Diagnostic**: EPS crash first → check operating income and gross margin.
- **Operating income up while net income collapses** = below-the-operating-line one-timers (M&A amortisation, SBC, impairments, tax), **not the business breaking**.
- MRVL is the canonical trap here (heavy M&A amortisation from Cavium / Inphi / Innovium): Q1 FY27 revenue +27.6%, GM 52.1% (4 quarters up), operating income +35.5%, net income −80.6%. **Must read the non-GAAP line.**

**TD-QOQ-01 — YoY needs QoQ.** YoY percentages compress against a rising base even while absolute revenue is accelerating. **Do not call that "slowdown".** Compute both, print both.

**TD-UNIT-01 — Capital-flow units are ambiguous; never silently convert.** Longbridge `capital` output **carries no unit label**: `capital-rotation` treats it as **10K USD**; the session-report template infers **1K USD / $k**.

- **Record the raw number plus the unit you inferred.**
- **Do not convert when the unit is unknown** (do not turn it into 「亿」).
- If the payload has a `unit_status` field and it is not "confirmed", no unit conversion is allowed.

**TD-SPLIT-01 — Name the kind of split.** No vague "market split / weakening / strengthening". Use explicit labels: **institutional distribution / smart-vs-retail divergence / broad-tape selling / smart accumulation / broad-tape buying**. Grade pullbacks: **1 chop → 2 real pullback → 3 sector down → 4 risk contagion**.

**TD-KOREA-01 — Korea leads the US memory chain, does not track it.** Before reading MU / DRAM / SNDK / WDC / STX / SMH, **check Korea's close first** (`korea-market` skill; Longbridge does not cover KRX, and EWY / KORU are FX-polluted lagging proxies).

- 2026-07-02 (KOSPI −7.9%, circuit-breaker) and 2026-07-13 (SK Hynix −15.4%, largest single-day drop on record) — the US memory chain followed both times.
- This is also the market-specific exception to TD-LANG-03 in the parent SKILL.md (market scope follows configuration): even if Korea is not on the watched list, storage sector reads still require checking it.

**TD-PROXY-01 — `.SOX.US` is not available on Longbridge.** Use SMH / SOXX ETFs as proxies for the Philadelphia Semiconductor Index.

**TD-WINDOW-01 — GDELT is a rolling recent window, not a historical archive.** The Trump RSS mirror keeps roughly 5 days (~100 posts); older posts only exist if `archive.py` captured them — do not expect live lookback beyond the window.

---

## Forced Liquidation vs Active Selling (pair with TD-INTENT-01)

**TD-FORCED-01 — Forced liquidation ≠ active selling.** On a crash, first ask: is this "someone judged it not worth the price" or "someone got margin-called out"?

- **Active selling carries information** (it is the market's judgment). **Forced liquidation carries none** (the broker sells at market when margin is short — no consideration of price, fundamentals, or intent).
- **Liquidation-driven crashes self-exhaust** (leverage flushed → dumping stops) — a clearing-type structure.
- **⚠️ Must be used together with the next rule, otherwise it will manufacture a new one-sided bias.** Combined use with TD-INTENT-01 in the parent SKILL.md (guard against intent attribution) further reduces mis-reads.

**TD-FORCED-02 — Leverage blow-ups only explain "how hard it fell", not "whether it should have fallen".** Real supply/demand signals (capacity expansion, demand weakness) do not vanish because someone got liquidated. **Leverage is an amplifier, not a source. Never use "this was forced" to dismiss a real fundamental signal.**

---

## Broker-First for Positions

**TD-BROKER-01 — Check the broker before asking the user about positions.** Positions, cost basis, P&L, and account cash all live in the brokerage account: use `longbridge-positions` / `longbridge-profit-analysis` / `longbridge-portfolio` (or the `longbridge` CLI; the Kansoku data snapshot already ships with positions). Only ask the user when the broker query fails or returns an ambiguous result.
