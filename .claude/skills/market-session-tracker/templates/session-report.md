# Session Report — {{YYYY-MM-DD}}

**Time zone**: ET · **Market**: {{US/HK/CN}} · **Theme**: {{e.g. 半导体 / AI / 存储}}
**Watchlist**: {{SYM1, SYM2, ...}}

---

## 1. Pre-market (04:00–09:30 ET)

| Symbol | Prev Close | Pre High | Pre Last | Pre Vol (M) | Vol % prev day | Δ% pre_high vs prev_close | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|

> _Data source_: `longbridge quote <SYM> --format json` for pre_market_quote · `longbridge kline <SYM> --period day --count 5 --format json` for prev day full vol.

**Exuberance flag**: {{YES / NO}}
**Reason**: {{pre vol > 5% prev day **and** pre high > prev_close × 1.07 → expect fade test}}
**Key news / catalysts**: {{trillion-dollar cap, earnings, etc.}}

---

## 2. Opening 30 min (09:30–10:00 ET)

| Symbol | Open | Intra High | Intra Low | 10:00 Last | Pre High touched? | Δ% from open |
|---|---:|---:|---:|---:|---|---:|

**6-signal failed-breakout stack** — {{N}} / 6 fired:
- [ ] Pre-market high NOT touched in cash within 30 min
- [ ] New intraday high broke then price fell back below it
- [ ] Volume did NOT expand at breakout
- [ ] Sector ETF (SMH/SOXX) did NOT confirm green
- [ ] Leader stock did NOT make new high
- [ ] All 3 capital flow buckets net selling

**Initial tier**: {{Tier 1 / 2 / 3 / 4}}
**Initial thesis**: {{one-sentence}}

---

## 3. Intraday Thesis Revisions

### {{HH:MM ET}} — initial判
- **Snapshot**: {{symbol: last, change%, intra high/low}}
- **Triggers fired**: {{which of the 6}}
- **Probabilities**: Bull {{X}}% / Base {{Y}}% / Bear {{Z}}%

### {{HH:MM ET}} — 修正 N
- **Trigger of revision**: {{user said X / data showed Y}}
- **What changed**: {{specific delta in price / vol / breadth}}
- **New probabilities**: Bull {{X}}% / Base {{Y}}% / Bear {{Z}}%
- **New tier**: {{...}}

_(repeat per revision)_

---

## 4. Capital Flow (leader symbol = {{SYM}})

| Bucket | In | Out | **Net** |
|---|---:|---:|---:|
| Large |  |  |  |
| Medium |  |  |  |
| Small |  |  |  |
| **Total** |  |  |  |

> _Units_: raw values from `longbridge capital <SYM> --format json` (Longbridge does not label units explicitly; empirically scale appears to be **千USD / $k**). Record both raw numbers and inferred unit; do not silently convert.
> _Time series_: `longbridge capital <SYM> --flow --format json` for per-minute series.

**3-bucket alignment**: {{ALL OUT / mixed / ALL IN}}
**Outflow acceleration**: {{YES / NO — e.g. 13:38 −30k → 13:44 −47k per min}}

---

## 5. Cross-Asset Sentiment

| Indicator | Value | Δ% | Interpretation |
|---|---:|---:|---|
| QQQ.US |  |  |  |
| SPY.US |  |  |  |
| DIA.US |  |  |  |
| VXX.US |  |  |  |
| TLT.US |  |  |  |
| GLD.US |  |  |  |
| US market-temp |  | — |  |

**Diagnosis**: {{Rotation defensive / True risk-off / Isolated sector distribution / Bubble unwind}}

---

## 6. Close (16:00 ET)

| Symbol | Open | High | Low | Close | Vol (M) | Daily K shape |
|---|---:|---:|---:|---:|---:|---|

**Final tier**: {{Tier N}}
**Day's narrative**: {{one paragraph — gap-up + fade / breakout confirmed / failed breakout / etc.}}

---

## 7. Outcome vs Thesis

- **Initial Bull / Base / Bear**: {{X% / Y% / Z%}}
- **Actual outcome**: matches {{Bull / Base / Bear}}
- **Best revision**: revision N at HH:MM — what data triggered the right call
- **Missed signals**: {{any signals you read wrong}}

---

## 8. Lessons

- {{one to three takeaways}}

---

**Sources**: 长桥证券 / Longbridge Securities
**Disclaimer**: ⚠️ 仅供参考，不构成投资建议 / For reference only, not investment advice.
