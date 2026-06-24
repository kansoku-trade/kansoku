---
name: fred
description: US/global macro time series from St. Louis Fed FRED — CPI, GDP, Fed funds, yields, M2, DXY, etc.
---

# fred

> Response language: match user input (zh-CN / zh-TW / en).

## When to use

Trigger phrases:
- CPI / core CPI / PCE / PPI / inflation / 通胀 / 核心通胀
- GDP / 国内生产总值
- unemployment / 失业率 / U-3 / U-6 / nonfarm / 非农
- Fed funds / 联储利率 / SOFR
- 2Y / 10Y yield / yield curve / 美债利率 / 收益率曲线
- M1 / M2 / 货币供应
- DXY / 美元指数 / USD index
- VIX / 10Y breakeven / 通胀预期
- WTI / Brent / 油价 / gold
- consumer sentiment / 消费者信心 / housing starts / retail sales

## Workflow

1. Resolve user phrasing to a FRED series ID — first via `aliases.json` (curated), then `search.py` if no alias matches.
2. Run `series.py <SERIES_ID|alias>` for observations + metadata.
3. Synthesise NL reply with units, frequency, and last update date; cite "Source: St. Louis Fed (FRED)".

Environment is auto-loaded on script import from `.env` at project root (or `~/.config/market-intel/env` as fallback) — no manual `source` needed.

## CLI examples

```bash
# Latest 60 monthly CPI observations
python3 .claude/skills/fred/scripts/series.py CPI

# 2Y Treasury yield, last 30 daily observations
python3 .claude/skills/fred/scripts/series.py "2Y yield" --limit 30

# 10-year breakeven inflation, custom window, ascending
python3 .claude/skills/fred/scripts/series.py T10YIE --start 2024-01-01 --order asc

# Discover series IDs
python3 .claude/skills/fred/scripts/search.py "consumer price index" --limit 10

# Bypass cache
python3 .claude/skills/fred/scripts/series.py CPI --fresh
```

## Output shape

```json
{
  "ok": true,
  "data": [{"date": "2026-04-01", "value": 314.2}, ...],
  "meta": {
    "series_id": "CPIAUCSL",
    "title": "Consumer Price Index for All Urban Consumers: All Items",
    "units": "Index 1982-1984=100",
    "frequency": "Monthly",
    "seasonal_adjustment": "SA",
    "last_updated": "2026-05-13 07:36:01-05",
    "count_returned": 60,
    "alias_resolved": "CPI"
  }
}
```

## Available aliases

See `aliases.json` for the curated CN/EN → series ID map. Common ones:

| Alias | Series ID |
|---|---|
| CPI | CPIAUCSL |
| core CPI / 核心 CPI | CPILFESL |
| PCE | PCEPI |
| GDP | GDPC1 |
| unemployment / 失业率 | UNRATE |
| nonfarm / 非农 | PAYEMS |
| Fed funds / 联储利率 | DFF |
| 10Y yield / 美债 10 年 | DGS10 |
| yield curve | T10Y2Y |
| DXY / 美元指数 | DTWEXBGS |
| M2 | M2SL |
| VIX | VIXCLS |
| 10Y breakeven / 通胀预期 | T10YIE |

If the user's phrase isn't in the map, fall back to `search.py "<query>"` and pick the highest-popularity non-discontinued result.

## Error handling

| Exit code | Meaning | LLM action |
|---|---|---|
| 0 | Success | Parse `data`, narrate. |
| 2 | Missing `FRED_API_KEY` | Tell user to register at https://fred.stlouisfed.org/docs/api/api_key.html and add to `.env` at project root. |
| 3 | HTTP 4xx or non-JSON | Surface error from `hint`. |
| 4 | Network | Suggest retry. |

## Known limitations

- Daily series may have weekend/holiday gaps (FRED returns NaN as `.`; we normalise to `null`).
- "Discontinued" series filtered by default in `search.py` — use `--include-discontinued` to override.
- Series metadata cache TTL 24 h; observation cache TTL 1 h. Use `--fresh` for the latest.

## Related skills

- `longbridge-quote` for live equity quotes.
- `gdelt` for narrative / sentiment context.
- `sec-edgar` for individual-company filings.
