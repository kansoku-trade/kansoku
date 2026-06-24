#!/usr/bin/env python3
"""Search FRED series by keyword."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

FRED_BASE = "https://api.stlouisfed.org/fred"


def main() -> dict:
    p = argparse.ArgumentParser(description="Search FRED series by keyword.")
    p.add_argument("query", help="Search text, e.g. 'consumer price index'")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument(
        "--include-discontinued",
        action="store_true",
        help="Include series marked as discontinued.",
    )
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return client.success({"status": "ok"}, smoke=True)

    key = os.environ.get("FRED_API_KEY")
    if not key:
        raise client.ClientError(
            "Missing FRED_API_KEY.",
            exit_code=2,
            hint="Set FRED_API_KEY in .env at project root",
        )

    params = {
        "search_text": args.query,
        "api_key": key,
        "file_type": "json",
        "limit": args.limit,
        "order_by": "popularity",
        "sort_order": "desc",
    }
    url = f"{FRED_BASE}/series/search?{urlencode(params)}"
    resp = client.fetch(url, source="fred", ttl=24 * 3600, fresh=args.fresh)
    rows = resp.get("seriess") or []

    out = []
    for r in rows:
        discontinued = "DISCONTINUED" in (r.get("title") or "").upper()
        if discontinued and not args.include_discontinued:
            continue
        out.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "units": r.get("units_short") or r.get("units"),
            "frequency": r.get("frequency_short") or r.get("frequency"),
            "popularity": r.get("popularity"),
            "last_updated": r.get("last_updated"),
            "discontinued": discontinued,
        })

    return client.success(out, query=args.query, count_returned=len(out))


if __name__ == "__main__":
    client.run(main)
