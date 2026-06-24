"""HTTP + cache + throttle + retry for market-intel skills.

Stdlib only. JSON-only payloads (success and error envelopes).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from . import env  # noqa: F401  -- side effect: auto-load credentials

CACHE_ROOT = Path.home() / ".cache" / "market-intel"

THROTTLE = {
    "fred":     {"min_interval": 0.5},
    "sec":      {"min_interval": 0.1},
    "gdelt":    {"min_interval": 5.0},
}

_LAST_HIT: dict[str, float] = {}


class ClientError(Exception):
    def __init__(self, message: str, *, exit_code: int = 3, hint: str = ""):
        super().__init__(message)
        self.exit_code = exit_code
        self.hint = hint


def _throttle(source: str) -> None:
    cfg = THROTTLE.get(source)
    if not cfg:
        return
    last = _LAST_HIT.get(source, 0.0)
    wait = cfg["min_interval"] - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    _LAST_HIT[source] = time.time()


def _cache_path(source: str, url: str, body: bytes | None) -> Path:
    key = url
    if body:
        key += "::" + body.decode("utf-8", errors="replace")
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    p = CACHE_ROOT / source / f"{digest}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _cache_read(path: Path, ttl: float) -> Any | None:
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            env = json.load(f)
        if time.time() - env.get("fetched_at", 0) > ttl:
            return None
        return env.get("body")
    except (json.JSONDecodeError, OSError):
        return None


def _cache_write(path: Path, body: Any) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": time.time(), "body": body}, f)
    tmp.replace(path)


def _log(msg: str) -> None:
    sys.stderr.write(msg + "\n")


def fetch(
    url: str,
    *,
    source: str,
    ttl: float = 0,
    headers: dict | None = None,
    method: str = "GET",
    body: bytes | None = None,
    parse_json: bool = True,
    fresh: bool = False,
    max_retries: int = 3,
    timeout: int = 30,
) -> Any:
    """Fetch URL with caching, throttling, retry/backoff.

    ttl=0 disables caching for the call. Returns parsed JSON when parse_json=True,
    otherwise raw text.
    """
    cache_path = _cache_path(source, url, body) if ttl > 0 else None
    if cache_path is not None and not fresh:
        cached = _cache_read(cache_path, ttl)
        if cached is not None:
            _log(f"[cache hit] {source} {url}")
            return cached

    hdrs = dict(headers or {})
    hdrs.setdefault("Accept", "application/json" if parse_json else "*/*")

    backoff = 1.0
    last_err: Exception | None = None
    for attempt in range(max_retries):
        _throttle(source)
        req = urllib.request.Request(url, method=method, headers=hdrs, data=body)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                text = raw.decode("utf-8", errors="replace")
                parsed = json.loads(text) if parse_json else text
                if cache_path is not None:
                    _cache_write(cache_path, parsed)
                return parsed
        except urllib.error.HTTPError as e:
            body_text = ""
            try:
                body_text = e.read().decode("utf-8", errors="replace")[:200]
            except Exception:
                pass
            if e.code in (429, 503) and attempt < max_retries - 1:
                _log(f"[retry] {source} {url} status={e.code} attempt={attempt + 1} sleep={backoff}s")
                time.sleep(backoff)
                backoff *= 2
                last_err = e
                continue
            if e.code == 401:
                raise ClientError(
                    f"HTTP 401 from {source}",
                    exit_code=5,
                    hint=f"Check credentials for {source}. Body: {body_text}",
                ) from e
            raise ClientError(
                f"HTTP {e.code} from {source}: {body_text}",
                exit_code=3,
                hint=f"Endpoint: {url}",
            ) from e
        except urllib.error.URLError as e:
            last_err = e
            if attempt < max_retries - 1:
                _log(f"[retry] {source} network err attempt={attempt + 1} sleep={backoff}s")
                time.sleep(backoff)
                backoff *= 2
                continue
            raise ClientError(
                f"network: {e.reason}",
                exit_code=4,
                hint=f"Could not reach {url}",
            ) from e
        except json.JSONDecodeError as e:
            raise ClientError(
                f"non-JSON response from {source}",
                exit_code=3,
                hint=f"First 200 chars: {text[:200]!r}",
            ) from e

    raise ClientError(
        f"exhausted retries for {source}",
        exit_code=3,
        hint=str(last_err) if last_err else "",
    )


def success(data: Any, **meta) -> dict:
    return {"ok": True, "data": data, "meta": meta}


def failure(error: str, hint: str = "") -> dict:
    return {"ok": False, "error": error, "hint": hint}


def emit(payload: dict) -> int:
    """Write JSON envelope to stdout, return exit code."""
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    return 0 if payload.get("ok") else 1


def run(main_fn) -> None:
    """Top-level wrapper: catches ClientError + unexpected errors, emits failure envelope."""
    try:
        payload = main_fn()
    except ClientError as e:
        sys.exit(emit(failure(str(e), e.hint)) or e.exit_code)
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        sys.exit(emit(failure(f"unexpected: {type(e).__name__}: {e}", "")) or 6)
    sys.exit(emit(payload))
