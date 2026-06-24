---
name: capital-rotation
description: Use when reading today's US-market capital flow across multiple sectors to identify rotation direction — e.g. "今天资金流向", "板块强弱", "rotation map", "卖芯买云", "where is money moving today", "scan flows across sectors". Produces a cross-section snapshot of net inflows by cohort (indices / semis / software-cloud / mega-tech / AI applications), names the dominant narrative, and writes a dated journal file. Different from `market-session-tracker` (intraday live monitoring of a single watchlist) — this is a one-shot end-of-session rotation read.
---

# Capital Rotation Scanner (US-only)

Scans capital flow across standard US cohorts in one session, identifies rotation direction, classifies winners / losers, names the dominant narrative, and logs a journal file.

> **Scope**: US-only. Do NOT query HK / CN / SG markets (user preference).
> **Sources**: Longbridge `capital`, `market-temp`. Cite as `长桥证券`.
> **Units**: 万 USD. Show raw numbers from API; convert to 亿 for headline readability.

## When to use

- "今天的资金流向", "板块强弱", "rotation map"
- "卖芯买云", "AI 资金挪去哪了"
- "软件 / 云强不强", "半导体板块今天主力撤了吗"
- End-of-session debrief or pre-Asia-open prep
- **Not** for single-symbol deep-dive (use `longbridge-capital-flow` directly)
- **Not** for live intraday tracking (use `market-session-tracker`)

## Standard cohorts

| Cohort | Symbols |
|---|---|
| **Indices** | `SPY`, `QQQ`, `DIA`, `IWM` |
| **Semis** | `NVDA`, `AMD`, `MU`, `MRVL`, `TSM`, `AVGO`, `SMH`, `SOXX`, `AMKR`, `ASX` |
| **Software / Cloud** | `NOW`, `ORCL`, `CRM`, `ADBE`, `SNOW`, `DDOG`, `MDB`, `PLTR`, `PANW`, `CRWD`, `NET`, `IGV`, `CLOU` |
| **Mega-tech** | `AAPL`, `MSFT`, `GOOGL`, `AMZN`, `META`, `TSLA` |
| **Risk-off proxy** | `VXX`, `TLT`, `GLD` (optional, for cross-asset confirmation) |

User watchlist override: read `stocks/` directory for symbols the user already tracks; promote those to first-tier in their respective cohort.

## Workflow

1. **Time check** — `date` + confirm US session state (pre / intraday / post / closed). Adjust analysis date in filename: use the **US session date**, not Asia local date.

2. **Market temperature** — single call:
   ```bash
   longbridge market-temp US --format json
   ```
   Report Temperature / Valuation / Sentiment.

3. **Index baseline** — snapshot mode (gives large/medium/small breakdown):
   ```bash
   longbridge capital SPY.US --format json
   longbridge capital QQQ.US --format json
   ```
   Net large = `capital_in.large - capital_out.large`. Flag distribution if large net ≪ 0 while small net > 0 (主力—散户背离).

4. **Cohort scan** — for each cohort, `longbridge capital <SYM> --flow --format json | tail -8` to grab the latest cumulative `inflow` value (the last array element is the running total in 万 USD). Parallelize across symbols.

5. **Rotation classification** — for each cohort, sum net flows; rank symbols within cohort; identify:
   - **Cohort net** (sector-level direction)
   - **Cohort leader** (largest +)
   - **Cohort outlier** (largest −, especially if cohort net is positive)
   - **Cross-cohort rotation**: which cohort gained vs lost net flow

6. **Narrative identification** — pick ONE of:
   - 卖芯买云 (semis − / software +)
   - 卖云买芯 (inverse)
   - 全板派发 (all cohorts negative + indices large-out)
   - 全板吸金 (all positive + indices large-in)
   - 窄口集中 (one cohort dominated by 1-2 names; rest flat)
   - 风险偏好切换 (cyclicals out / defensives in)
   - **AI 已变现 vs 未变现** (rank by AI revenue maturity, see §Narrative criteria)

7. **Write journal file** — `~/git/trade/journal/YYYY-MM-DD-flow.md` using the **US session date**. Use `templates/rotation-snapshot.md` as scaffold. If the file exists (e.g. re-run same day), append a new section with timestamp; do not overwrite.

8. **Surface 3 insights + tomorrow watch** — concise, actionable. No vague "市场分化", always name the split.

## Distribution detection rules

Use these triggers to label index behavior:

| Pattern | Label |
|---|---|
| SPY large net < 0 AND `\|large net\|` > 5 × small net | **机构派发** |
| All 3 buckets (large / medium / small) net < 0 | **全档抛压** |
| Large net < 0, small net > 0, magnitudes similar | **主力—散户背离** |
| Large net > 0, small net < 0 | **主力吸筹** |
| All 3 buckets > 0 | **全档吸金** |

Always state the pattern explicitly; do not say "weak / strong" vaguely.

## Narrative criteria — "AI 已变现 vs 未变现"

A common useful narrative axis. Classify cohort flow winners / losers by AI revenue maturity:

- **已变现 (likely to attract flow)**: MU (HBM revenue confirmed), NOW (AI workflow ARR), ORCL (AI cloud bookings), AMD (MI-series sales), AMZN (AWS Bedrock), PLTR (gov + commercial AIP)
- **未变现 / 纯叙事**: SNOW, MRVL (AI guidance hasn't translated), CRWD (AI security narrative), AAPL (Apple Intelligence vague), GOOGL (Gemini monetization weak)

When flow winners cluster in "已变现" and losers in "未变现", call out **"narrative 收敛至 AI 已变现窄口"** — this is a key macro signal of late-cycle AI selectivity.

## CLI quick reference

```bash
longbridge market-temp US --format json
longbridge capital SPY.US --format json                    # snapshot (large/med/small)
longbridge capital QQQ.US --flow --format json | tail -8   # time-series cumulative
longbridge capital <SYM>.US --flow --format json | tail -8 # per-symbol
```

The `--flow` last-row `inflow` field is the cumulative net for the session in 万 USD. No date parameter — today's data only.

## Failure modes

- `Error: request timeout` / `connect timeout` → retry 1-2 times; do not block the report. Mark unavailable symbols with `n/a` and proceed.
- Cohort scan during US pre-market (04:00–09:30 ET) → data exists but thin; flag report as "pre-market preliminary, not full-session".
- Symbol unavailable on Longbridge (e.g. `.SOX.US`) → substitute ETF proxy (`SMH`/`SOXX`).

## Output format (chat reply)

1. Header: market state + session date
2. Index baseline table
3. Cohort tables (one per cohort)
4. **Narrative label** in bold
5. 3 insights — each with a number and 1-2 sentence claim
6. Tomorrow watch — 4-6 bullets, each with explicit symbol + condition

Tone: match user language (default 文言 for this user, see `~/.claude/CLAUDE.md`).

## Anti-patterns

- ❌ Querying HK / CN / SG markets (user said US-only)
- ❌ Reporting "市场分化" without naming the split
- ❌ Treating one-symbol-dominated cohort net as broad strength (e.g. semis "+3.4 亿" but MU alone is +4.2 亿)
- ❌ Skipping the journal write step
- ❌ Skipping the narrative label (must pick one)
- ❌ Single-point prediction; use scenario language for tomorrow watch

## Related skills

- `market-session-tracker` — live intraday monitoring of one watchlist
- `longbridge-capital-flow` — single-symbol drill-down
- `longbridge-market-temp` — sentiment-only snapshot
- `stock-deep-dive` — multi-lens single-name research

## File layout

```
capital-rotation/
├── SKILL.md
└── templates/
    └── rotation-snapshot.md
```
