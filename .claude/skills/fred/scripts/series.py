#!/usr/bin/env python3
"""Fetch a FRED economic series with observations + metadata.

Resolves alias names (e.g. "CPI", "10Y yield", "失业率") against aliases.json
before falling back to the literal series ID.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]  # .claude/skills/
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

FRED_BASE = "https://api.stlouisfed.org/fred"
ALIASES_PATH = Path(__file__).resolve().parents[1] / "aliases.json"


def load_aliases() -> dict[str, str]:
    if not ALIASES_PATH.exists():
        return {}
    with open(ALIASES_PATH, encoding="utf-8") as f:
        return json.load(f)


def resolve(name: str, aliases: dict[str, str]) -> str:
    if name in aliases:
        return aliases[name]
    lower = {k.lower(): v for k, v in aliases.items()}
    if name.lower() in lower:
        return lower[name.lower()]
    return name


def normalise_value(v: str) -> float | None:
    if v == "." or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> dict:
    p = argparse.ArgumentParser(description="FRED series observations + metadata.")
    p.add_argument("series", help="FRED series ID or alias (e.g. CPIAUCSL, CPI, 10Y yield)")
    p.add_argument("--start", help="Observation start YYYY-MM-DD")
    p.add_argument("--end", help="Observation end YYYY-MM-DD")
    p.add_argument("--limit", type=int, default=60)
    p.add_argument("--order", choices=["asc", "desc"], default="desc")
    p.add_argument("--fresh", action="store_true", help="Bypass cache.")
    p.add_argument("--smoke", action="store_true", help="Connectivity self-test.")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    if args.smoke:
        # Smoke test: ping the search endpoint with a known query, ignore key.
        key = os.environ.get("FRED_API_KEY")
        if not key:
            return client.failure(
                "Missing FRED_API_KEY.",
                "Set FRED_API_KEY in .env at project root",
            )
        url = f"{FRED_BASE}/series?series_id=CPIAUCSL&api_key={key}&file_type=json"
        client.fetch(url, source="fred", ttl=0)
        return client.success({"status": "ok"}, smoke=True)

    key = os.environ.get("FRED_API_KEY")
    if not key:
        raise client.ClientError(
            "Missing FRED_API_KEY.",
            exit_code=2,
            hint="Set FRED_API_KEY in .env at project root",
        )

    aliases = load_aliases()
    series_id = resolve(args.series, aliases)
    matched_alias = series_id != args.series

    meta_params = {"series_id": series_id, "api_key": key, "file_type": "json"}
    meta_url = f"{FRED_BASE}/series?{urlencode(meta_params)}"
    meta_resp = client.fetch(meta_url, source="fred", ttl=24 * 3600, fresh=args.fresh)
    series_meta_list = meta_resp.get("seriess") or []
    if not series_meta_list:
        raise client.ClientError(
            f"FRED series not found: {series_id}",
            exit_code=3,
            hint="Try `search.py <query>` to discover series IDs.",
        )
    sm = series_meta_list[0]

    obs_params = {
        "series_id": series_id,
        "api_key": key,
        "file_type": "json",
        "limit": args.limit,
        "sort_order": args.order,
    }
    if args.start:
        obs_params["observation_start"] = args.start
    if args.end:
        obs_params["observation_end"] = args.end
    obs_url = f"{FRED_BASE}/series/observations?{urlencode(obs_params)}"
    obs_resp = client.fetch(obs_url, source="fred", ttl=3600, fresh=args.fresh)

    observations = [
        {"date": o["date"], "value": normalise_value(o["value"])}
        for o in obs_resp.get("observations", [])
    ]

    meta = {
        "series_id": sm.get("id"),
        "title": sm.get("title"),
        "units": sm.get("units_short") or sm.get("units"),
        "frequency": sm.get("frequency_short") or sm.get("frequency"),
        "seasonal_adjustment": sm.get("seasonal_adjustment_short")
        or sm.get("seasonal_adjustment"),
        "last_updated": sm.get("last_updated"),
        "popularity": sm.get("popularity"),
        "count_returned": len(observations),
        "alias_resolved": args.series if matched_alias else None,
    }
    return client.success(observations, **meta)


if __name__ == "__main__":
    client.run(main)
