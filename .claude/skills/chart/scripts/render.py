#!/usr/bin/env python3
"""Render financial charts to self-contained HTML using ECharts via CDN.

Three chart types:
  - flow:   intraday cumulative main-capital net inflow line (signed area)
  - kline:  daily/intraday OHLC candlestick + volume sub-pane
  - cohort: cross-symbol horizontal bar comparison (signed colors)

Input JSON formats match Longbridge CLI native output. Numeric fields may be
strings (Longbridge default) — `float(...)` cast happens here.

Output: self-contained HTML referencing ECharts via CDN. No build step.
Default destination: <repo>/journal/charts/YYYY-MM-DD-<slug>.html
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]  # .claude/skills/
sys.path.insert(0, str(ROOT))

from _shared import client  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[4]  # trade/
ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"

UP_COLOR = "#22c55e"
DOWN_COLOR = "#ef4444"


# ---------------------------------------------------------------------------
# Option builders — each returns a JSON-serializable ECharts option dict.
# ---------------------------------------------------------------------------

def build_flow_option(rows: list[dict]) -> dict:
    pairs = [[row["time"], float(row["inflow"])] for row in rows]
    return {
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "cross"}},
        "grid": {"left": "8%", "right": "5%", "top": 40, "bottom": 60},
        "xAxis": {
            "type": "time",
            "axisLine": {"lineStyle": {"color": "#666"}},
            "axisLabel": {"color": "#aaa"},
        },
        "yAxis": {
            "type": "value",
            "name": "累计主力净流入",
            "nameTextStyle": {"color": "#aaa"},
            "axisLine": {"lineStyle": {"color": "#666"}},
            "axisLabel": {"color": "#aaa"},
            "splitLine": {"lineStyle": {"color": "#1f242c"}},
        },
        "dataZoom": [
            {"type": "inside"},
            {"type": "slider", "height": 18, "bottom": 18, "borderColor": "#333"},
        ],
        "visualMap": {
            "show": False,
            "dimension": 1,
            "pieces": [
                {"gt": 0, "color": UP_COLOR},
                {"lte": 0, "color": DOWN_COLOR},
            ],
        },
        "series": [{
            "type": "line",
            "data": pairs,
            "smooth": True,
            "symbol": "none",
            "lineStyle": {"width": 2},
            "areaStyle": {"opacity": 0.18},
            "markLine": {
                "symbol": "none",
                "silent": True,
                "lineStyle": {"color": "#888", "type": "dashed"},
                "data": [{"yAxis": 0}],
                "label": {"show": False},
            },
        }],
    }


def build_kline_option(rows: list[dict]) -> dict:
    times = [row["time"] for row in rows]
    candles = [
        [float(row["open"]), float(row["close"]), float(row["low"]), float(row["high"])]
        for row in rows
    ]
    volumes = []
    for row in rows:
        is_up = float(row["close"]) >= float(row["open"])
        volumes.append({
            "value": float(row["volume"]),
            "itemStyle": {"color": UP_COLOR if is_up else DOWN_COLOR, "opacity": 0.6},
        })

    return {
        "tooltip": {
            "trigger": "axis",
            "axisPointer": {"type": "cross"},
            "backgroundColor": "rgba(20,24,30,0.92)",
            "borderColor": "#333",
            "textStyle": {"color": "#eee"},
        },
        "axisPointer": {"link": [{"xAxisIndex": "all"}]},
        "grid": [
            {"left": "8%", "right": "5%", "top": 30, "height": "60%"},
            {"left": "8%", "right": "5%", "top": "74%", "height": "15%"},
        ],
        "xAxis": [
            {
                "type": "category", "data": times, "gridIndex": 0,
                "axisLine": {"lineStyle": {"color": "#666"}},
                "axisLabel": {"show": False},
                "splitLine": {"show": False},
            },
            {
                "type": "category", "data": times, "gridIndex": 1,
                "axisLine": {"lineStyle": {"color": "#666"}},
                "axisLabel": {"color": "#aaa", "fontSize": 10},
                "splitLine": {"show": False},
            },
        ],
        "yAxis": [
            {
                "scale": True, "gridIndex": 0,
                "axisLine": {"lineStyle": {"color": "#666"}},
                "axisLabel": {"color": "#aaa"},
                "splitLine": {"lineStyle": {"color": "#1f242c"}},
            },
            {
                "scale": True, "gridIndex": 1,
                "axisLine": {"lineStyle": {"color": "#666"}},
                "axisLabel": {"show": False},
                "splitLine": {"show": False},
            },
        ],
        "dataZoom": [
            {"type": "inside", "xAxisIndex": [0, 1]},
            {"type": "slider", "xAxisIndex": [0, 1], "height": 18, "bottom": 18, "borderColor": "#333"},
        ],
        "series": [
            {
                "name": "K-line",
                "type": "candlestick",
                "data": candles,
                "itemStyle": {
                    "color": UP_COLOR,
                    "color0": DOWN_COLOR,
                    "borderColor": UP_COLOR,
                    "borderColor0": DOWN_COLOR,
                },
            },
            {
                "name": "Volume",
                "type": "bar",
                "xAxisIndex": 1,
                "yAxisIndex": 1,
                "data": volumes,
            },
        ],
    }


def build_cohort_option(rows: list[dict]) -> dict:
    cleaned: list[tuple[str, float, str | None]] = []
    for row in rows:
        label = row.get("label") or row.get("symbol")
        if label is None:
            raise client.ClientError(
                "cohort rows need `label` or `symbol`",
                exit_code=2,
                hint=f"offending row: {row}",
            )
        cleaned.append((str(label), float(row["value"]), row.get("group")))
    cleaned.sort(key=lambda x: x[1])  # most negative on top

    labels = [c[0] for c in cleaned]
    bars = []
    for _, val, _ in cleaned:
        bars.append({
            "value": val,
            "itemStyle": {"color": UP_COLOR if val >= 0 else DOWN_COLOR},
        })

    return {
        "tooltip": {
            "trigger": "axis",
            "axisPointer": {"type": "shadow"},
            "backgroundColor": "rgba(20,24,30,0.92)",
            "borderColor": "#333",
            "textStyle": {"color": "#eee"},
        },
        "grid": {"left": "14%", "right": "10%", "top": 20, "bottom": 30},
        "xAxis": {
            "type": "value",
            "axisLine": {"lineStyle": {"color": "#666"}},
            "axisLabel": {"color": "#aaa"},
            "splitLine": {"lineStyle": {"color": "#1f242c"}},
        },
        "yAxis": {
            "type": "category",
            "data": labels,
            "axisLine": {"lineStyle": {"color": "#666"}},
            "axisLabel": {"color": "#ddd", "fontSize": 12},
        },
        "series": [{
            "type": "bar",
            "data": bars,
            "label": {
                "show": True,
                "position": "right",
                "color": "#ddd",
                "fontSize": 11,
            },
            "barWidth": "60%",
        }],
    }


# ---------------------------------------------------------------------------
# HTML assembly
# ---------------------------------------------------------------------------

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>__TITLE__</title>
<script src="__CDN__"></script>
<style>
  body { margin: 0; padding: 20px; background: #0e1116; color: #eee;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
  h1 { font-size: 16px; font-weight: 500; margin: 0 0 6px 0; color: #ddd; }
  .subtitle { font-size: 12px; color: #888; margin: 0 0 14px 0; }
  #chart { width: 100%; height: calc(100vh - 90px); min-height: 420px; }
</style>
</head>
<body>
<h1>__TITLE__</h1>
<div class="subtitle">__SUBTITLE__</div>
<div id="chart"></div>
<script>
  const option = __OPTION__;
  const chart = echarts.init(document.getElementById("chart"), null,
                             { renderer: "canvas" });
  chart.setOption(option);
  window.addEventListener("resize", () => chart.resize());
</script>
</body>
</html>
"""


