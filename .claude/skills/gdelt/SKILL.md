---
name: gdelt
description: Global multilingual news event stream with tone scoring via GDELT 2.0 Doc API.
---

# gdelt

> Response language: match user input.

> ⚠️ **GDELT is a rolling recent-window API**, not a historical event archive.
> Time windows are anchored to absolute timestamps (UTC) for reproducibility —
> the same query asked tomorrow will return different results.
>
> ⚠️ **5-second throttle** between requests (enforced). Plan batches accordingly.

## When to use

Trigger phrases:
- 全球新闻 / 全球事件 / 多语种新闻
- 媒体 tone / sentiment trend / 国际关系
- geopolitical / event tone
- GDELT

Useful for "what is the world saying about X right now" — i.e. retrieving
articles from non-English / non-financial sources that don't surface in
Longbridge's curated newsfeed.

## Workflow

1. Build a query in GDELT DSL (the user's term, optionally with operators like
   `domain:bloomberg.com`, `sourcelang:eng`).
2. Pick a mode:
   - `artlist` — list of articles (default).
   - `timelinetone` — per-15-min tone time series (-10 = very negative,
     +10 = very positive).
   - `timelinevol` / `timelinevolinfo` — article volume over time.
   - `tonechart` — tone histogram.
3. Specify the window — prefer `--start`/`--end` (absolute), fall back to
   `--timespan`. The script converts relative timespans to absolute timestamps
   before the call and echoes them in `meta.window` so the journal can be
   re-run.

## CLI examples

```bash
# Articles about Nvidia in the last 24h
python3 .claude/skills/gdelt/scripts/doc.py "Nvidia"

# 7-day window, English + Chinese articles about TSMC
python3 .claude/skills/gdelt/scripts/doc.py "TSMC OR \"Taiwan Semiconductor\"" --timespan 7d --lang eng,zho

# Tone timeline for Federal Reserve over 30 days
python3 .claude/skills/gdelt/scripts/doc.py "Federal Reserve" --mode timelinetone --timespan 30d

# Absolute window
python3 .claude/skills/gdelt/scripts/doc.py "AI chips" --start 20260501000000 --end 20260528000000
```

## Output shape (artlist)

```json
{
  "ok": true,
  "data": [
    {
      "url": "https://...",
      "title": "...",
      "seendate": "20260527T161500Z",
      "domain": "...",
      "language": "English",
      "sourcecountry": "United States",
      "socialimage": "..."
    }
  ],
  "meta": {
    "mode": "artlist",
    "query": "Nvidia",
    "window": {"start": "20260527071804", "end": "20260528071804"},
    "max_records": 75
  }
}
```

## Output shape (timelinetone)

```json
{
  "ok": true,
  "data": [
    {"date": "20260520T000000Z", "value": 1.42},
    {"date": "20260520T001500Z", "value": 1.05},
    ...
  ],
  "meta": {"mode": "timelinetone", ...}
}
```

## Error handling

| Exit code | Meaning | LLM action |
|---|---|---|
| 0 | Success | Parse `data`. |
| 1 | Invalid args (e.g. bad timespan / lang) | Read `hint`. |
| 3 | HTTP 4xx / non-JSON response | If body contains "Please limit requests", the throttle was tripped — wait and retry. |
| 4 | Network | Suggest retry. |

## Known limitations

- 5-second minimum between requests; batch tone + artlist queries must be
  sequenced.
- `--max-records` cap is 250.
- GDELT's tone metric is a heuristic — useful for direction-of-narrative, not
  ground truth.
- Results are not cached (window-sensitive).

## Related skills

- `longbridge-news` for curated equity-specific newsfeed (Chinese-language UX).
- `sec-edgar` for primary-source filings as the contrast to media narrative.
- `fred` for macro data referenced in the narrative.
