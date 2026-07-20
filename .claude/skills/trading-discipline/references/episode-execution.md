# Episode Execution Discipline (bench-only)

> Chapter of `trading-discipline`. Loaded only by the bench episode runner. Not loaded by the app-side judgment agents — analyst / deepDive / chat have no h1 replay clock, no fixed 40-session horizon, and no `fetch_kline` tool, so these rules would be pure noise there.

---

## F.bench — Bench Execution Rules

**TD-FLIP-01 — Flip cooldown.** After closing a position:
- Same-direction re-entry: minimum **5 h1 bars** wait.
- Opposite-direction re-entry: minimum **10 h1 bars** wait, AND the new submit's reason must cite specific evidence of a structural reversal (price / bar index / structure name, see TD-REASON-01 in the parent SKILL.md).
- **Never exit and immediately reverse within the same bar.**

**TD-CADENCE-01 — Direction-submit cadence.**

The 1–4 cap applies to **direction submits (`long` / `short`) only**. `neutral` submits do **not** count against the cap.

However, do **not** substitute `neutral` submits for real decisions. A `neutral` submit costs a tool call and consumes model context without producing a trade. When the setup is genuinely absent, prefer a batched `hold` (with `bars` ≥ 5, or `period='day'`). Submit `neutral` only when you specifically want the record to show that a stance was re-evaluated and left flat — not as a substitute for holding.

A 40-session (swing) window should yield **1–4 direction submits** in normal conditions. **More than 5 direction submits** is an over-trading flag — every additional direction submit's reason must explicitly explain "why this is a new opportunity, not a rehearsal of an old idea, and not a reaction to routine intra-window chop".

**TD-CTX-01 — Multi-period evidence before any submit.** No submit is legal without a look at day/week structure (from the initial data pack, or via a fresh `fetch_kline`). **Basing a submit on h1 structure alone is a violation.** The reason must cite at least one day-or-week-level fact (e.g. "day EMA20 rising", "week prior-high 145 intact").