def render_html(option: dict, title: str, subtitle: str) -> str:
    option_js = json.dumps(option, ensure_ascii=False, default=str)
    safe_title = (title or "Chart").replace("<", "&lt;")
    safe_subtitle = (subtitle or "").replace("<", "&lt;")
    return (
        HTML_TEMPLATE
        .replace("__CDN__", ECHARTS_CDN)
        .replace("__TITLE__", safe_title)
        .replace("__SUBTITLE__", safe_subtitle)
        .replace("__OPTION__", option_js)
    )


# ---------------------------------------------------------------------------
# Path + I/O helpers
# ---------------------------------------------------------------------------

def slugify(s: str, fallback: str) -> str:
    s = re.sub(r"[^\w\s\-]", "", s, flags=re.UNICODE).strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    return s or fallback


def default_out_path(chart_type: str, title: str) -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    slug = slugify(title, chart_type)
    return PROJECT_ROOT / "journal" / "charts" / f"{today}-{slug}.html"


def open_in_browser(path: Path) -> None:
    url = f"file://{path.resolve()}"
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", url], check=False)
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", url], check=False)
    except Exception:
        pass  # opening is best-effort; the file is already written


def load_rows(args) -> list[dict]:
    if args.data:
        with open(args.data, encoding="utf-8") as f:
            data = json.load(f)
    else:
        if sys.stdin.isatty():
            raise client.ClientError(
                "No input. Pipe JSON to stdin or pass --data <path>.",
                exit_code=2,
                hint="e.g. longbridge capital MU.US --flow --format json | render.py --type flow",
            )
        data = json.load(sys.stdin)
    if not isinstance(data, list) or not data:
        raise client.ClientError(
            "Input must be a non-empty JSON array.",
            exit_code=2,
            hint=f"Got: {type(data).__name__}",
        )
    return data


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

