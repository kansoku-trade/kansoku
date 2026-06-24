"""Shared EDGAR helpers: UA, ticker→CIK resolution."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def ua_headers() -> dict:
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua:
        raise client.ClientError(
            "Missing SEC_USER_AGENT.",
            exit_code=2,
            hint='Set SEC_USER_AGENT="Name <email>" in .env at project root',
        )
    return {"User-Agent": ua, "Accept-Encoding": "identity"}


def resolve_cik(ticker_or_cik: str, *, fresh: bool = False) -> tuple[str, str]:
    """Return (cik_padded, name). Accepts ticker or numeric CIK."""
    t = ticker_or_cik.strip().upper()
    if t.isdigit():
        return t.zfill(10), ""
    table = client.fetch(
        TICKERS_URL,
        source="sec",
        ttl=30 * 24 * 3600,
        headers=ua_headers(),
        fresh=fresh,
    )
    for row in table.values():
        if row.get("ticker", "").upper() == t:
            return str(row["cik_str"]).zfill(10), row.get("title", "")
    raise client.ClientError(
        f"Ticker not found in SEC company_tickers: {t}",
        exit_code=3,
        hint="Pass numeric CIK directly if known, or verify the ticker.",
    )


def submissions(cik_padded: str, *, fresh: bool = False) -> dict:
    url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    return client.fetch(
        url,
        source="sec",
        ttl=15 * 60,
        headers=ua_headers(),
        fresh=fresh,
    )


def primary_doc_url(cik_padded: str, accession: str, primary_doc: str) -> str:
    acc_nodash = accession.replace("-", "")
    cik_int = str(int(cik_padded))
    return f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{primary_doc}"
