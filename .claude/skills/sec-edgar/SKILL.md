---
name: sec-edgar
description: US SEC EDGAR filings — list 10-K/10-Q/8-K/Form 4/S-1, fetch filing text, parse insider Form 4 transactions.
---

# sec-edgar

> Response language: match user input.

## When to use

Trigger phrases:
- 8-K / 10-K / 10-Q / Form 4 / S-1 / proxy / DEF 14A
- 美股公告 / SEC filing / EDGAR
- insider trading / 内部人交易 / 高管交易
- 财报原文 / 招股书 / 风险因素 / MD&A

**Not for**: 13F holdings analysis (this skill lists 13F filings but does not
parse them into holdings — deferred to a future skill).

## Workflow

1. **List filings**: `filings.py <TICKER>` (optionally `--type 8-K`).
2. **Read filing text**: pass `primary_doc_url` from the list output to
   `filing_text.py`. Use `--max-chars` to cap; `--section item1a` for risk
   factors, `--section mda` (Item 7) for MD&A.
3. **Insider trades**: `insider.py <TICKER>` parses Form 4 XML for the
   past --days window.

Environment auto-loaded; `SEC_USER_AGENT` is mandatory.

## CLI examples

```bash
# Latest 5 NVDA 8-Ks
python3 .claude/skills/sec-edgar/scripts/filings.py NVDA --type 8-K --limit 5

# All recent NVDA filings
python3 .claude/skills/sec-edgar/scripts/filings.py NVDA --limit 20

# Read the most recent 8-K (URL from filings.py)
python3 .claude/skills/sec-edgar/scripts/filing_text.py \
  "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/nvda-20260520.htm" \
  --max-chars 20000

# Pull Item 1A (Risk Factors) from a 10-K
python3 .claude/skills/sec-edgar/scripts/filing_text.py "<10-K URL>" --section item1a

# Save full text to disk, get metadata only
python3 .claude/skills/sec-edgar/scripts/filing_text.py "<URL>" --save-raw /tmp/nvda-10k.txt

# Insider transactions, past 90 days
python3 .claude/skills/sec-edgar/scripts/insider.py NVDA --days 90

# Insider + amendments
python3 .claude/skills/sec-edgar/scripts/insider.py NVDA --include-amendments
```

## Section keys (10-K)

| Key | 10-K section |
|---|---|
| `item1` / `business` | Item 1. Business |
| `item1a` / `risk` | Item 1A. Risk Factors |
| `item7` / `mda` | Item 7. MD&A |
| `item7a` | Item 7A. Quantitative & Qualitative Disclosures |
| `item8` | Item 8. Financial Statements |

`meta.confidence` returned: `high` (clean heading match), `medium` (short
slice, may be incomplete), `low` (heuristic fallback — full text returned
with warning).

## Output shapes

`filings.py`:
```json
{
  "ok": true,
  "data": [{
    "accession": "0001045810-26-000051",
    "cik": "0001045810",
    "form": "8-K",
    "filed_date": "2026-05-20",
    "primary_doc_url": "https://www.sec.gov/Archives/edgar/data/1045810/...htm",
    "primary_doc_name": "nvda-20260520.htm",
    "description": "8-K",
    "size": 637530,
    "is_xbrl": true
  }],
  "meta": {"cik": "0001045810", "name": "NVIDIA CORP", "count_returned": 1}
}
```

`insider.py`:
```json
{
  "ok": true,
  "data": [{
    "accession": "...",
    "form": "4",
    "filed_date": "2026-05-15",
    "reporter": "JEN-HSUN HUANG",
    "roles": ["officer:CEO", "director"],
    "txn_date": "2026-05-13",
    "security_title": "Common Stock",
    "code": "S",
    "shares": 240000,
    "price": 412.50,
    "acquire_or_dispose": "D",
    "post_holdings": 78000000,
    "ownership_kind": "D",
    "derivative": false,
    "footnote_ids": ["F1"],
    "footnotes_text": ["Sale pursuant to 10b5-1 plan adopted ..."]
  }],
  "meta": {"cik": "...", "name": "...", "filings_scanned": 12, "txns_parsed": 24}
}
```

## Error handling

| Exit code | Meaning | LLM action |
|---|---|---|
| 0 | Success | Parse and narrate. |
| 2 | Missing `SEC_USER_AGENT` | Set in `.env` at project root. |
| 3 | HTTP 4xx, ticker not found, or unparseable XML | Read `hint`. Per-filing parse errors collected in `meta.parse_errors`. |
| 4 | Network | Suggest retry. |

## Known limitations

- `insider.py` only scans the `recent` window of submissions (typically last
  ~1000 filings); deep history requires `submissions/CIK*-N.json` paging,
  not implemented.
- `filing_text.py` uses an HTML-only extractor — XBRL inline tables are
  stripped to text, not parsed into structured rows.
- Section slicing is regex-heuristic; trust `meta.confidence`.
- 10 req/s throttle applied globally across all `*.sec.gov` calls.

## Related skills

- `longbridge-financial-report` for normalised income / balance / cash flow.
- `longbridge-news` for curated equity news (faster than reading 8-Ks).
- `quiver` for congressional trades (distinct from corporate insiders).
