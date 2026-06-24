---
name: trump-truth-monitor
description: Use when monitoring or interpreting Donald Trump's Truth Social posts for market-moving events — tariff announcements, sanctions, deals with countries (China / Mexico / Canada / EU / Japan / Korea / Taiwan), specific company / CEO mentions, Fed pressure, energy / oil commentary, crypto policy, or geopolitical escalation. Triggers on "trump 发了什么", "check trump", "trump 关税", "盘前 trump 推", "trump truth social", "trump tweet impact", "trump 对 X 说了什么", or whenever a pre-market gap / intraday spike on policy-sensitive names (semis, China ADRs, autos, energy, banks, defense) needs to be explained.
---

# Trump Truth Monitor

Pulls Donald Trump's Truth Social feed via the trumpstruth.org RSS mirror, classifies posts into market-relevant topic buckets, and hands the candidate list off for LLM-level market-impact grading.

## When to use

- User asks what Trump has posted recently
- Pre-market gap on policy-sensitive sectors (semis, China ADRs, autos, energy, banks, defense) — check whether a Trump post is the trigger
- Building the "Catalyst (now)" lens of `stock-deep-dive` for a name with policy exposure (TSM, NVDA, AAPL, F, GM, XOM, BAC, RTX, LMT)
- `market-session-tracker` pre-market protocol — add a Trump-feed pass

If the user wants tweet **history beyond ~5 days**, this skill is insufficient — the RSS mirror only exposes the latest ~100 posts. Route to Factba.se / Roll Call (paid) or note the limitation explicitly.

## Data source

**trumpstruth.org/feed** — a public third-party mirror of @realDonaldTrump on Truth Social. RSS 2.0 XML with these fields per item:

| Field | Meaning |
|---|---|
| `<pubDate>` | RFC 2822, original Truth Social post timestamp |
| `<link>` | trumpstruth.org/statuses/{mirror_id} |
| `<truth:originalUrl>` | truthsocial.com/@realDonaldTrump/{truth_id} — **the primary source** |
| `<description>` | Full post body with HTML (links + ellipsis spans) |

The mirror typically lags the original by ≤2 minutes. Single feed pull returns ~100 most recent posts, covering ~5 days at Trump's typical cadence.

## CLI

### Read mode — `fetch.py`

```bash
# Default: last 24h, keyword-filtered, markdown
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py

# Wider window
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 72

# All posts in feed regardless of keyword
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --hours 72 --all

# Single topic
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --topic tariff_trade

# JSON output (for chaining)
python3 .claude/skills/trump-truth-monitor/scripts/fetch.py --json
```

Topic buckets defined in script: `tariff_trade`, `semi_tech`, `energy`, `fed_macro`, `crypto`, `geopolitical`.

### Archive mode — `archive.py`

```bash
# Append new posts to journal/trump-feed/YYYY-MM-DD.md (idempotent)
python3 .claude/skills/trump-truth-monitor/scripts/archive.py

# Custom output dir
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --out /path/to/dir

# Silent unless something new was added
python3 .claude/skills/trump-truth-monitor/scripts/archive.py --quiet
```

The archive de-dupes by mirror status_id — re-running on the same feed is a no-op. Designed to be scheduled (see `launchd/README.md`). Once archived, posts persist locally even if trumpstruth.org goes down.

## Workflow

1. **Decide window**. Default 24h. Use 48–72h when investigating a multi-day move. Use `--all` when context-grazing.
2. **Decide scope**. If user asks generally → no `--topic`. If user names a domain (关税 / 半导体 / 油 / 加密) → pass `--topic`.
3. **Pull feed**. Run `fetch.py` with chosen flags. **Always include `--hours`** — never default to "all of feed" silently.
4. **Second-pass grading**. Script output is *candidates*, not signals. For each post:
   - **Read the full text** before assigning impact. Headlines and keyword tags lie.
   - Assign a **market-impact tier**: `high` / `med` / `low` / `noise`
   - **high** = concrete action with $ figure, %, date, named country/company (e.g. "25% tariff on Mexican imports effective June 1", "Section 232 on chips")
   - **med** = directional signal without specifics (e.g. "We'll be tough on China", "must invest in America")
   - **low** = brand alignment with sector (e.g. "American Energy DOMINANCE", "Crypto Capital of the World" — already-priced policy stance)
   - **noise** = keyword matched but body is endorsement / personal / off-topic (e.g. "support the Military" in a Senate endorsement)
