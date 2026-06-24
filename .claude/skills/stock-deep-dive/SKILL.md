---
name: stock-deep-dive
description: Use when the user asks for an end-to-end orientation on a listed company they don't yet understand, especially when the request combines two or more dimensions in one ask. Triggers on "X 是干什么的", "帮我了解 X", "X 主营 + 同行", "盘前为什么涨", "本周趋势 + 阻力支撑", "X 和其他公司的关系", "first time looking at X", "full brief on X". Skip when the user wants only a single lens — use the targeted Longbridge sub-skill instead.
---

# Stock Deep Dive

## Overview

A six-lens onboarding workflow for getting up to speed on one listed company in a single pass. Built from a live session where the author repeatedly failed by quoting community-post numbers as if they were company guidance, by trusting GAAP EPS fields when the market quoted non-GAAP, and by reading YoY % deceleration as business slowdown without checking the base.

**Core principle: anchor every numeric claim on a primary source.** Press release, 8-K, real OHLCV are primary. Community topic titles, truncated news headlines, and aggregated provider fields are *leads*, not sources. Verify before quoting.

## When to use

- User names a ticker they don't know and asks for orientation
- Request combines two or more of {business, fundamentals, technicals, catalyst, peers}
- "盘前 / 今日为什么涨跌" question — runs lenses 1, 4, partially 6
- Request to "explain how X relates to other listed companies" — emphasizes lens 5

If the user wants only one lens (e.g., just real-time price), do NOT load this skill — go directly to the corresponding `longbridge-*` sub-skill.

## The six lenses

Lenses 1–5 are independent. Dispatch their Longbridge calls **in parallel**. Lens 6 (audit) runs last, against all collected data.

| # | Lens | Sub-skills | Output anchor |
|---|---|---|---|
| 1 | Business identity | `longbridge-company-profile` + `longbridge-business-query` | 1-line "what" + segment revenue mix table |
| 2 | Fundamentals | `longbridge-fundamental` | Quarterly revenue series (YoY *and* QoQ) + OpInc trajectory + reconciled EPS |
| 3 | Technicals | `longbridge-technical` + `longbridge-kline` | Last-5-day OHLCV + week summary + pivot S/R + indicator vote + ATR14 |
| 4 | Catalysts | `longbridge-news` + `trump-truth-monitor` (if policy-exposed) | Classified news/filings + community sentiment skew + pre-market range + Trump-policy hits |
| 5 | Supply chain & peers | `longbridge-supply-chain` + `longbridge-competitive-analysis` | Upstream → company → downstream flow + peer valuation table + paired-trade logic |
| 6 | Narrative audit | (this skill, see below) | Reconciliation: official vs community, GAAP vs non-GAAP, YoY vs QoQ, mix vs aggregate |

## Mandatory verification — the recurring traps

These six errors occur repeatedly when synthesizing a stock brief. The skill exists primarily to prevent them. **Self-audit before sending output:**

### Trap 1 — Community topic ≠ company guidance

Longbridge `news <SYMBOL>` returns mixed feeds. Items with URL pattern `longbridge.com/topics/*` are **user-posted community threads**, not company-issued. Any "FY guide $X" figure sourced from a community-topic title must be verified against the actual press release (`longbridge.com/news/*` with reputable `source_name`, or the SEC 8-K) before quoting. **Never restate a community-topic number as guidance.**

### Trap 2 — Truncated headline ≠ official statement

News titles end in "…" when truncated by the feed. Pull the article body (`<url>.md` variant on Longbridge) or the 8-K text before quoting a CEO percentage. If you can't pull the body, attribute as "per news headline — unverified".

### Trap 3 — Longbridge `financial-report --kind IS` EPS field = GAAP

US companies report **non-GAAP EPS** on earnings calls; analyst consensus is also non-GAAP. The Longbridge `IS` EPS field is **GAAP diluted**. If the value looks absurd (e.g., 0.04 when consensus was 0.80), it's GAAP, not a beat/miss. Always state which basis you're quoting. For non-GAAP, pull from news / press release excerpt.

### Trap 4 — YoY % deceleration ≠ business slowdown

Compute **QoQ alongside YoY every time**. If the base year was itself accelerating off a low, YoY % naturally compresses even as absolute revenue accelerates. Look at the sequential QoQ trend before claiming "growth is slowing". Show implied forward YoY from next-quarter guidance — it often reveals a V-shape that aggregate YoY hides.

