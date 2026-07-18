# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal **US-equities trading journal**, not a software product. The repo is three things:

1. **A durable record** — dated markdown under `journal/` and per-name notes under `stocks/`, plus chart data JSON under `journal/charts/data/`. These files are the *only* persistence layer (no database).
2. **A toolchain** — custom Claude Code skills under `.claude/skills/` that pull market data and orchestrate analysis workflows. "Running" this repo means invoking a skill or one of its Python scripts, then writing the synthesis back into a journal/stock file.
3. **A chart web app** — `app/` (pnpm workspace: the kernel lives in `app/packages/core` (`@kansoku/core`); `server/` is a thin HTTP host (Tsuki (Hono + NestJS-style modules/DI) controllers + WS) that wraps the kernel, hosted as a single process by `main.node.ts` in production; `desktop/` is an Electron shell that embeds the same kernel and reaches it over typed IPC (`electron-ipc-decorator`) instead of HTTP; `web/` is Vite + React and picks HTTP or IPC transport by environment — `pnpm dev` runs web+server (Vite dev server proxies to the server process, neither needs a separate build step), `pnpm dev:desktop` runs web+desktop with no server process at all) renders all charts locally at `http://localhost:5199`. **Open-core split (2026-07-17)**: `app/pro/` — a gitignored slot directory holding the private repo `Innei/kansoku-pro` (`@kansoku/pro`), loaded at boot via `packages/core/src/pro/loader.ts` — now provides only the paid surface (个股自动跟踪、深度研究、研究库 AI) plus license, while the free AI (自带 key 的复评、对话、AI 设置、macro 过滤、研究库浏览) has moved into open core and runs without `app/pro`; `app/packages/pro-api` stays the public types-only contract. Without `app/pro` the build is the complete free version (charts/realtime/journal + free AI all work, only the paid routes 404 and their UI hidden); `GET /api/capabilities` reports `{ pro, licensed }` unchanged. Paid-AI work therefore usually means editing `app/pro` (its own git repo — commit there separately); free-AI work lives in `packages/core`. The server/kernel calls the longbridge CLI itself and computes every indicator in TS; charts are created via `POST /api/charts` (see `.claude/skills/chart/SKILL.md`). Realtime layer: a single WS connection (`/api/ws`) pushes live quotes (watchlist ∪ positions, pre/post/overnight aware) and 60s chart rebuilds while a page is open — persisted chart JSON stays frozen at analysis time. Daily entry point is `cd app && pnpm dev` (no build step); `pnpm start` is the production form and requires `pnpm --filter @kansoku/web build` first. Tests with `cd app && pnpm test`.

**Documentation language — write every document in this repo in 中文白话 (modern vernacular Chinese).** This covers journal entries, stock notes, specs, READMEs, and this file. Keep English only for tickers, API/CLI identifiers, and terms with no natural translation. This **overrides** the global "products committed to git are written in English" default (`~/.claude/CLAUDE.md`) — for this repo, written docs are 中文白话, not English and not 文言.

**对话回复也用 中文白话，不用文言。** This project overrides the global 文言 chat-reply rule (`~/.claude/CLAUDE.md`). Every reply to the user — explanations, status updates, end-of-turn summaries — is plain modern Chinese.

**少用专业术语和英文行话** —— 细则与正反例见下方导入的纪律文件（TD-LANG-02）。

**持仓相关不要问用户，直接查长桥**（TD-BROKER-01）。

**市场范围跟随配置，默认 US**（TD-LANG-03；个人配置在 `journal/personal.md`）。

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
| **`hithink-a-share`** skill | `HITHINK_FINANCE_API_KEY` | A 股特色数据（同花顺官方 API）：涨停池带原因、连板天梯、龙虎榜、异动、热榜、官方口径财报三表与指标、A 股交易日历；只有日线无分钟线——A 股图表与实时仍走 Longbridge |