5. **Anchor on original URL**. When quoting, always cite `truth:originalUrl` (the truthsocial.com link), not the mirror.
6. **Render output**. For multi-post stretches, group by tier — high first, then med, then a one-line low/noise tally.

## Output template

```
# Trump's Truth — {WINDOW}

## High-impact (potential market mover)
- [{utc_time}] {one-line summary} — `tier: high` · {topic tags}
  > "{verbatim short quote ≤2 sentences}"
  - Original: {truthsocial.com URL}
  - Possible market read: {sector / ticker level expectation, anchored}

## Medium-impact (directional, no specifics)
- [{utc_time}] {one-line summary}
  - Original: {URL}

## Noise (matched keyword, low signal)
- {N} posts ({topic distribution}) — endorsements / personal — not enumerated

⚠ Trump may delete or contradict within hours. Position decisions should require independent confirmation (sector ETF tape, peer reaction, official release).
```

## Anti-patterns

| Mistake | Reality |
|---|---|
| Treating script output as "market signal" | Script is a keyword filter. LLM must read each post and tier. |
| Quoting a mirror URL as the source | Always link `truth:originalUrl` (truthsocial.com). Mirror is a convenience. |
| Reporting Senate endorsements as "policy news" | Politics-only posts with `military` / `energy` keywords are noise — filter at tier=noise. |
| "Trump said X about Y" with no link | Always include the truthsocial.com link. User must be able to verify. |
| Pretending tweets are durable | Trump posts can be deleted or retracted within hours. If consulted >12h after, note staleness. |

## Integration

- **`market-session-tracker`** pre-market protocol: insert a Trump-feed `--hours 14` pull as step 0 (covers post-prev-close to pre-market). If `high`-tier post exists touching watchlist sectors, escalate to the explanation slot for any gap.
- **`stock-deep-dive`** lens 4 (Catalysts): when the symbol has policy exposure (semis / China ADR / auto / energy / defense / bank), run a Trump-feed `--hours 168` and surface `high`-tier hits.
- **`gdelt`** can confirm market has already picked the post up (i.e. major outlets are reporting it). Trump feed = original; GDELT = market-validated.

## Limitations

- **Mirror dependency**: trumpstruth.org is third-party. If it goes down, the live `fetch.py` fails — but the archived posts under `journal/trump-feed/` remain readable.
- **5-day depth via mirror**: a single feed pull only exposes the last ~100 posts. Anything older than ~5 days that wasn't archived in time is lost. Schedule `archive.py` (see `launchd/`) to grow a permanent local record.
- **No X feed**: Trump's X (Twitter) account is separate. This skill does **not** cover X posts. If user asks about X specifically, note the gap.
- **Truth posts are not press releases**. Treat as primary-but-volatile speech: original URL is authoritative for what was said, but the policy implementation may diverge (or never happen).

## Local archive — searching past posts

Once `archive.py` has been running, `journal/trump-feed/YYYY-MM-DD.md` accumulates a complete record. To investigate a past day or query historically:

```bash
# All tariff-related posts ever archived
grep -l "tariff" journal/trump-feed/*.md

# Specific company mention
grep -B2 -A8 -i "nvidia\|tsmc" journal/trump-feed/*.md

# Posts on a specific date
cat journal/trump-feed/2026-05-26.md
```

The archive is plain markdown — grep-friendly, git-trackable.

## Related skills

- `gdelt` — market-validated news coverage of a Trump post
- `stock-deep-dive` — caller for catalyst-lens enrichment
- `market-session-tracker` — caller for pre-market protocol
- `sec-edgar` — confirm whether a tweet translates into an actual filing (rare but does happen for trade-policy items affecting specific companies)
