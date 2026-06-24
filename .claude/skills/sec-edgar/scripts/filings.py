#!/usr/bin/env python3
"""List recent SEC filings for a company."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402
import _edgar  # noqa: E402


def main() -> dict:
    p = argparse.ArgumentParser(description="List recent SEC filings for a company.")
    p.add_argument("symbol", help="Ticker or numeric CIK.")
    p.add_argument(
        "--type",
        help="Filter form type (e.g. 8-K, 10-K, 10-Q, 4, S-1). Repeatable as comma list.",
    )
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return client.success({"status": "ok"}, smoke=True)

    cik, name = _edgar.resolve_cik(args.symbol, fresh=args.fresh)
    sub = _edgar.submissions(cik, fresh=args.fresh)
    recent = sub.get("filings", {}).get("recent", {})
    if not recent:
        return client.success([], cik=cik, name=name, note="no filings")

    accs = recent.get("accessionNumber", [])
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    docs = recent.get("primaryDocument", [])
    descs = recent.get("primaryDocDescription", [])
    sizes = recent.get("size", [])
    is_xbrl = recent.get("isXBRL", [])

    wanted = None
    if args.type:
        wanted = {t.strip().upper() for t in args.type.split(",") if t.strip()}

    out = []
    for i, form in enumerate(forms):
        if wanted and form.upper() not in wanted:
            continue
        acc = accs[i] if i < len(accs) else ""
        doc = docs[i] if i < len(docs) else ""
        url = _edgar.primary_doc_url(cik, acc, doc) if acc and doc else None
        out.append({
            "accession": acc,
            "cik": cik,
            "form": form,
            "filed_date": dates[i] if i < len(dates) else None,
            "primary_doc_name": doc,
            "primary_doc_url": url,
            "description": descs[i] if i < len(descs) else None,
            "size": sizes[i] if i < len(sizes) else None,
            "is_xbrl": bool(is_xbrl[i]) if i < len(is_xbrl) else False,
        })
        if len(out) >= args.limit:
            break

    return client.success(
        out,
        cik=cik,
        name=name,
        filter_type=args.type,
        count_returned=len(out),
    )


if __name__ == "__main__":
    client.run(main)
