#!/usr/bin/env python3
"""Form 4 (insider transaction) parser for a given ticker.

Filters `submissions/CIK*.json` for form=='4' (and optionally '4/A' amendments)
within the past --days window, fetches each filing's Form 4 XML, and parses
both nonDerivative and derivative transaction tables.
"""

from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402
import _edgar  # noqa: E402


def text(node, *path) -> str | None:
    cur = node
    for p in path:
        if cur is None:
            return None
        cur = cur.find(p)
    return cur.text.strip() if (cur is not None and cur.text) else None


def filing_index(cik_padded: str, accession: str) -> dict:
    acc_nodash = accession.replace("-", "")
    cik_int = str(int(cik_padded))
    url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/index.json"
    return client.fetch(
        url,
        source="sec",
        ttl=30 * 24 * 3600,
        headers=_edgar.ua_headers(),
    )


def find_form4_xml(idx: dict) -> str | None:
    items = idx.get("directory", {}).get("item", [])
    candidates = [it["name"] for it in items if it.get("name", "").lower().endswith(".xml")]
    for name in candidates:
        if "form4" in name.lower() or "wf-form4" in name.lower():
            return name
    for name in candidates:
        if name.lower() == "primary_doc.xml":
            return name
    return candidates[0] if candidates else None


def parse_form4(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)

    reporter = text(root, "reportingOwner", "reportingOwnerId", "rptOwnerName")
    rel = root.find("reportingOwner/reportingOwnerRelationship")
    is_director = text(rel, "isDirector") if rel is not None else None
    is_officer = text(rel, "isOfficer") if rel is not None else None
    is_ten_pct = text(rel, "isTenPercentOwner") if rel is not None else None
    officer_title = text(rel, "officerTitle") if rel is not None else None

    roles = []
    if is_director == "1" or is_director == "true":
        roles.append("director")
    if is_officer == "1" or is_officer == "true":
        roles.append(f"officer:{officer_title}" if officer_title else "officer")
    if is_ten_pct == "1" or is_ten_pct == "true":
        roles.append("10%-owner")

    footnotes = {}
    for fn in root.findall("footnotes/footnote"):
        fid = fn.attrib.get("id")
        if fid:
            footnotes[fid] = (fn.text or "").strip()

    def parse_amount_block(tx, derivative=False):
        shares = text(tx, "transactionAmounts", "transactionShares", "value")
        price = text(tx, "transactionAmounts", "transactionPricePerShare", "value")
        code = text(tx, "transactionCoding", "transactionCode")
        ad = text(tx, "transactionAmounts", "transactionAcquiredDisposedCode", "value")
        post = text(tx, "postTransactionAmounts", "sharesOwnedFollowingTransaction", "value")
        own = text(tx, "ownershipNature", "directOrIndirectOwnership", "value")
        txn_date = text(tx, "transactionDate", "value")
        sec_title = text(tx, "securityTitle", "value")
        fnotes = []
        for el in tx.iter():
            fnote_id = el.attrib.get("footnoteId") if el.attrib else None
            if fnote_id:
                fnotes.append(fnote_id)

        row = {
            "txn_date": txn_date,
            "security_title": sec_title,
            "code": code,
            "shares": _num(shares),
            "price": _num(price),
            "acquire_or_dispose": ad,
            "post_holdings": _num(post),
            "ownership_kind": own,
            "derivative": derivative,
            "footnote_ids": sorted(set(fnotes)),
        }
        if derivative:
            row["conversion_or_exercise_price"] = _num(
                text(tx, "conversionOrExercisePrice", "value")
            )
            row["exercise_date"] = text(tx, "exerciseDate", "value")
            row["expiration_date"] = text(tx, "expirationDate", "value")
        return row

    txns = []
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        txns.append(parse_amount_block(tx, derivative=False))
    for tx in root.findall("derivativeTable/derivativeTransaction"):
        txns.append(parse_amount_block(tx, derivative=True))

    return {
        "reporter": reporter,
        "roles": roles,
        "transactions": txns,
        "footnotes": footnotes,
    }


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main() -> dict:
    p = argparse.ArgumentParser(description="Parse insider Form 4 filings for a ticker.")
    p.add_argument("symbol", help="Ticker or numeric CIK.")
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--include-amendments", action="store_true", help="Include 4/A.")
    p.add_argument("--limit", type=int, default=50, help="Max filings to parse.")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return client.success({"status": "ok"}, smoke=True)

    cik, name = _edgar.resolve_cik(args.symbol, fresh=args.fresh)
    sub = _edgar.submissions(cik, fresh=args.fresh)
    recent = sub.get("filings", {}).get("recent", {})
    accs = recent.get("accessionNumber", [])
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])

    cutoff = date.today() - timedelta(days=args.days)
    wanted_forms = {"4"}
    if args.include_amendments:
        wanted_forms.add("4/A")

    targets = []
    for i, form in enumerate(forms):
        if form not in wanted_forms:
            continue
        filed = dates[i] if i < len(dates) else None
        try:
            d = datetime.fromisoformat(filed).date() if filed else None
        except ValueError:
            d = None
        if d and d < cutoff:
            break  # recent[] is reverse-chronological
        targets.append({"accession": accs[i], "filed_date": filed, "form": form})
        if len(targets) >= args.limit:
            break

    out_rows = []
    parse_errors = []
    for t in targets:
        try:
            idx = filing_index(cik, t["accession"])
            xml_name = find_form4_xml(idx)
            if not xml_name:
                parse_errors.append({"accession": t["accession"], "error": "no XML found"})
                continue
            acc_nodash = t["accession"].replace("-", "")
            cik_int = str(int(cik))
            xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{xml_name}"
            xml_text = client.fetch(
                xml_url,
                source="sec",
                ttl=365 * 24 * 3600,
                headers=_edgar.ua_headers(),
                parse_json=False,
            )
            parsed = parse_form4(xml_text)
            for txn in parsed["transactions"]:
                out_rows.append({
                    "accession": t["accession"],
                    "form": t["form"],
                    "filed_date": t["filed_date"],
                    "reporter": parsed["reporter"],
                    "roles": parsed["roles"],
                    "footnotes_text": [parsed["footnotes"].get(fid) for fid in txn["footnote_ids"]],
                    **txn,
                })
        except Exception as e:
            parse_errors.append({"accession": t["accession"], "error": str(e)})

    return client.success(
        out_rows,
        cik=cik,
        name=name,
        days=args.days,
        include_amendments=args.include_amendments,
        filings_scanned=len(targets),
        txns_parsed=len(out_rows),
        parse_errors=parse_errors,
    )


if __name__ == "__main__":
    client.run(main)