### Trap 5 — Mix shift hides under aggregate growth

If the company has one hyper-growth segment and one declining segment (classic: AI silicon + legacy storage), aggregate growth understates the hot segment. Break out by segment when the disclosure allows; if not, estimate from CEO commentary and flag the assumption.

### Trap 6 — Pre-market wide range is signal

A pre-market range > 1× ATR14 (e.g., $188 – $211 vs ATR14 $12) means institutions and retail are in heavy disagreement. Note explicitly. The open print and the first-hour hold-of-pivot is the resolution.

## Output template

```
# {Symbol} — {company name} 略览

## 一、Business identity
1-sentence "what" + revenue mix table (segment | % | content | cycle phase)

## 二、Fundamentals
- Quarterly revenue table: period | rev | YoY | QoQ
- OpInc trajectory (sign and direction matter more than absolute)
- EPS: GAAP from provider AND non-GAAP from press release (label both)
- Latest-quarter guidance vs prior guidance — explicit delta

## 三、Technicals
- Last 5 sessions OHLCV table + week summary (open/close/high/low/%)
- 52w range, last close, ATR14
- Pivot S/R from last 5d (P, R1-3, S1-3)
- Indicator vote table (MACD, RSI, KDJ, BB, EMA50/200, ADX, OBV)
- Composite verdict (buy / sell / neutral)

## 四、Catalysts (now)
- Classified news (catalyst / regulatory / strategic / opinion / filing / community)
- Pre-market last + range (flag if > 1× ATR)
- Sentiment skew (coarse %, no individual quotes)

## 五、Supply chain & peers
- Upstream (foundry / IP / EDA / equipment) — who, why dependent
- Downstream (customers / OEMs / end users) — concentration risk
- Horizontal (same-tier competitors / substitutes) — peer valuation table
- Paired-trade logic — which other tickers move together / inversely

## 六、Verdict
- Bull thesis (anchored on numbers)
- Bear / risk (anchored on numbers)
- Valuation anchor (which peer's multiple this should trade against, why)
- Key tell to watch (e.g., does first-hour price hold pivot)

⚠️ For reference only. Not investment advice.
```

## Anti-pattern table

| Excuse | Reality |
|---|---|
| "The community post said the FY28 guide is $X" | Community ≠ company. Find the press release. |
| "The CEO said +40% YoY" (from a "…"-truncated headline) | Pull the article body. Attribute as unverified if you can't. |
| "EPS is 0.04, missed badly" (from the IS feed) | That's GAAP. Non-GAAP is what consensus measures. |
| "YoY dropped from 63% to 22%, growth is slowing" | Check QoQ. Check the base. Check next quarter's implied YoY. |
| "Revenue is +28%, no big deal" | If 75% of revenue is hyper-growth segment masking 25% in decline, the hot segment is +60%+. |
| "Pre-market is volatile, ignore" | A pre-market range > 1× ATR is institutional disagreement — a signal. Note it. |

## Red flags — STOP and reverify

- About to quote a number that came from a `topics/*` URL
- About to quote a CEO statement from a title ending in "…"
- About to call an earnings result "miss / beat" without saying GAAP or non-GAAP
- About to use YoY % alone to describe momentum
- About to give a verdict without ATR + S/R for the technical lens
- About to skip the supply-chain lens because "it's just a chip company"

## Concurrency

Lenses 1–5 each call multiple Longbridge endpoints. Within a single user turn, batch every independent CLI call in **one parallel tool block**. A typical first turn dispatches 8–12 `longbridge` calls in parallel, then runs the technical Python computation in a follow-up turn.

## Related skills

Required (load on demand):
- `longbridge-company-profile`, `longbridge-business-query`
- `longbridge-fundamental`
- `longbridge-technical`, `longbridge-kline`
- `longbridge-news`
- `longbridge-supply-chain`, `longbridge-competitive-analysis`

Optional (deeper drilldown):
- `longbridge-peer-comparison` — pure peer-matrix
- `longbridge-valuation` — historical PE/PB percentile
- `longbridge-earnings` — earnings-day specific
- `longbridge-capital-flow` — intraday capital direction
- `trump-truth-monitor` — Trump policy catalyst (run for lens 4 when the symbol has policy exposure: semis / China ADR / auto / energy / defense / bank)

For session-long multi-symbol tracking after the deep dive, route to `market-session-tracker`.
