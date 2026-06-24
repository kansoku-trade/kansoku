"""Auto-load credentials from .env (or $MARKET_INTEL_ENV).

Search order:
  1. $MARKET_INTEL_ENV (if set)
  2. Project root .env — walks upward from this file for a directory containing
     `.claude/` and uses `<that-dir>/.env`
  3. ~/.config/market-intel/env

Idempotent. Safe to import from every script. Parses shell-style KEY="value"
lines (export prefix and # comments accepted). Values already present in
os.environ win over file values.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_LOADED = False
_LINE_RE = re.compile(r'^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$')


def _strip_quotes(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s


def _project_root_env() -> Path | None:
    here = Path(__file__).resolve()
    for d in (here, *here.parents):
        if (d / ".claude").is_dir():
            return d / ".env"
    return None


def _candidate_paths() -> list[Path]:
    override = os.environ.get("MARKET_INTEL_ENV")
    if override:
        return [Path(override)]
    paths: list[Path] = []
    proj = _project_root_env()
    if proj:
        paths.append(proj)
    paths.append(Path.home() / ".config" / "market-intel" / "env")
    return paths


def load() -> None:
    global _LOADED
    if _LOADED:
        return
    for path in _candidate_paths():
        try:
            with open(path, encoding="utf-8") as f:
                for raw in f:
                    line = raw.split("#", 1)[0]
                    if not line.strip():
                        continue
                    m = _LINE_RE.match(line)
                    if not m:
                        continue
                    key, val = m.group(1), _strip_quotes(m.group(2))
                    if key not in os.environ:
                        os.environ[key] = val
            break
        except FileNotFoundError:
            continue
    _LOADED = True


load()