Longbridge covers price/fundamentals; the five custom skills cover Longbridge's blind spots (macro, raw filings, world news, policy speech, per-strike options positioning). Earnings dates and macro release schedules come from `longbridge finance-calendar report/macrodata` — never hand-hunt them from news. See `docs/superpowers/specs/2026-05-28-market-intel-skills-design.md` for the design rationale and full per-script interface.

### Layer 2 — orchestration workflows (the value-add)

These skills do not fetch new kinds of data; they sequence Layer-1 calls into a disciplined read and enforce anti-patterns:

- **`stock-deep-dive`** — one-pass six-lens onboarding for a name you don't know (business / fundamentals / technicals / catalysts / supply-chain-peers / audit). Dispatch lenses 1–5 in **one parallel tool block** (8–12 `longbridge` calls); lens 6 audits the result.
- **`capital-rotation`** — one-shot end-of-session scan of net flows across fixed cohorts (indices / semis / software-cloud / mega-tech), names ONE rotation narrative, writes `journal/YYYY-MM-DD-flow.md`.
- **`market-session-tracker`** — live intraday monitoring of a watchlist across pre-market → close, with breakout verification, distribution detection, tier classification, and timestamped thesis revision.
- **`trade-gate`** — trade decision gate for every buy/sell/add/trim: a six-layer scored buy funnel (hard gates + soft score, verdict bands ≥6/4–5/<4), a sell-trigger matrix reusing the user's existing rules (6/27 hold-plan lines A–D, the 11-item cycle-top checklist, the flush-not-clean reversal guard), and a patrol mode that runs the sell triggers across all live positions; every decision is logged to `journal/decisions/*.json`, reconciled against actual fills on the next run, and tallied into a violation ledger on request.

**Routing (these three overlap — pick deliberately):**
- Single name, first look, multiple dimensions → `stock-deep-dive`.
- Cross-section "where is money moving today" → `capital-rotation`.
- Live "watch this watchlist as it trades" → `market-session-tracker`.
- 买入/卖出/加仓/减仓决策，或对持仓跑卖出触发器巡检 → `trade-gate`.
- Only ONE lens wanted (just a quote, just news) → skip the workflow skills, call the `longbridge-*` sub-skill directly.

### Layer 3 — durable record (always the last step)

Every workflow ends by writing markdown. Do not skip this.

- `journal/YYYY-MM-DD-flow.md` — capital-rotation snapshots (scaffold: `capital-rotation/templates/rotation-snapshot.md`).
- `journal/YYYY-MM-DD-<theme>.md` — session-tracker reports (scaffold: `market-session-tracker/templates/session-report.md`).
- `journal/trump-feed/YYYY-MM-DD.md` — Trump post archive, appended idempotently by `archive.py`.
- `stocks/{SYMBOL}.md` — per-name six-lens notes; 增量更新，不整篇重写（TD-NOTES-01）。
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

**The invariants live in ONE place — `trading-discipline` — imported below. Do not restate them here or copy their text into any other skill.** Domain skills cite rule IDs (`TD-SOURCE-01`, `TD-GAAP-01`, …) and never duplicate the prose. Duplication drifts: on 2026-07-14 `capital-rotation/SKILL.md` was instructing a unit conversion that this file explicitly forbade.

@.claude/skills/trading-discipline/SKILL.md

The same file is injected into the in-app agents (`analyst` / `deepDive` / `chat`) by the AI prompt pipeline: `analyst` activates it in its provider-facing MessagesEngine, while `deepDive` / `chat` compose it through `app/pro/src/ai/promptPolicy.ts` (private repo — see the open-core note in "What this repo is"). Claude Code and the app therefore run on identical discipline. `@` import is a Claude Code mechanism only — the app reads the skill file directly.

### Known data gotchas

已收编进 trading-discipline，只引用不复述：`.SOX.US` 替身见 TD-PROXY-01；journal 文件名 = 美股交易日、同日追加不覆盖见 TD-JOURNAL-01；GDELT / Trump RSS 的窗口限制见 TD-WINDOW-01。
