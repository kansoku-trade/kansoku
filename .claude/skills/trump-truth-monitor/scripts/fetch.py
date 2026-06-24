#!/usr/bin/env python3
"""Fetch Donald Trump's Truth Social posts via the trumpstruth.org RSS mirror.

Returns up to ~100 most recent posts from a single feed pull (rolling ~5 days at
typical posting cadence). Classifies posts by topic keyword and emits markdown
or JSON. Stdlib only — no network deps beyond urllib.

Usage:
    python3 fetch.py                  # last 24h, market-relevant only, markdown
    python3 fetch.py --hours 48       # last 48h
    python3 fetch.py --all            # all 100 items regardless of keyword
    python3 fetch.py --json           # JSON output for further LLM consumption
    python3 fetch.py --topic tariff   # restrict to a single topic bucket
"""
import argparse
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

FEED_URL = "https://trumpstruth.org/feed"
UA = "Mozilla/5.0 (trade-journal trump-monitor)"

TOPICS = {
    "tariff_trade": [
        "tariff", "tariffs", "trade", "trades", "tradedeal", "export", "exports",
        "sanction", "sanctions", "fentanyl", "china", "chinese", "mexico",
        "canada", "canadian", "japan", "japanese", "korea", "korean", "taiwan",
        "taiwanese", "vietnam", "india", "indian", "brazil", "european union",
        "imf", "wto", "rare earth", "embargo", "embargoes",
    ],
    "semi_tech": [
        "semiconductor", "semiconductors", "chip", "chips", "fab", "fabs",
        "foundry", "nvidia", "intel", "tsmc", "amd", "samsung", "asml",
        "qualcomm", "apple", "tesla", "amazon", "google", "meta", "microsoft",
        "musk", "huawei", "smic",
    ],
    "energy": [
        "oil", "gas", "opec", "saudi", "drill", "drilling", "lng", "pipeline",
        "energy", "gasoline", "exxon", "chevron", "shale", "coal",
    ],
    "fed_macro": [
        "fed", "powell", "rate", "rates", "interest", "recession", "inflation",
        "treasury", "bond", "bonds", "dollar", "yield", "yields", "bank",
        "banks", "fdic", "federal reserve",
    ],
    "crypto": [
        "crypto", "bitcoin", "btc", "ethereum", "stablecoin", "blockchain",
        "digital asset",
    ],
    "geopolitical": [
        "iran", "russia", "russian", "ukraine", "ukrainian", "nato", "israel",
        "israeli", "hamas", "hezbollah", "war", "missile", "missiles",
        "military", "venezuela", "north korea", "syria", "afghanistan", "navy",
        "marines", "putin", "zelensky", "netanyahu", "kim jong",
    ],
}

NS = {"truth": "https://truthsocial.com/ns"}


def fetch_feed(url: str = FEED_URL) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def clean_text(raw: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))
    return re.sub(r"\s+", " ", text).strip()


_KEYWORD_RE_CACHE: dict[str, re.Pattern] = {}


def _kw_pattern(kw: str) -> re.Pattern:
    if kw not in _KEYWORD_RE_CACHE:
        if " " in kw:
            pat = re.escape(kw)
        else:
            pat = r"\b" + re.escape(kw) + r"\b"
        _KEYWORD_RE_CACHE[kw] = re.compile(pat, re.IGNORECASE)
    return _KEYWORD_RE_CACHE[kw]


def classify(text: str) -> list[tuple[str, str]]:
    """Return list of (topic, matched_keyword) — keeps audit trail for debugging."""
    hits = []
    for topic, kws in TOPICS.items():
        for k in kws:
            if _kw_pattern(k).search(text):
                hits.append((topic, k))
                break
    return hits


def parse_items(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.findall(".//item"):
        pub_raw = it.findtext("pubDate") or ""
        try:
            pub_dt = parsedate_to_datetime(pub_raw).astimezone(timezone.utc)
        except Exception:
            pub_dt = None
        desc = it.findtext("description") or ""
        title = it.findtext("title") or ""
        text = clean_text(desc) or clean_text(title)
        orig = it.find("truth:originalUrl", NS)
        hits = classify(text)
        out.append({
            "id": it.findtext("guid") or it.findtext("link"),
            "time_utc": pub_dt.isoformat() if pub_dt else None,
            "time_dt": pub_dt,
            "mirror_url": it.findtext("link"),
            "original_url": orig.text if orig is not None else None,
            "text": text,
            "topics": sorted({t for t, _ in hits}),
            "keywords": sorted({k for _, k in hits}),
        })
    return out


def filter_items(items, hours: int | None, topic: str | None, want_all: bool):
    cutoff = None
    if hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    out = []
    for it in items:
        if cutoff and it["time_dt"] and it["time_dt"] < cutoff:
            continue
        if topic and topic not in it["topics"]:
            continue
        if not want_all and not it["topics"]:
            continue
        out.append(it)
    return out


def render_markdown(items, hours: int | None) -> str:
    lines = []
    win = f"last {hours}h" if hours is not None else "all available"
    lines.append(f"# Trump's Truth — market-relevant feed ({win})")
    lines.append(f"Source: trumpstruth.org/feed · pulled {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Posts matched: {len(items)}\n")
    if not items:
        lines.append("_No matching posts in window._")
        return "\n".join(lines)
    for it in items:
        ts = it["time_dt"].strftime("%Y-%m-%d %H:%M UTC") if it["time_dt"] else "?"
        topics = ", ".join(it["topics"]) or "—"
        kws = ", ".join(it["keywords"]) or "—"
        body = it["text"]
        if len(body) > 800:
            body = body[:800] + "…"
        lines.append(f"## {ts} · {topics}")
        lines.append(f"- Matched keywords: `{kws}`")
        lines.append(f"- Mirror: {it['mirror_url']}")
        lines.append(f"- Original: {it['original_url']}")
        lines.append(f"\n> {body}\n")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--all", action="store_true", help="ignore keyword filter")
    ap.add_argument("--topic", choices=list(TOPICS.keys()), default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    try:
        raw = fetch_feed()
    except Exception as e:
        print(f"ERROR fetching feed: {e}", file=sys.stderr)
        sys.exit(1)

    items = parse_items(raw)
    items = filter_items(items, args.hours, args.topic, args.all)

    if args.json:
        out = [{k: v for k, v in it.items() if k != "time_dt"} for it in items]
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(render_markdown(items, args.hours))


if __name__ == "__main__":
    main()
