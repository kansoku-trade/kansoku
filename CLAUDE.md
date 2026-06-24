# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal **US-equities trading journal**, not a software project. There is nothing to build, no test runner, no package manifest. The repo is two things:

1. **A durable record** — dated markdown under `journal/` and per-name notes under `stocks/`. Markdown is the *only* persistence layer (no database).
2. **A toolchain** — custom Claude Code skills under `.claude/skills/` that pull market data and orchestrate analysis workflows. "Running" this repo means invoking a skill or one of its Python scripts, then writing the synthesis back into a journal/stock file.

**Documentation language — write every document in this repo in 中文白话 (modern vernacular Chinese).** This covers journal entries, stock notes, specs, READMEs, and this file. Keep English only for tickers, API/CLI identifiers, and terms with no natural translation. This **overrides** the global "products committed to git are written in English" default (`~/.claude/CLAUDE.md`) — for this repo, written docs are 中文白话, not English and not 文言. Chat replies still follow the global rule (文言).

**US markets only** — never query HK / CN / SG symbols in market-wide work.

## Architecture — three layers

### Layer 1 — data sources (raw retrieval)

| Source | Access | Covers |
|---|---|---|
| **Longbridge** plugin (`longbridge ...` CLI / `longbridge-*` skills) | brokerage account | real-time quotes, K-line/OHLCV, fundamentals, capital flow, technicals, market temperature, news |
| **`fred`** skill | free API key | US/global macro time series (CPI, GDP, Fed funds, yields, M2, DXY) |
| **`sec-edgar`** skill | UA header | raw 10-K/10-Q/8-K/S-1 text, Form 4 insider parsing |
| **`gdelt`** skill | none (5s throttle) | global multilingual news tone stream |
| **`trump-truth-monitor`** skill | RSS mirror | Trump Truth Social feed, classified + tier-graded for market impact |

Longbridge covers price/fundamentals; the four custom skills cover Longbridge's blind spots (macro, raw filings, world news, policy speech). See `docs/superpowers/specs/2026-05-28-market-intel-skills-design.md` for the design rationale and full per-script interface.

### Layer 2 — orchestration workflows (the value-add)

These skills do not fetch new kinds of data; they sequence Layer-1 calls into a disciplined read and enforce anti-patterns:

- **`stock-deep-dive`** — one-pass six-lens onboarding for a name you don't know (business / fundamentals / technicals / catalysts / supply-chain-peers / audit). Dispatch lenses 1–5 in **one parallel tool block** (8–12 `longbridge` calls); lens 6 audits the result.
- **`capital-rotation`** — one-shot end-of-session scan of net flows across fixed cohorts (indices / semis / software-cloud / mega-tech), names ONE rotation narrative, writes `journal/YYYY-MM-DD-flow.md`.
- **`market-session-tracker`** — live intraday monitoring of a watchlist across pre-market → close, with breakout verification, distribution detection, tier classification, and timestamped thesis revision.

**Routing (these three overlap — pick deliberately):**
- Single name, first look, multiple dimensions → `stock-deep-dive`.
- Cross-section "where is money moving today" → `capital-rotation`.
- Live "watch this watchlist as it trades" → `market-session-tracker`.
- Only ONE lens wanted (just a quote, just news) → skip the workflow skills, call the `longbridge-*` sub-skill directly.

### Layer 3 — durable record (always the last step)

Every workflow ends by writing markdown. Do not skip this.

- `journal/YYYY-MM-DD-flow.md` — capital-rotation snapshots (scaffold: `capital-rotation/templates/rotation-snapshot.md`).
- `journal/YYYY-MM-DD-<theme>.md` — session-tracker reports (scaffold: `market-session-tracker/templates/session-report.md`).
- `journal/trump-feed/YYYY-MM-DD.md` — Trump post archive, appended idempotently by `archive.py`.
- `stocks/{SYMBOL}.md` — per-name six-lens notes; **update incrementally** on new events, do not rewrite.
- `stocks/_chain-ai-stack.md` — cross-stock map tying the tracked names along the AI-capex value chain.

## Running the data scripts

Custom skills are stdlib-only Python 3 (`/usr/bin/python3`), invoked from repo root:

```bash
python3 .claude/skills/<source>/scripts/<cmd>.py --help     # self-documenting flags
python3 .claude/skills/<source>/scripts/<cmd>.py --smoke     # connectivity self-test (use this as the "test")
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 24 --json
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --quiet
```

Shared conventions (enforced by `.claude/skills/_shared/`):
- **Output contract**: success → `{"ok": true, "data": ..., "meta": ...}` on stdout, exit 0; failure → `{"ok": false, "error": ..., "hint": ...}`, non-zero exit, diagnostics on stderr.
- **Flags**: every script supports `--help`, `--smoke`, `--verbose`; data scripts add `--fresh` (bypass cache), `--json`.
- **Credentials**: `env.py` auto-loads `.env` at repo root on import (`FRED_API_KEY`, `SEC_USER_AGENT="Name <email>"`). No manual `source` step. `.env` is git-ignored — never commit it.
- **Caching/throttle**: `client.py` caches under `~/.cache/market-intel/` and self-throttles per source (SEC 10 req/s, FRED 120 req/min, **GDELT ≥ 5 s between requests** — faster returns a plaintext rate-limit notice, not JSON).
- The `trump-truth-monitor` archive can run on a 15-min `launchd` schedule — see `.claude/skills/trump-truth-monitor/launchd/README.md`.

## Cross-cutting invariants (the reason the skills exist)

These mistakes recur; the skills encode guards against them. Apply them even when working outside a skill:

- **Anchor every number on a primary source.** Press release / 8-K / real OHLCV are primary. Longbridge `topics/*` URLs are community posts, truncated `…` headlines are leads — verify before quoting as company guidance.
- **State GAAP vs non-GAAP.** Longbridge `financial-report --kind IS` EPS is **GAAP diluted**; the Street and consensus quote **non-GAAP**. A wildly-off EPS usually means you read the GAAP field.
- **Compute QoQ alongside YoY every time.** YoY % compresses off a rising base even as absolute revenue accelerates — don't call that a slowdown.
- **Name the split.** Never write vague "市场分化 / weak / strong". Use the explicit distribution labels (机构派发 / 主力—散户背离 / 全档抛压 / 主力吸筹 / 全档吸金) and pullback tiers (1 震荡 → 4 风险传染).
- **Don't auto-agree with a directional read.** When the user says "突破 / 冲高 / 回调", re-pull the live quote and check cash high vs **pre-market high** before confirming; disagree with evidence if data contradicts.
- **Scenarios, not point predictions.** Forward calls use Bull/Base/Bear with explicit % summing to 100 and trigger conditions, revised with timestamps.

### Known data gotchas

- **Capital-flow units are ambiguous.** `capital-rotation` treats `longbridge capital` output as **万 USD**; the session-report template infers **千USD / $k**. Longbridge does not label units. Record the raw number and your inferred unit; do not silently convert.
- `.SOX.US` is unavailable on Longbridge — use `SMH` / `SOXX` ETF proxies.
- Filename date = **US session date**, not Asia local date. Re-running the same day **appends** a timestamped section; never overwrite.
- GDELT is a rolling recent-window stream, not a historical archive. The Trump RSS mirror only exposes ~5 days (~100 posts); older posts survive only if `archive.py` captured them.
