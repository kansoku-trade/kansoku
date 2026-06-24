#!/usr/bin/env python3
"""GDELT 2.0 Doc API — global multilingual news with tone.

GDELT is a rolling recent-window API, not a historical archive. Time windows
must be specified absolutely (YYYYMMDDHHMMSS) to keep journal entries
reproducible — relative `--timespan` is converted to absolute timestamps before
the call.

Throttle: ≥ 5 seconds between requests (enforced by _shared/client.py).
Output: always JSON (we append format=json; the API defaults to HTML).
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc"

LANG_ALLOWED = {
    "eng", "zho", "spa", "fra", "deu", "rus", "jpn", "kor", "ara", "por",
    "ita", "tur", "vie", "ind", "tha", "hin", "nld", "pol", "swe", "fin",
}

LANG_ALIAS = {
    "en": "eng", "zh": "zho", "ja": "jpn", "ko": "kor",
    "fr": "fra", "de": "deu", "es": "spa", "ru": "rus",
    "pt": "por", "it": "ita", "ar": "ara",
}

_TIMESPAN_RE = re.compile(r"^(\d+)([hHdDmM])$")


def parse_timespan(spec: str) -> timedelta:
    m = _TIMESPAN_RE.match(spec)
    if not m:
        raise client.ClientError(
            f"Invalid --timespan: {spec}",
            exit_code=1,
            hint="Use e.g. 24h, 7d, 1m (=30d)",
        )
    n, unit = int(m.group(1)), m.group(2).lower()
    if unit == "h":
        return timedelta(hours=n)
    if unit == "d":
        return timedelta(days=n)
    if unit == "m":
        return timedelta(days=30 * n)
    raise client.ClientError(f"Unknown unit: {unit}", exit_code=1)


def fmt_gdelt_ts(d: datetime) -> str:
    return d.strftime("%Y%m%d%H%M%S")


def normalise_langs(spec: str) -> list[str]:
    out = []
    for raw in spec.split(","):
        code = raw.strip().lower()
        code = LANG_ALIAS.get(code, code)
        if code not in LANG_ALLOWED:
            raise client.ClientError(
                f"Unsupported language code: {code}",
                exit_code=1,
                hint=f"Allowed: {', '.join(sorted(LANG_ALLOWED))}",
            )
        out.append(code)
    return out


def main() -> dict:
    p = argparse.ArgumentParser(description="GDELT 2.0 Doc API.")
    p.add_argument("query", help="Search query (GDELT DSL accepted).")
    p.add_argument(
        "--mode",
        choices=["artlist", "timelinetone", "timelinevol", "timelinevolinfo", "tonechart"],
        default="artlist",
    )
    p.add_argument("--start", help="Absolute start YYYYMMDDHHMMSS.")
    p.add_argument("--end", help="Absolute end YYYYMMDDHHMMSS.")
    p.add_argument(
        "--timespan",
        help="Relative window, e.g. 24h, 7d, 1m. Converted to abs start/end at call time.",
    )
    p.add_argument(
        "--lang",
        help="Comma-separated lang codes (eng, zho, jpn, ...). Mapped to sourcelang: query operator.",
    )
    p.add_argument("--max-records", type=int, default=75)
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return client.success({"status": "ok"}, smoke=True)

    query = args.query.strip()
    if args.lang:
        codes = normalise_langs(args.lang)
        if len(codes) == 1:
            query = f"({query}) sourcelang:{codes[0]}"
        else:
            joined = " OR ".join(f"sourcelang:{c}" for c in codes)
            query = f"({query}) ({joined})"

    now = datetime.now(timezone.utc)
    if args.start and args.end:
        start_ts, end_ts = args.start, args.end
    elif args.timespan:
        delta = parse_timespan(args.timespan)
        start_ts = fmt_gdelt_ts(now - delta)
        end_ts = fmt_gdelt_ts(now)
    else:
        start_ts = fmt_gdelt_ts(now - timedelta(hours=24))
        end_ts = fmt_gdelt_ts(now)

    params = {
        "query": query,
        "mode": args.mode,
        "format": "json",
        "startdatetime": start_ts,
        "enddatetime": end_ts,
        "maxrecords": args.max_records,
    }
    url = f"{GDELT_BASE}?{urlencode(params)}"
    resp = client.fetch(url, source="gdelt", ttl=0)

    if args.mode == "artlist":
        items = resp.get("articles", []) if isinstance(resp, dict) else []
    elif args.mode in ("timelinetone", "timelinevol", "timelinevolinfo", "tonechart"):
        items = resp.get("timeline", resp) if isinstance(resp, dict) else resp
    else:
        items = resp

    return client.success(
        items,
        mode=args.mode,
        query=query,
        window={"start": start_ts, "end": end_ts},
        max_records=args.max_records,
    )


if __name__ == "__main__":
    client.run(main)
