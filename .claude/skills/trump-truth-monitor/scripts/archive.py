#!/usr/bin/env python3
"""Append-only local archive of @realDonaldTrump Truth Social posts.

Pulls the trumpstruth.org RSS feed and writes each post to a dated markdown
file under journal/trump-feed/YYYY-MM-DD.md (date keyed off post pubDate UTC).
Idempotent: each post is keyed by its mirror status_id, so re-running on the
same feed only appends posts that haven't been archived yet.

Designed to be run on a 5–15 minute schedule via launchd / cron. Survives if
trumpstruth.org goes down later by keeping a local copy of everything seen.

Usage:
    python3 archive.py                 # default journal/trump-feed/
    python3 archive.py --out /path     # custom output dir
    python3 archive.py --quiet         # exit silently when 0 new
"""
import argparse
import os
import re
import sys
from pathlib import Path

# Reuse fetch.py — same dir
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch import fetch_feed, parse_items  # type: ignore

REPO_ROOT = Path(__file__).resolve().parents[4]  # .../trade
DEFAULT_OUT = REPO_ROOT / "journal" / "trump-feed"

MIRROR_ID_RE = re.compile(r"/statuses/(\d+)")


def mirror_id(url: str | None) -> str | None:
    if not url:
        return None
    m = MIRROR_ID_RE.search(url)
    return m.group(1) if m else None


def existing_ids_in(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(MIRROR_ID_RE.findall(path.read_text(encoding="utf-8")))


def render_post(it: dict, mid: str) -> str:
    ts = it["time_dt"].strftime("%Y-%m-%d %H:%M:%S UTC") if it["time_dt"] else "?"
    topics = ", ".join(it["topics"]) or "—"
    kws = ", ".join(it["keywords"]) or "—"
    body = it["text"] or "_(empty post body — likely image/video repost)_"
    return (
        f"## {ts} · status {mid}\n"
        f"- topics: {topics}\n"
        f"- keywords: `{kws}`\n"
        f"- original: {it['original_url']}\n"
        f"- mirror:   {it['mirror_url']}\n\n"
        f"{body}\n\n---\n\n"
    )


def archive(items: list[dict], out_dir: Path) -> tuple[int, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    new_count = 0
    dupe_count = 0
    by_date: dict[str, list[tuple[dict, str]]] = {}

    for it in items:
        mid = mirror_id(it.get("mirror_url"))
        if not mid or not it["time_dt"]:
            continue
        date_str = it["time_dt"].strftime("%Y-%m-%d")
        by_date.setdefault(date_str, []).append((it, mid))

    for date_str, day_items in by_date.items():
        path = out_dir / f"{date_str}.md"
        existing = existing_ids_in(path)
        day_items.sort(key=lambda x: x[0]["time_dt"])

        chunks_to_add = []
        for it, mid in day_items:
            if mid in existing:
                dupe_count += 1
                continue
            chunks_to_add.append(render_post(it, mid))
            new_count += 1

        if not chunks_to_add:
            continue
        if not path.exists():
            header = f"# Trump's Truth — {date_str} archive\n\n"
            path.write_text(header, encoding="utf-8")
        with path.open("a", encoding="utf-8") as f:
            for c in chunks_to_add:
                f.write(c)

    return new_count, dupe_count


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    try:
        raw = fetch_feed()
    except Exception as e:
        print(f"ERROR fetching feed: {e}", file=sys.stderr)
        sys.exit(1)

    items = parse_items(raw)
    new_count, dupe_count = archive(items, args.out)
    if not args.quiet or new_count:
        print(f"archived: +{new_count} new, {dupe_count} dupes skipped (out: {args.out})")


if __name__ == "__main__":
    main()
