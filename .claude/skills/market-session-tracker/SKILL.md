---
name: market-session-tracker
description: Use when monitoring stocks/ETFs/indices across pre-market, open, intraday, or close — especially when the user is reading session action live and may revise their take as it unfolds. Triggers include 盘前/盘中/收盘 sessions, multi-symbol watchlists (e.g. MU/TSM/SMH semi tracking), user observations like "突破"/"冲高"/"回调"/"假突破", capital flow checks, market temperature checks, semi/AI/memory plays, and any request that bundles a position context with a live read.
---

# Market Session Tracker

Real-time US-market analysis pattern. Sits on top of `longbridge-quote`, `longbridge-kline`, `longbridge-capital-flow`, `longbridge-market-temp` — adds orchestration, breakout verification, distribution detection, tier classification, and revision discipline.

## Standard symbol sets

| Theme | Symbols |
|---|---|
| Semi / memory | `MU.US`, `TSM.US`, `DRAM.US` (Roundhill Memory ETF), `SMH.US`, `SOXX.US` |
| Indices | `QQQ.US`, `SPY.US`, `DIA.US`, `IWM.US` |
| Vol / risk-off | `VXX.US`, `UVXY.US`, `TLT.US`, `GLD.US` |

`.SOX.US` is unavailable on Longbridge — use `SMH`/`SOXX` ETF proxies.

## Seven protocols

**0. Trump-feed sweep (pre-cash)** — before any pre-market read, run `python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 14`. Any `high`-tier post touching watchlist sectors (tariff_trade / semi_tech / energy / fed_macro / geopolitical) goes into the session report as a candidate explanation for any gap, **before** running quote-based exuberance math. Skip when the watchlist has no policy-exposed names. See `trump-truth-monitor` skill for tier grading.

**1. Pre-market verification** — compute pre vol % of prev day full vol, and pre high % over `prev_close`. Flag **exuberance** when pre vol > 5% of prev day **and** pre high > `prev_close × 1.07`.

**2. Failed-breakout 6-signal stack** — count how many fire in the cash session:
1. Pre-market high NOT touched in first 30 min of cash
2. New intraday high breaks → price falls back below the broken level within minutes
3. Volume does NOT expand at the breakout
4. Sector ETF (`SMH`/`SOXX`) does NOT confirm by going green
5. Leader stock (MU for memory; TSM for foundry; NVDA for AI) does NOT make new high
6. Capital flow: all 3 buckets net selling

**≥ 4 signals fired = failed breakout / distribution.** Name the tier (§5).

**3. Capital flow triple-bucket** — `longbridge capital <SYM> --format json`. Net = `capital_in − capital_out` for each of large / medium / small. **All 3 net out = textbook distribution.** Use `--flow` for accelerating-outflow detection.

**4. Cross-asset sentiment matrix**

| Pattern | Interpretation |
|---|---|
| DIA > SPY > QQQ + VXX down | Rotation (defensive), **not panic** |
| VXX up + GLD up + TLT up | **True risk-off** |
| Sector red + SPY flat + VXX down | **Isolated** distribution |
| HK/CN valuation ≥ 80 + sentiment ≤ 35 | Known-bubble (overvalued, retail knows) |

**5. Pullback tier classification**

| Tier | Triggers |
|---|---|
| 1 震荡 | Stock −2% from intraday high; closes green |
| 2 实质回调 | Stock −5% from peak; sector ETF turns red |
| 3 板块下跌 | Sector −3%+; broad indices flat-to-red |
| 4 风险传染 | SPY −1%+; VXX +5%+; defensives also fall |

Always **name the tier explicitly** — never vague "weakening".

**6. Scenario probabilities** — always 3 scenarios (Bull / Base / Bear) with explicit % (sum=100) and trigger conditions. Mark probabilities as subjective. **Revise as data flows** with timestamps: `09:30 初判 → 09:54 修正 → 09:56 再修正`.

**7. Thesis revision discipline** — when user says "突破"/"冲高"/"回调":
1. Re-pull live quote + intraday minute tail — do NOT auto-agree
2. Check cash intraday high vs **pre-market high** vs prior intraday high
3. Distinguish: **true breakout** (new high > pre high, holds 5+ min) vs **partial** (breaks prior intra high but not pre high) vs **recovery** (only bounces from intra low)
4. If data contradicts user, **disagree with evidence**

## Output format (each snapshot)

- **Time (ET)** — always
- **Symbol table** — last, change%, intra high/low, vs pre high, vol
- **Key signal** (one sentence)
- **Tier** (if pullback context)
- **Next watch levels** (explicit prices, not "around X")
- **Source**: 长桥证券 · **Disclaimer**: ⚠️ 仅供参考，不构成投资建议

## Session report logging

After a session, write a structured log using **`templates/session-report.md`** in this skill. Default path: `~/git/trade/journal/YYYY-MM-DD-<theme>.md` (a dedicated git repo; `journal/` avoids the `logs` global-gitignore collision). Captures pre-market verdict, opening behavior, tier evolution, thesis revisions, capital flow, cross-asset sentiment, end-of-day outcome, and lessons.

## Optional: position context

When user provides positions or asks via `longbridge positions`:
- Show symbol, qty, avg cost, current price, unrealized P&L, % of book
- Cross-reference which positions are exposed to the current move
- **Do NOT recommend buy/sell** — defer to user

## Anti-patterns

- ❌ Auto-confirming user's directional read (re-pull data first)
- ❌ Calling a cash bounce a "breakout" without checking pre-market high
- ❌ Single-point price prediction (use 3 scenarios)
- ❌ Vague "weak/strong" — use tier classification
- ❌ Conflating sector weakness with systemic (check VXX/GLD/SPY)
- ❌ Calling trend in first 5 min (wait for 30-min K)
