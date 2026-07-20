# Episode Execution Discipline (bench-only)

> Chapter of `trading-discipline`. Loaded only by the bench episode runner. Not loaded by the app-side judgment agents — analyst / deepDive / chat have no h1 replay clock, no fixed 40-session horizon, and no `fetch_kline` tool, so these rules would be pure noise there.

---

## F.bench — Bench Execution Rules

**TD-FLIP-01 — Flip cooldown.** After closing a position:
- Same-direction re-entry: minimum **5 h1 bars** wait.
- Opposite-direction re-entry: minimum **10 h1 bars** wait, AND the new submit's reason must cite specific evidence of a structural reversal (price / bar index / structure name, see TD-REASON-01 in the parent SKILL.md).
- **Never exit and immediately reverse within the same bar.**

**TD-CADENCE-01 — Decision cadence.** A 40-session (swing) window should yield **1–4 submits** in normal conditions. More than 5 is an over-trading flag — every additional submit's reason must explicitly explain "why this is a new opportunity rather than a rehearsal of an old idea".

**TD-CTX-01 — Multi-period evidence before any submit.** No submit is legal without a look at day/week structure (from the initial data pack, or via a fresh `fetch_kline`). **Basing a submit on h1 structure alone is a violation.** The reason must cite at least one day-or-week-level fact (e.g. "day EMA20 rising", "week prior-high 145 intact").
