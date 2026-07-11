# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal **US-equities trading journal**, not a software product. The repo is three things:

1. **A durable record** — dated markdown under `journal/` and per-name notes under `stocks/`, plus chart data JSON under `journal/charts/data/`. These files are the *only* persistence layer (no database).
2. **A toolchain** — custom Claude Code skills under `.claude/skills/` that pull market data and orchestrate analysis workflows. "Running" this repo means invoking a skill or one of its Python scripts, then writing the synthesis back into a journal/stock file.
3. **A chart web app** — `app/` (pnpm workspace: the kernel lives in `app/packages/core` (`@trade/core`); `server/` is a thin HTTP host (Tsuki (Hono + NestJS-style modules/DI) controllers + WS) that wraps the kernel, hosted as a single process by `main.node.ts` in production; `desktop/` is an Electron shell that embeds the same kernel and reaches it over typed IPC (`electron-ipc-decorator`) instead of HTTP; `web/` is Vite + React and picks HTTP or IPC transport by environment — `pnpm dev` runs web+server (Vite dev server proxies to the server process, neither needs a separate build step), `pnpm dev:desktop` runs web+desktop with no server process at all) renders all charts locally at `http://localhost:5199`. The server/kernel calls the longbridge CLI itself and computes every indicator in TS; charts are created via `POST /api/charts` (see `.claude/skills/chart/SKILL.md`). Realtime layer: a single WS connection (`/api/ws`) pushes live quotes (watchlist ∪ positions, pre/post/overnight aware) and 60s chart rebuilds while a page is open — persisted chart JSON stays frozen at analysis time. Daily entry point is `cd app && pnpm dev` (no build step); `pnpm start` is the production form and requires `pnpm --filter @trade/web build` first. Tests with `cd app && pnpm test`.

**Documentation language — write every document in this repo in 中文白话 (modern vernacular Chinese).** This covers journal entries, stock notes, specs, READMEs, and this file. Keep English only for tickers, API/CLI identifiers, and terms with no natural translation. This **overrides** the global "products committed to git are written in English" default (`~/.claude/CLAUDE.md`) — for this repo, written docs are 中文白话, not English and not 文言.

**对话回复也用 中文白话，不用文言。** This project overrides the global 文言 chat-reply rule (`~/.claude/CLAUDE.md`). Every reply to the user — explanations, status updates, end-of-turn summaries — is plain modern Chinese.

**少用专业术语和英文行话。** The user is a retail investor, not a finance pro. Avoid jargon (Greeks, sharpe, drawdown, beta, alpha, basis point, hedge, IV, theta, gamma, basis, carry, skew, convexity, duration, P/E expansion, multiple compression, etc.) and English finance terms when a plain phrase works. **If a term truly has no plain equivalent, write it then immediately add a short bracketed gloss in 中文白话.** Examples:
- bad: "今天 SMH 的 IV crush 比较明显"
- good: "今天 SMH 的 IV crush（财报后期权隐含波动率坍缩，简单讲就是期权价格急跌）比较明显"
- bad: "回调到 50 日均线找支撑"
- good: "回调到 50 日均线（最近 50 个交易日的平均价，常被视为中期支撑）找支撑"

Tickers (NVDA / MRVL / SMH …), CLI / API names (`longbridge`, `fred`), and file paths stay in English without gloss — those are identifiers, not jargon.

**持仓相关的事情不要问用户，直接查长桥。** When you need to know what the user holds, position size, cost basis, P&L, or account balance, **do not ask** — invoke the `longbridge-positions` / `longbridge-profit-analysis` / `longbridge-portfolio` skill (or the `longbridge` CLI directly) and read the live account. The user finds the question annoying because the answer is already in the broker. Only ask if the broker call fails or returns ambiguous data.

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
| **`options-levels`** skill | none (CBOE delayed) | per-strike option open interest（磁铁位/止损扎堆区）+ put/call ratios; per-contract quotes on Longbridge are NOT authorized for this account |

Longbridge covers price/fundamentals; the five custom skills cover Longbridge's blind spots (macro, raw filings, world news, policy speech, per-strike options positioning). Earnings dates and macro release schedules come from `longbridge finance-calendar report/macrodata` — never hand-hunt them from news. See `docs/superpowers/specs/2026-05-28-market-intel-skills-design.md` for the design rationale and full per-script interface.

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
- `journal/lessons.md` — 复盘教训清单，一行一条带日期；短线预测（`intraday-signal`）每次运行前必读，复盘产生的可执行教训必须沉淀到这里。

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
