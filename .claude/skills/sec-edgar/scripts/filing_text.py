#!/usr/bin/env python3
"""Fetch a filing's primary document and return plain text.

Accepts either a primary document URL (preferred) or --cik + --accession;
in the latter case looks up the primary document via the submissions JSON.

Default returns the full extracted plain text capped at --max-chars (default
50000), with a truncation flag in meta. --save-raw writes the unbounded text
to a file and returns only metadata + cache path.

--section item1|item1a|item7|item7a|item8 runs a regex slice on 10-K item
headings and returns just that section plus a confidence label.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402
import _edgar  # noqa: E402


class TextExtractor(HTMLParser):
    SKIP_TAGS = {"script", "style", "head"}

    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif tag in ("p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            self.parts.append(data)

    def get_text(self) -> str:
        raw = "".join(self.parts)
        raw = re.sub(r"[ \t ]+", " ", raw)
        raw = re.sub(r"\n\s*\n+", "\n\n", raw)
        return raw.strip()


SECTION_PATTERNS = {
    "item1":  (r"Item\s*1\b(?!\s*[Aa])\.?", r"Item\s*1\s*A\b"),
    "item1a": (r"Item\s*1\s*A\.?", r"Item\s*1\s*B\b|Item\s*2\b"),
    "item7":  (r"Item\s*7\b(?!\s*[Aa])\.?", r"Item\s*7\s*A\b"),
    "item7a": (r"Item\s*7\s*A\.?", r"Item\s*8\b"),
    "item8":  (r"Item\s*8\.?", r"Item\s*9\b"),
    "mda":    (r"Item\s*7\b(?!\s*[Aa])\.?", r"Item\s*7\s*A\b"),
    "risk":   (r"Item\s*1\s*A\.?", r"Item\s*1\s*B\b|Item\s*2\b"),
    "business": (r"Item\s*1\b(?!\s*[Aa])\.?", r"Item\s*1\s*A\b"),
}


def slice_section(text: str, key: str) -> tuple[str, str]:
    if key not in SECTION_PATTERNS:
        return text, "unknown"
    start_pat, end_pat = SECTION_PATTERNS[key]
    starts = list(re.finditer(start_pat, text, re.IGNORECASE))
    if len(starts) < 2:
        return text, "low"
    start_pos = starts[1].start()
    end_match = re.search(end_pat, text[start_pos + 10 :], re.IGNORECASE)
    if not end_match:
        return text[start_pos:], "low"
    end_pos = start_pos + 10 + end_match.start()
    confidence = "high" if (end_pos - start_pos) > 1000 else "medium"
    return text[start_pos:end_pos].strip(), confidence


def main() -> dict:
    p = argparse.ArgumentParser(description="Fetch SEC filing text.")
    p.add_argument("primary_doc_url", nargs="?", help="Primary doc URL from filings.py.")
    p.add_argument("--cik", help="Padded or unpadded CIK.")
    p.add_argument("--accession", help="Accession number (with dashes).")
    p.add_argument("--max-chars", type=int, default=50_000)
    p.add_argument("--save-raw", help="Write full text to this path.")
    p.add_argument(
        "--section",
        choices=list(SECTION_PATTERNS.keys()),
        help="Slice a specific 10-K item heading.",
    )
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return client.success({"status": "ok"}, smoke=True)

    url = args.primary_doc_url
    if not url:
        if not (args.cik and args.accession):
            raise client.ClientError(
                "Must pass primary_doc_url, or --cik + --accession.",
                exit_code=1,
                hint="Get the URL from filings.py output.",
            )
        cik = args.cik.zfill(10)
        sub = _edgar.submissions(cik, fresh=args.fresh)
        recent = sub.get("filings", {}).get("recent", {})
        accs = recent.get("accessionNumber", [])
        docs = recent.get("primaryDocument", [])
        try:
            idx = accs.index(args.accession)
        except ValueError:
            raise client.ClientError(
                f"Accession {args.accession} not in recent submissions for CIK {cik}.",
                exit_code=3,
                hint="Check older filings via the SEC website.",
            )
        url = _edgar.primary_doc_url(cik, args.accession, docs[idx])

    ttl = 0 if args.no_cache else 365 * 24 * 3600
    raw = client.fetch(
        url,
        source="sec",
        ttl=ttl,
        headers=_edgar.ua_headers(),
        parse_json=False,
        fresh=args.fresh,
    )

    parser = TextExtractor()
    parser.feed(raw)
    text = parser.get_text()
    full_len = len(text)

    confidence = None
    section_key = args.section
    if section_key:
        text, confidence = slice_section(text, section_key)
        if confidence == "low":
            sys.stderr.write(
                f"[warn] section slice '{section_key}' confidence=low; returning best-effort excerpt\n"
            )

    saved_path = None
    if args.save_raw:
        save_path = Path(args.save_raw).expanduser()
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_text(text, encoding="utf-8")
        saved_path = str(save_path)
        body = ""
        truncated = False
    else:
        truncated = len(text) > args.max_chars
        body = text[: args.max_chars] if truncated else text

    return client.success(
        {"text": body, "section": section_key},
        primary_doc_url=url,
        full_char_count=full_len,
        returned_char_count=len(body),
        truncated=truncated,
        max_chars=args.max_chars,
        save_path=saved_path,
        confidence=confidence,
    )


if __name__ == "__main__":
    client.run(main)