def smoke_test() -> dict:
    rows = [
        {"symbol": "MU",   "value": -17087.06},
        {"symbol": "SMH",  "value": -1794.76},
        {"symbol": "SOXX", "value":  9540.59},
        {"symbol": "NVDA", "value": -35727.81},
        {"symbol": "AAPL", "value": -55562.68},
    ]
    option = build_cohort_option(rows)
    html = render_html(option, "Smoke test cohort", "synthetic data, do not trust")
    out = Path("/tmp/chart-smoke.html")
    out.write_text(html, encoding="utf-8")
    if not out.exists() or out.stat().st_size < 500:
        raise client.ClientError(
            "Smoke output looks empty or missing.",
            exit_code=3,
            hint=f"path={out} size={out.stat().st_size if out.exists() else 0}",
        )
    return client.success(
        {"path": str(out), "size": out.stat().st_size, "rows": len(rows)},
        smoke=True,
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

BUILDERS = {
    "flow": build_flow_option,
    "kline": build_kline_option,
    "cohort": build_cohort_option,
}


def main() -> dict:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--type", choices=list(BUILDERS), help="Chart kind")
    p.add_argument("--title", default="", help="Chart title (also used in output slug)")
    p.add_argument("--subtitle", default="", help="Source / units / disclaimer")
    p.add_argument("--data", help="Path to input JSON; else stdin")
    p.add_argument("--out", help="Output HTML path; default journal/charts/YYYY-MM-DD-<slug>.html")
    p.add_argument("--open", action="store_true", help="Open in browser after writing (macOS)")
    p.add_argument("--smoke", action="store_true", help="Render synthetic cohort to /tmp and verify")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    if args.smoke:
        return smoke_test()

    if not args.type:
        raise client.ClientError(
            "--type is required (flow|kline|cohort) unless --smoke.",
            exit_code=2,
        )

    rows = load_rows(args)
    try:
        option = BUILDERS[args.type](rows)
    except (KeyError, ValueError, TypeError) as e:
        raise client.ClientError(
            f"Failed to build option for type={args.type}: {e}",
            exit_code=3,
            hint=f"Check the JSON shape; sample row: {rows[0] if rows else 'n/a'}",
        ) from e

    html = render_html(option, args.title, args.subtitle)

    out = Path(args.out) if args.out else default_out_path(args.type, args.title)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")

    if args.open:
        open_in_browser(out)

    return client.success(
        {
            "path": str(out.resolve()),
            "type": args.type,
            "rows": len(rows),
            "opened": bool(args.open),
        },
        chart_type=args.type,
    )


if __name__ == "__main__":
    client.run(main)
