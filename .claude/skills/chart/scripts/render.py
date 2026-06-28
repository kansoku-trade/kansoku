#!/usr/bin/env python3
"""Render financial charts to self-contained HTML.

Four chart types:
  - flow:   intraday cumulative main-capital net inflow line (signed area) [ECharts]
  - kline:  daily/intraday OHLC candlestick + volume sub-pane [ECharts]
  - cohort: cross-symbol horizontal bar comparison (signed colors) [ECharts]
  - sepa:   SEPA strategy dashboard — main K + MA stack + RS subplot +
            volume-ratio subplot + verdict sidebar + event markers
            [TradingView Lightweight Charts]

Input for flow/kline/cohort: JSON array, matches Longbridge CLI native output.
Input for sepa: JSON object {symbol, name, as_of_date, kline[], spy_kline[],
                              position?, context?}.

Output: self-contained HTML referencing CDN libs. No build step.
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
LIGHTWEIGHT_CHARTS_CDN = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"

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
# SEPA dashboard — TradingView Lightweight Charts
# ---------------------------------------------------------------------------

def _sma(arr: list[float], n: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(arr)):
        if i < n - 1:
            out.append(None)
        else:
            out.append(sum(arr[i - n + 1 : i + 1]) / n)
    return out


def _to_ts(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def _ymd(iso: str) -> str:
    return iso[:10]


def _coerce_klines(kline: list[dict], label: str) -> tuple[list[int], list[str], list[float], list[float], list[float], list[float], list[float]]:
    if not kline or len(kline) < 50:
        raise client.ClientError(
            f"sepa: {label} needs at least 50 bars (got {len(kline)}); SEPA computes MA50/150/200.",
            exit_code=2,
            hint="Pull more history: `longbridge kline <SYM> --period day --count 260`.",
        )
    times_ts = [_to_ts(b["time"]) for b in kline]
    dates = [_ymd(b["time"]) for b in kline]
    opens  = [float(b["open"])  for b in kline]
    highs  = [float(b["high"])  for b in kline]
    lows   = [float(b["low"])   for b in kline]
    closes = [float(b["close"]) for b in kline]
    vols   = [float(b["volume"]) for b in kline]
    return times_ts, dates, opens, highs, lows, closes, vols


def _line_data(times_ts: list[int], values: list[float | None]) -> list[dict]:
    return [{"time": t, "value": v} for t, v in zip(times_ts, values) if v is not None]


def _rs_series(closes: list[float], times_ts: list[int], spy_map: dict[int, float], lookback: int) -> list[dict]:
    out: list[dict] = []
    for i in range(len(closes)):
        if i < lookback:
            continue
        t_now, t_prev = times_ts[i], times_ts[i - lookback]
        if t_now not in spy_map or t_prev not in spy_map:
            continue
        m_ret = closes[i] / closes[i - lookback] - 1
        s_ret = spy_map[t_now] / spy_map[t_prev] - 1
        out.append({"time": t_now, "value": round((m_ret - s_ret) * 100, 4)})
    return out


def _detect_markers(
    times_ts: list[int],
    dates: list[str],
    opens: list[float],
    highs: list[float],
    closes: list[float],
    vols: list[float],
    vol20: list[float | None],
    ma50: list[float | None],
    ma200: list[float | None],
    high_52w: float,
    earnings_dates: list[str],
) -> list[dict]:
    markers: list[dict] = []

    for d in earnings_dates:
        for i, ds in enumerate(dates):
            if ds == d:
                markers.append({
                    "time": times_ts[i],
                    "position": "belowBar",
                    "color": "#2196f3",
                    "shape": "circle",
                    "text": "E 财报",
                })
                break

    for i in range(20, len(closes)):
        if vol20[i] and vols[i] >= 2.5 * vol20[i] and closes[i] < opens[i]:
            window_start = max(0, i - 5)
            if highs[i] == max(highs[window_start : i + 1]):
                markers.append({
                    "time": times_ts[i],
                    "position": "aboveBar",
                    "color": "#d32f2f",
                    "shape": "arrowDown",
                    "text": f"🔺 climax top ({vols[i]/1e6:.0f}M, {vols[i]/vol20[i]:.1f}×)",
                })

    for i in range(1, len(closes)):
        if ma50[i - 1] and ma50[i]:
            if closes[i - 1] >= ma50[i - 1] and closes[i] < ma50[i]:
                markers.append({
                    "time": times_ts[i],
                    "position": "belowBar",
                    "color": "#ff9800",
                    "shape": "arrowDown",
                    "text": "⬇ 跌破 MA50",
                })

    for i in range(1, len(closes)):
        if ma200[i - 1] and ma200[i]:
            if closes[i - 1] >= ma200[i - 1] and closes[i] < ma200[i]:
                markers.append({
                    "time": times_ts[i],
                    "position": "belowBar",
                    "color": "#d32f2f",
                    "shape": "arrowDown",
                    "text": "⬇ 跌破 MA200 (Stage 3 转 Stage 4)",
                })

    for i, h in enumerate(highs):
        if h == high_52w:
            markers.append({
                "time": times_ts[i],
                "position": "aboveBar",
                "color": "#9c27b0",
                "shape": "square",
                "text": f"52w 高 ${high_52w:.2f}",
            })
            break

    markers.sort(key=lambda m: m["time"])
    return markers


def _compute_checks(
    last: float,
    ma50: float,
    ma150: float,
    ma200: float,
    ma200_1m: float | None,
    ma200_4m: float | None,
    high_52w: float,
    low_52w: float,
    rs_excess_21d: float | None,
    rs_excess_126d: float | None,
) -> list[dict]:
    def status(passed: bool) -> str:
        return "pass" if passed else "fail"

    c1 = last > ma150 and last > ma200
    c2 = ma150 > ma200
    slope_1m = (ma200 - ma200_1m) / ma200_1m * 100 if ma200_1m else 0
    slope_4m = (ma200 - ma200_4m) / ma200_4m * 100 if ma200_4m else 0
    c3 = slope_1m > 0
    c4 = ma50 > ma150 and ma50 > ma200
    c5 = last > ma50
    c6 = last >= low_52w * 1.30
    c7 = last >= high_52w * 0.75

    if rs_excess_126d is None:
        c8_status = "unknown"
    elif rs_excess_126d >= 0:
        c8_status = "pass"
    elif rs_excess_126d >= -5:
        c8_status = "unknown"
    else:
        c8_status = "fail"

    extended_note = ""
    if c5:
        ext = (last / ma50 - 1) * 100
        if ext >= 25:
            extended_note = f" ⚠ extended +{ext:.1f}%"

    return [
        {"label": "价 > 150MA 且 > 200MA", "status": status(c1),
         "val": f"价 ${last:.2f} vs 150MA ${ma150:.2f} / 200MA ${ma200:.2f}"},
        {"label": "150MA > 200MA", "status": status(c2),
         "val": f"{ma150:.2f} > {ma200:.2f}" if c2 else f"{ma150:.2f} ≤ {ma200:.2f}"},
        {"label": "200MA 上行 ≥ 1 月", "status": status(c3),
         "val": f"1月斜率 {slope_1m:+.2f}%, 4月 {slope_4m:+.2f}%"},
        {"label": "50MA > 150MA 且 > 200MA", "status": status(c4),
         "val": f"{ma50:.2f} > {ma150:.2f} > {ma200:.2f}" if c4 else f"{ma50:.2f} / {ma150:.2f} / {ma200:.2f}"},
        {"label": "价 > 50MA", "status": status(c5),
         "val": f"价 ${last:.2f} vs 50MA ${ma50:.2f} ({(last/ma50-1)*100:+.1f}%){extended_note}"},
        {"label": "距 52w 低 ≥ +30%", "status": status(c6),
         "val": f"+{(last/low_52w-1)*100:.0f}% (低 ${low_52w:.2f})"},
        {"label": "距 52w 高 ≤ 25% 内", "status": status(c7),
         "val": f"{(last/high_52w-1)*100:+.2f}% (高 ${high_52w:.2f})"},
        {"label": "RS > 70 分位 (vs SPY)", "status": c8_status,
         "val": (f"21天 {rs_excess_21d:+.1f} pp, 126天 {rs_excess_126d:+.1f} pp"
                 if rs_excess_126d is not None else "无 SPY 数据，未计算")},
    ]


_ZONE_PALETTE = {
    "warning": {
        "label_zh": "诱多区",
        "fill": "rgba(239, 83, 80, 0.16)",
        "border": "#ef5350",
        "axis_color": "#ef5350",
        "hint": "刚 climax top 后的第一次回调，主力借反弹派发——不能买",
    },
    "watch": {
        "label_zh": "关注区",
        "fill": "rgba(255, 193, 7, 0.16)",
        "border": "#ffc107",
        "axis_color": "#ffc107",
        "hint": "需触及当天缩量 + ≥1 根反转 K + 大盘配合，确认后小试",
    },
    "buy": {
        "label_zh": "第一买点",
        "fill": "rgba(38, 166, 154, 0.20)",
        "border": "#26a69a",
        "axis_color": "#26a69a",
        "hint": "VDU 后放量反弹是合格信号，可分批进场",
    },
    "value": {
        "label_zh": "价值区",
        "fill": "rgba(0, 137, 123, 0.32)",
        "border": "#00897b",
        "axis_color": "#26a69a",
        "hint": "成交密集区 + 长期均线交汇，机构成本带，逆向布局重点",
    },
}


def _normalize_support_zones(raw_zones: list[dict] | None) -> list[dict]:
    if not raw_zones:
        return []
    out: list[dict] = []
    for z in raw_zones:
        try:
            low = float(z["low"])
            high = float(z["high"])
        except (KeyError, TypeError, ValueError):
            continue
        if high < low:
            low, high = high, low
        tier = z.get("tier") or "watch"
        palette = _ZONE_PALETTE.get(tier, _ZONE_PALETTE["watch"])
        out.append({
            "low": low,
            "high": high,
            "tier": tier,
            "label": z.get("label") or palette["label_zh"],
            "fill": z.get("fill") or palette["fill"],
            "border": z.get("border") or palette["border"],
            "axis_color": palette["axis_color"],
            "note": z.get("note") or palette["hint"],
            "sources": z.get("sources") or [],
        })
    out.sort(key=lambda z: -z["low"])
    return out


def _compute_volume_profile(
    highs: list[float],
    lows: list[float],
    vols: list[float],
    lookback: int = 120,
    n_bins: int = 30,
) -> dict:
    seg = min(lookback, len(highs))
    hs = highs[-seg:]
    ls = lows[-seg:]
    vs = vols[-seg:]
    lo, hi = min(ls), max(hs)
    if hi <= lo:
        return {"bins": [], "max_weight": 0.0, "lookback": seg}
    span = hi - lo
    bins_arr = [0.0] * n_bins
    width = span / n_bins
    for i in range(seg):
        b_lo = int((ls[i] - lo) / width)
        b_hi = int((hs[i] - lo) / width)
        b_lo = max(0, min(n_bins - 1, b_lo))
        b_hi = max(0, min(n_bins - 1, b_hi))
        n = b_hi - b_lo + 1
        per = vs[i] / n
        for b in range(b_lo, b_hi + 1):
            bins_arr[b] += per
    max_w = max(bins_arr) or 1.0
    bin_out = []
    for i, w in enumerate(bins_arr):
        bin_out.append({
            "low":  round(lo + i * width, 4),
            "high": round(lo + (i + 1) * width, 4),
            "weight": round(w, 2),
            "pct": round(w / max_w, 4),
        })
    return {"bins": bin_out, "max_weight": round(max_w, 2), "lookback": seg}


def _default_support_zones(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    ma50: float,
    ma150: float,
    ma200: float,
    vp: dict,
) -> list[dict]:
    """Heuristic default zones when user does not supply them.

    Picks two MA bands (MA50, MA200) + the densest volume cluster from vp.
    """
    zones: list[dict] = []
    last = closes[-1]
    # 1. MA50 ± 2% band — watch tier
    if ma50 and ma50 < last:
        zones.append({
            "low": round(ma50 * 0.98, 2),
            "high": round(ma50 * 1.02, 2),
            "tier": "watch",
            "label": "MA50 关注区",
            "sources": [f"MA50 ${ma50:.2f}"],
        })
    # 2. MA200 band — value tier
    if ma200 and ma200 < last:
        zones.append({
            "low": round(min(ma200, ma150 or ma200) * 0.97, 2),
            "high": round(max(ma200, ma150 or ma200) * 1.03, 2),
            "tier": "value",
            "label": "长期均线价值区",
            "sources": [f"MA150 ${ma150:.2f}", f"MA200 ${ma200:.2f}"],
        })
    # 3. Densest volume cluster below current price — buy or value tier
    bins = [b for b in vp.get("bins", []) if b["high"] < last]
    if bins:
        top = max(bins, key=lambda b: b["weight"])
        # merge adjacent strong bins
        idx = bins.index(top)
        lo, hi = top["low"], top["high"]
        thresh = top["weight"] * 0.6
        for j in range(idx - 1, -1, -1):
            if bins[j]["weight"] >= thresh:
                lo = bins[j]["low"]
            else:
                break
        for j in range(idx + 1, len(bins)):
            if bins[j]["weight"] >= thresh:
                hi = bins[j]["high"]
            else:
                break
        tier = "value" if (hi + lo) / 2 < last * 0.85 else "buy"
        zones.append({
            "low": round(lo, 2),
            "high": round(hi, 2),
            "tier": tier,
            "label": "成交密集区",
            "sources": [f"过去 {vp.get('lookback', 0)} 日 volume profile 峰值"],
        })
    return _normalize_support_zones(zones)


def _auto_verdict(checks: list[dict], last: float, ma50: float) -> dict:
    fails = [c for c in checks if c["status"] == "fail"]
    if fails:
        return {
            "tier": "pass",
            "label": "🚫 PASS",
            "color": "#ef5350",
            "reason": (
                f"趋势模板 8 条中 {len(fails)} 条 Fail（"
                + "、".join(c["label"] for c in fails[:3])
                + ("…" if len(fails) > 3 else "")
                + "）→ 不满足 SEPA 入场条件。"
            ),
        }
    ext_pct = (last / ma50 - 1) * 100
    if ext_pct >= 25:
        return {
            "tier": "watch",
            "label": "👀 WATCH LIST",
            "color": "#ffc107",
            "reason": (
                f"8 条全过，但距 50MA +{ext_pct:.1f}% 已 extended（>25% 警戒）。"
                "当下不是合法入场点，等回调至 50MA 附近形成新整理平台再观察。"
            ),
        }
    return {
        "tier": "watch",
        "label": "👀 WATCH LIST",
        "color": "#ffc107",
        "reason": (
            "8 条全过，自动检测未发现可买的整理形态（VCP / 杯柄 / 平台 / 旗形需人工目视确认）。"
            "若价位在 pivot ~ pivot+5% 买入区且当日成交量 ≥ 1.5×20MA 量，则可升为 Strong Buy。"
        ),
    }


SEPA_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="__CDN__"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
         background: #0d1117; color: #c9d1d9; overflow: hidden; }
  .layout { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
  .charts-col { display: flex; flex-direction: column; border-right: 1px solid #21262d; overflow: hidden; }
  .chart-block { position: relative; border-bottom: 1px solid #21262d; }
  .chart-block.main { flex: 0 0 62%; }
  .chart-block.rs   { flex: 0 0 19%; }
  .chart-block.vol  { flex: 0 0 19%; border-bottom: none; }
  .chart-block > div[id^="chart-"] { width: 100%; height: 100%; }
  .chart-label { position: absolute; top: 8px; left: 12px; z-index: 10; font-size: 11px;
                 color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em;
                 background: rgba(13,17,23,0.7); padding: 2px 8px; }
  .chart-legend { position: absolute; top: 8px; left: 110px; z-index: 10; font-size: 12px;
                  color: #c9d1d9; display: flex; gap: 14px; background: rgba(13,17,23,0.7);
                  padding: 2px 8px; }
  .chart-legend .swatch { display: inline-block; width: 10px; height: 2px; vertical-align: middle; margin-right: 4px; }
  .sidebar { background: #161b22; padding: 16px; overflow-y: auto; font-size: 13px; }
  .header { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #21262d; }
  .symbol { font-size: 22px; font-weight: 600; color: #f0f6fc; }
  .name { font-size: 12px; color: #8b949e; margin-top: 2px; }
  .price { font-size: 26px; font-weight: 600; margin-top: 8px; color: #f0f6fc; }
  .price-change { font-size: 13px; margin-left: 8px; }
  .price-change.up { color: #26a69a; } .price-change.down { color: #ef5350; }
  .price-date { font-size: 11px; color: #8b949e; margin-top: 2px; }
  .verdict { padding: 12px; margin-bottom: 14px; border: 1px solid var(--vc); background: linear-gradient(135deg, color-mix(in srgb, var(--vc) 14%, transparent), color-mix(in srgb, var(--vc) 4%, transparent)); }
  .verdict-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.08em; }
  .verdict-text { font-size: 17px; font-weight: 600; color: var(--vc); margin-top: 4px; }
  .verdict-reason { font-size: 12px; color: #c9d1d9; margin-top: 6px; line-height: 1.5; }
  .section-title { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.08em;
                   margin-top: 16px; margin-bottom: 8px; }
  .grid2 { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; font-size: 12px; }
  .grid2 .k { color: #8b949e; } .grid2 .v { color: #c9d1d9; text-align: right; font-variant-numeric: tabular-nums; }
  .grid2 .v.up { color: #26a69a; } .grid2 .v.down { color: #ef5350; }
  .check-item { display: flex; gap: 10px; padding: 7px 8px; margin-bottom: 4px;
                background: #0d1117; border-left: 2px solid transparent; }
  .check-item.pass    { border-left-color: #26a69a; }
  .check-item.fail    { border-left-color: #ef5350; }
  .check-item.unknown { border-left-color: #666; }
  .check-icon { font-size: 14px; }
  .check-label { font-size: 12px; color: #c9d1d9; font-weight: 500; }
  .check-val { font-size: 11px; color: #8b949e; margin-top: 2px; }
  .zone-item { padding: 8px 10px; margin-bottom: 6px; background: #0d1117;
               border-left: 3px solid var(--zc); }
  .zone-head { display: flex; justify-content: space-between; align-items: baseline; }
  .zone-label { font-size: 12px; font-weight: 600; color: var(--zc); }
  .zone-range { font-size: 11px; color: #c9d1d9; font-variant-numeric: tabular-nums; }
  .zone-meta  { font-size: 10px; color: #8b949e; margin-top: 3px; line-height: 1.45; }
  #vp-canvas { position: absolute; top: 0; right: 0; pointer-events: none; z-index: 5; }
  .layer-panel { position: absolute; top: 8px; right: 8px; z-index: 20;
                 background: rgba(13,17,23,0.94); border: 1px solid #21262d;
                 font-size: 10.5px; min-width: 132px; max-width: 180px; }
  .lp-header { padding: 3px 8px; cursor: pointer; user-select: none;
               display: flex; justify-content: space-between; align-items: center; gap: 8px;
               color: #c9d1d9; font-weight: 500; font-size: 10.5px; }
  .lp-header:hover { background: rgba(255,255,255,0.04); }
  .lp-arrow { font-size: 8px; transition: transform 0.15s; opacity: 0.6; }
  .layer-panel.collapsed { min-width: 0; max-width: none; }
  .layer-panel.collapsed .lp-arrow { transform: rotate(-90deg); }
  .layer-panel.collapsed .lp-body { display: none; }
  .lp-body { padding: 4px 8px 6px; max-height: 70vh; overflow-y: auto;
             border-top: 1px solid #21262d; }
  .lp-group { margin-bottom: 5px; }
  .lp-group:last-child { margin-bottom: 0; }
  .lp-group-title { font-size: 8.5px; color: #6e7681; text-transform: uppercase;
                    margin-bottom: 1px; letter-spacing: 0.06em; }
  .lp-group label { display: flex; align-items: center; color: #c9d1d9; padding: 1px 0;
                    cursor: pointer; user-select: none; line-height: 1.25; font-size: 11px; }
  .lp-group label:hover { color: #f0f6fc; }
  .lp-group input[type=checkbox] { margin: 0 5px 0 0; accent-color: #58a6ff;
                                    flex-shrink: 0; width: 11px; height: 11px; }
  .lp-swatch { display: inline-block; width: 7px; height: 7px; margin-right: 4px;
               border-radius: 1px; flex-shrink: 0; }
  .disclaimer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #21262d;
                font-size: 10px; color: #6e7681; line-height: 1.4; }
</style>
</head>
<body>
<div class="layout">
  <div class="charts-col">
    <div class="chart-block main">
      <div class="chart-label">主图 · 日 K + 均线</div>
      <div class="chart-legend">
        <span><span class="swatch" style="background:#ffb74d"></span>MA50 $__MA50__</span>
        <span><span class="swatch" style="background:#ba68c8"></span>MA150 $__MA150__</span>
        <span><span class="swatch" style="background:#4fc3f7"></span>MA200 $__MA200__</span>
      </div>
      <div class="layer-panel collapsed" id="layer-panel">
        <div class="lp-header" id="lp-header">
          <span>图层</span>
          <span class="lp-arrow">▾</span>
        </div>
        <div class="lp-body" id="lp-body"></div>
      </div>
      <canvas id="vp-canvas"></canvas>
      <div id="chart-main"></div>
    </div>
    <div class="chart-block rs">
      <div class="chart-label">RS vs SPY (跑赢百分点)</div>
      <div class="chart-legend">
        <span><span class="swatch" style="background:#ffeb3b"></span>21d</span>
        <span><span class="swatch" style="background:#ff7043"></span>63d</span>
        <span><span class="swatch" style="background:#ab47bc"></span>126d</span>
      </div>
      <div id="chart-rs"></div>
    </div>
    <div class="chart-block vol">
      <div class="chart-label">量能比 (vs 20MA)</div>
      <div id="chart-volratio"></div>
    </div>
  </div>
  <div class="sidebar">
    <div class="header">
      <div class="symbol">__SYMBOL__</div>
      <div class="name">__NAME__</div>
      <div class="price">$__LAST__<span class="price-change __CHG_CLS__">__CHG__</span></div>
      <div class="price-date">__AS_OF__ · 长桥证券</div>
    </div>
    <div class="verdict" style="--vc: __VC__;">
      <div class="verdict-label">SEPA 结论</div>
      <div class="verdict-text">__VERDICT__</div>
      <div class="verdict-reason">__REASON__</div>
    </div>
    __STAGE_SECTION__
    <div class="section-title">趋势模板 8 条</div>
    __CHECKS__
    <div class="section-title">关键数值</div>
    <div class="grid2">
      <div class="k">距 52w 高 $__H52__</div><div class="v down">__H52_PCT__</div>
      <div class="k">距 52w 低 $__L52__</div><div class="v up">__L52_PCT__</div>
      <div class="k">距 MA50</div><div class="v __MA50_CLS__">__MA50_PCT__</div>
      <div class="k">距 MA200</div><div class="v __MA200_CLS__">__MA200_PCT__</div>
      __RS_KVS__
    </div>
    __SUPPORT_ZONES_SECTION__
    __ENTRY_PLAN_SECTION__
    __POSITION_SECTION__
    <div class="disclaimer">
      ⚠️ 仅供学习参考，不构成投资建议。数据来源：长桥证券。
      <br>SEPA 框架基于 Mark Minervini 方法。Verdict 自动检测 trend template + extended 警戒；形态（VCP / 杯柄 / 平台 / 旗形）需人工目视确认。
    </div>
  </div>
</div>
<script>
const ChartLib = LightweightCharts;
const DATA = __DATA__;

const baseOptions = {
  layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
  grid:   { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
  crosshair: { mode: 0 },
  rightPriceScale: { borderColor: '#21262d' },
  timeScale: { borderColor: '#21262d', timeVisible: false },
};

const mainEl = document.getElementById('chart-main');
const mainChart = ChartLib.createChart(mainEl, {
  ...baseOptions, width: mainEl.clientWidth, height: mainEl.clientHeight,
});
const candle = mainChart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
candle.setData(DATA.candles);
candle.setMarkers(DATA.markers);

const ma50  = mainChart.addLineSeries({ color: '#ffb74d', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
const ma150 = mainChart.addLineSeries({ color: '#ba68c8', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
const ma200 = mainChart.addLineSeries({ color: '#4fc3f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
ma50.setData(DATA.ma50);
ma150.setData(DATA.ma150);
ma200.setData(DATA.ma200);

function makeTogglableLine(series, spec) {
  let ref = series.createPriceLine(spec);
  let visible = true;
  return {
    set(v) {
      if (v === visible) return;
      if (v) { ref = series.createPriceLine(spec); }
      else   { series.removePriceLine(ref); ref = null; }
      visible = v;
    },
    get visible() { return visible; },
  };
}

const lineH52w = makeTogglableLine(candle, { price: DATA.high52w, color: '#9c27b0', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '52w 高' });
const lineL52w = makeTogglableLine(candle, { price: DATA.low52w,  color: '#4caf50', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '52w 低' });
const lineExt = DATA.extendedLine
  ? makeTogglableLine(candle, { price: DATA.extendedLine, color: '#ff5252', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: 'MA50 +25% extended' })
  : null;

let epZones = null, epLines = null;
if (DATA.entryPlan) {
  const ep = DATA.entryPlan;
  const greenZone = mainChart.addBaselineSeries({
    baseValue: { type: 'price', price: ep.pivot },
    topFillColor1:    'rgba(38, 166, 154, 0.25)',
    topFillColor2:    'rgba(38, 166, 154, 0.05)',
    topLineColor:     'rgba(38, 166, 154, 0)',
    bottomFillColor1: 'rgba(0, 0, 0, 0)',
    bottomFillColor2: 'rgba(0, 0, 0, 0)',
    bottomLineColor:  'rgba(0, 0, 0, 0)',
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  });
  greenZone.setData(DATA.candles.map(c => ({ time: c.time, value: ep.target2 })));
  const redZone = mainChart.addBaselineSeries({
    baseValue: { type: 'price', price: ep.pivot },
    topFillColor1:    'rgba(0, 0, 0, 0)',
    topFillColor2:    'rgba(0, 0, 0, 0)',
    topLineColor:     'rgba(0, 0, 0, 0)',
    bottomFillColor1: 'rgba(239, 83, 80, 0.05)',
    bottomFillColor2: 'rgba(239, 83, 80, 0.25)',
    bottomLineColor:  'rgba(239, 83, 80, 0)',
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  });
  redZone.setData(DATA.candles.map(c => ({ time: c.time, value: ep.stop })));
  epZones = { greenZone, redZone };
  epLines = [
    makeTogglableLine(candle, { price: ep.pivot,         color: '#26a69a', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `买入 pivot $${ep.pivot.toFixed(2)}` }),
    makeTogglableLine(candle, { price: ep.buy_zone_high, color: '#26a69a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `买入区上限 +5%` }),
    makeTogglableLine(candle, { price: ep.stop,          color: '#ef5350', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: `止损 $${ep.stop.toFixed(2)}` }),
    makeTogglableLine(candle, { price: ep.target1,       color: '#42a5f5', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `T1 +${ep.target1_pct.toFixed(0)}% $${ep.target1.toFixed(2)}` }),
    makeTogglableLine(candle, { price: ep.target2,       color: '#1976d2', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `T2 +${ep.target2_pct.toFixed(0)}% $${ep.target2.toFixed(2)}` }),
  ];
}

const zoneLayers = [];
if (DATA.supportZones && DATA.supportZones.length) {
  DATA.supportZones.forEach(z => {
    const zoneSeries = mainChart.addBaselineSeries({
      baseValue: { type: 'price', price: z.high },
      topFillColor1:    'rgba(0,0,0,0)',
      topFillColor2:    'rgba(0,0,0,0)',
      topLineColor:     'rgba(0,0,0,0)',
      bottomFillColor1: z.fill,
      bottomFillColor2: z.fill,
      bottomLineColor:  z.border,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    zoneSeries.setData(DATA.candles.map(c => ({ time: c.time, value: z.low })));
    const mid = (z.high + z.low) / 2;
    const midLine = makeTogglableLine(candle, {
      price: mid, color: z.border, lineWidth: 0, lineStyle: 0,
      axisLabelVisible: true,
      title: `${z.label} $${z.low.toFixed(0)}-${z.high.toFixed(0)}`,
    });
    zoneLayers.push({ series: zoneSeries, line: midLine, mid, info: z });
  });
}

const volSeries = mainChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
mainChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
volSeries.setData(DATA.volumes);

const vpCanvas = document.getElementById('vp-canvas');
let vpEnabled = true;
const vpCtx = vpCanvas.getContext('2d');
const VP_WIDTH = 90;
function drawVolumeProfile() {
  const rect = mainEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  vpCanvas.style.width = VP_WIDTH + 'px';
  vpCanvas.style.height = rect.height + 'px';
  vpCanvas.width = VP_WIDTH * dpr;
  vpCanvas.height = rect.height * dpr;
  vpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  vpCtx.clearRect(0, 0, VP_WIDTH, rect.height);
  if (!vpEnabled || !DATA.volumeProfile || !DATA.volumeProfile.bins.length) return;
  const bins = DATA.volumeProfile.bins;
  const drawW = VP_WIDTH - 14;
  bins.forEach(b => {
    const yHi = candle.priceToCoordinate(b.high);
    const yLo = candle.priceToCoordinate(b.low);
    if (yHi == null || yLo == null) return;
    const top = Math.min(yHi, yLo);
    const h = Math.max(1, Math.abs(yLo - yHi) - 0.5);
    const w = Math.max(1, b.pct * drawW);
    vpCtx.fillStyle = 'rgba(139, 148, 158, 0.55)';
    vpCtx.fillRect(VP_WIDTH - w - 2, top, w, h);
  });
  // POC (Point of Control) — highest weight bin gets highlight
  const poc = bins.reduce((a, b) => (b.weight > a.weight ? b : a), bins[0]);
  if (poc) {
    const yHi = candle.priceToCoordinate(poc.high);
    const yLo = candle.priceToCoordinate(poc.low);
    if (yHi != null && yLo != null) {
      const top = Math.min(yHi, yLo);
      const h = Math.max(1, Math.abs(yLo - yHi));
      vpCtx.fillStyle = 'rgba(255, 152, 0, 0.85)';
      vpCtx.fillRect(VP_WIDTH - drawW - 2, top, drawW, h);
      vpCtx.fillStyle = '#ff9800';
      vpCtx.font = '10px -apple-system, sans-serif';
      vpCtx.textAlign = 'right';
      vpCtx.fillText('POC', VP_WIDTH - 4, top + h / 2 + 3);
    }
  }
}
let vpRaf = null;
function scheduleVpDraw() {
  if (vpRaf) return;
  vpRaf = requestAnimationFrame(() => { vpRaf = null; drawVolumeProfile(); });
}
mainChart.timeScale().subscribeVisibleLogicalRangeChange(scheduleVpDraw);
mainChart.subscribeCrosshairMove(scheduleVpDraw);
new ResizeObserver(scheduleVpDraw).observe(mainEl);
setTimeout(drawVolumeProfile, 200);
// Continuous redraw at low fps to track autoscale price changes
setInterval(scheduleVpDraw, 250);

const rsEl = document.getElementById('chart-rs');
const rsChart = ChartLib.createChart(rsEl, { ...baseOptions, width: rsEl.clientWidth, height: rsEl.clientHeight });
const rs21  = rsChart.addLineSeries({ color: '#ffeb3b', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
const rs63  = rsChart.addLineSeries({ color: '#ff7043', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
const rs126 = rsChart.addLineSeries({ color: '#ab47bc', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
rs21.setData(DATA.rs21);
rs63.setData(DATA.rs63);
rs126.setData(DATA.rs126);
if (DATA.rs21.length) rs21.createPriceLine({ price: 0, color: '#666', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });

const vrEl = document.getElementById('chart-volratio');
const vrChart = ChartLib.createChart(vrEl, { ...baseOptions, width: vrEl.clientWidth, height: vrEl.clientHeight });
const vr = vrChart.addHistogramSeries({ priceLineVisible: false });
vr.setData(DATA.volRatio);
vr.createPriceLine({ price: 1.5, color: '#ff5722', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '1.5×' });
vr.createPriceLine({ price: 1.0, color: '#666',    lineWidth: 1, lineStyle: 3, axisLabelVisible: false });

// ---- Layer control panel ----
(function buildLayerPanel() {
  const body = document.getElementById('lp-body');
  const header = document.getElementById('lp-header');
  const panel = document.getElementById('layer-panel');
  header.addEventListener('click', () => panel.classList.toggle('collapsed'));

  const groups = [];

  groups.push({
    title: '均线',
    items: [
      { key: 'ma50',  label: 'MA50',  color: '#ffb74d', toggle: v => ma50.applyOptions({ visible: v }) },
      { key: 'ma150', label: 'MA150', color: '#ba68c8', toggle: v => ma150.applyOptions({ visible: v }) },
      { key: 'ma200', label: 'MA200', color: '#4fc3f7', toggle: v => ma200.applyOptions({ visible: v }) },
    ],
  });

  const priceItems = [
    { key: 'h52w',    label: '52w 高', color: '#9c27b0', toggle: v => lineH52w.set(v) },
    { key: 'l52w',    label: '52w 低', color: '#4caf50', toggle: v => lineL52w.set(v) },
  ];
  if (lineExt) priceItems.push({ key: 'ext', label: 'MA50 +25%', color: '#ff5252', toggle: v => lineExt.set(v) });
  groups.push({ title: '价位线', items: priceItems });

  if (zoneLayers.length) {
    groups.push({
      title: '支撑区',
      items: zoneLayers.map((zl, i) => ({
        key: 'zone' + i, label: zl.info.label, color: zl.info.border,
        toggle: v => { zl.series.applyOptions({ visible: v }); zl.line.set(v); },
      })),
    });
  }

  if (epLines) {
    groups.push({
      title: '入场计划',
      items: [
        { key: 'ep-zone', label: '盈亏区域', color: '#26a69a',
          toggle: v => { epZones.greenZone.applyOptions({ visible: v }); epZones.redZone.applyOptions({ visible: v }); } },
        { key: 'ep-line', label: 'pivot / 止损 / T1 / T2', color: '#42a5f5',
          toggle: v => epLines.forEach(l => l.set(v)) },
      ],
    });
  }

  groups.push({
    title: '其他',
    items: [
      { key: 'vol', label: '成交量', color: '#26a69a',
        toggle: v => volSeries.applyOptions({ visible: v }) },
      { key: 'markers', label: '事件标记', color: '#d32f2f',
        toggle: v => candle.setMarkers(v ? DATA.markers : []) },
      { key: 'vp', label: '成交分布 (VP)', color: '#ff9800',
        toggle: v => { vpEnabled = v; drawVolumeProfile(); } },
    ],
  });

  groups.forEach(g => {
    const wrap = document.createElement('div');
    wrap.className = 'lp-group';
    const t = document.createElement('div');
    t.className = 'lp-group-title';
    t.textContent = g.title;
    wrap.appendChild(t);
    g.items.forEach(it => {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.key = it.key;
      cb.addEventListener('change', () => it.toggle(cb.checked));
      const sw = document.createElement('span');
      sw.className = 'lp-swatch';
      sw.style.background = it.color;
      const txt = document.createTextNode(it.label);
      lbl.appendChild(cb);
      lbl.appendChild(sw);
      lbl.appendChild(txt);
      wrap.appendChild(lbl);
    });
    body.appendChild(wrap);
  });
})();

(function syncTimeScales(charts) {
  let syncing = false;
  charts.forEach(src => {
    src.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (syncing || !range) return;
      syncing = true;
      charts.forEach(dst => { if (dst !== src) dst.timeScale().setVisibleLogicalRange(range); });
      syncing = false;
    });
  });
})([mainChart, rsChart, vrChart]);

if (DATA.candles.length) {
  const lastTs  = DATA.candles[DATA.candles.length - 1].time;
  const startTs = DATA.candles[Math.max(0, DATA.candles.length - 90)].time;
  mainChart.timeScale().setVisibleRange({ from: startTs, to: lastTs });
}

window.addEventListener('resize', () => {
  mainChart.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight });
  rsChart.applyOptions({ width: rsEl.clientWidth, height: rsEl.clientHeight });
  vrChart.applyOptions({ width: vrEl.clientWidth, height: vrEl.clientHeight });
});
</script>
</body>
</html>
"""


def build_sepa_html(data: dict) -> tuple[str, dict]:
    """Build the SEPA dashboard HTML from a structured input dict.

    Returns (html, meta) where meta has computed summary (verdict tier, slug source).
    """
    symbol = data.get("symbol")
    if not symbol:
        raise client.ClientError("sepa: input.symbol is required", exit_code=2)
    name = data.get("name") or symbol
    as_of = data.get("as_of_date", "")
    kline = data.get("kline") or []
    spy_kline = data.get("spy_kline") or []
    position = data.get("position") or {}
    context = data.get("context") or {}
    earnings_dates = context.get("earnings_dates") or []

    times_ts, dates, opens, highs, lows, closes, vols = _coerce_klines(kline, "kline")

    ma50_arr  = _sma(closes, 50)
    ma150_arr = _sma(closes, 150)
    ma200_arr = _sma(closes, 200)
    vol20_arr = _sma(vols, 20)

    last = closes[-1]
    prev = closes[-2] if len(closes) >= 2 else last
    chg_pct = (last / prev - 1) * 100 if prev else 0.0

    ma50_now  = ma50_arr[-1]  or last
    ma150_now = ma150_arr[-1] or last
    ma200_now = ma200_arr[-1] or last

    def _ma_ago(arr: list[float | None], days: int) -> float | None:
        idx = len(arr) - 1 - days
        return arr[idx] if 0 <= idx < len(arr) else None

    ma200_1m = _ma_ago(ma200_arr, 21)
    ma200_4m = _ma_ago(ma200_arr, 84)

    window = min(252, len(highs))
    high_52w = max(highs[-window:])
    low_52w  = min(lows[-window:])

    candles = [
        {"time": times_ts[i], "open": opens[i], "high": highs[i], "low": lows[i], "close": closes[i]}
        for i in range(len(times_ts))
    ]
    volumes_js: list[dict] = []
    for i in range(len(times_ts)):
        color = "#26a69a" if closes[i] >= opens[i] else "#ef5350"
        if vol20_arr[i] is not None and vols[i] >= 1.5 * vol20_arr[i]:
            color = "#ff5722"
        volumes_js.append({"time": times_ts[i], "value": vols[i], "color": color})

    vol_ratio_js: list[dict] = []
    for i in range(len(times_ts)):
        if not vol20_arr[i]:
            continue
        r = vols[i] / vol20_arr[i]
        if r >= 1.5: color = "#ff5722"
        elif r < 0.5: color = "#9e9e9e"
        else: color = "#42a5f5"
        vol_ratio_js.append({"time": times_ts[i], "value": round(r, 3), "color": color})

    spy_map: dict[int, float] = {}
    spy_excess_21d = spy_excess_126d = None
    if spy_kline:
        _spy_times, _, _, _, _, spy_closes, _ = _coerce_klines(spy_kline, "spy_kline")
        spy_map = {t: c for t, c in zip(_spy_times, spy_closes)}
        for lb, store_key in [(21, "rs21"), (63, "rs63"), (126, "rs126")]:
            pass
        rs21 = _rs_series(closes, times_ts, spy_map, 21)
        rs63 = _rs_series(closes, times_ts, spy_map, 63)
        rs126 = _rs_series(closes, times_ts, spy_map, 126)
        if rs21:  spy_excess_21d  = rs21[-1]["value"]
        if rs126: spy_excess_126d = rs126[-1]["value"]
    else:
        rs21 = rs63 = rs126 = []

    markers = _detect_markers(
        times_ts, dates, opens, highs, closes, vols, vol20_arr, ma50_arr, ma200_arr, high_52w, earnings_dates
    )

    checks = _compute_checks(
        last, ma50_now, ma150_now, ma200_now, ma200_1m, ma200_4m,
        high_52w, low_52w, spy_excess_21d, spy_excess_126d,
    )

    verdict = context.get("verdict") or _auto_verdict(checks, last, ma50_now)

    vp_cfg = context.get("volume_profile") or {}
    vp = _compute_volume_profile(
        highs, lows, vols,
        lookback=int(vp_cfg.get("lookback_days", 120)),
        n_bins=int(vp_cfg.get("bins", 30)),
    )

    raw_zones = context.get("support_zones")
    if raw_zones is None and context.get("auto_support_zones", True):
        support_zones = _default_support_zones(
            closes, highs, lows, ma50_now, ma150_now, ma200_now, vp,
        )
    else:
        support_zones = _normalize_support_zones(raw_zones)

    entry_plan_raw = context.get("entry_plan")
    entry_plan = None
    if entry_plan_raw and entry_plan_raw.get("pivot"):
        pivot = float(entry_plan_raw["pivot"])
        stop = float(entry_plan_raw["stop"]) if entry_plan_raw.get("stop") else round(pivot * 0.93, 2)
        t1_pct = float(entry_plan_raw.get("target1_pct", 8))
        t2_pct = float(entry_plan_raw.get("target2_pct", 15))
        buy_zone_high = round(pivot * 1.05, 2)
        target1 = round(pivot * (1 + t1_pct / 100), 2)
        target2 = round(pivot * (1 + t2_pct / 100), 2)
        stop_pct = (stop / pivot - 1) * 100
        rr = (target2 - pivot) / (pivot - stop) if pivot > stop else 0
        rr_ok = rr >= 2.0
        rr_great = rr >= 3.0
        entry_plan = {
            "pivot": pivot,
            "buy_zone_high": buy_zone_high,
            "stop": stop,
            "stop_pct": stop_pct,
            "target1": target1,
            "target1_pct": t1_pct,
            "target2": target2,
            "target2_pct": t2_pct,
            "rr": rr,
            "rr_ok": rr_ok,
            "rr_great": rr_great,
            "note": entry_plan_raw.get("note", ""),
            "hypothetical": bool(entry_plan_raw.get("hypothetical")),
        }

    icon_map = {"pass": "✅", "fail": "❌", "unknown": "⚠"}
    checks_html_parts = []
    for c in checks:
        icon = icon_map.get(c["status"], "⚠")
        checks_html_parts.append(
            f'<div class="check-item {c["status"]}">'
            f'<div class="check-icon">{icon}</div>'
            f'<div class="check-body">'
            f'<div class="check-label">{c["label"]}</div>'
            f'<div class="check-val">{c["val"]}</div>'
            f'</div></div>'
        )
    checks_html = "\n".join(checks_html_parts)

    stage_html = ""
    if context.get("stage") or context.get("base_count") or context.get("pattern"):
        stage_rows = []
        for k, v in [("阶段", context.get("stage", "")),
                     ("阶段备注", context.get("stage_note", "")),
                     ("Base 数", context.get("base_count", "")),
                     ("形态", context.get("pattern", ""))]:
            if v:
                stage_rows.append(f'<div class="k">{k}</div><div class="v" style="text-align:left;">{v}</div>')
        if stage_rows:
            stage_html = ('<div class="section-title">阶段判断</div>'
                          '<div class="grid2">' + "".join(stage_rows) + "</div>")

    entry_plan_html = ""
    if entry_plan:
        ep = entry_plan
        hypo_badge = ' <span style="font-size:10px;background:#444;padding:1px 6px;color:#ddd;">假设性</span>' if ep["hypothetical"] else ""
        rr_cls = "up" if ep["rr_great"] else ("v" if ep["rr_ok"] else "down")
        rr_warn = "" if ep["rr_ok"] else " ⚠ <2:1 SEPA 不入场"
        note_html = f'<div style="font-size:11px;color:#8b949e;margin-top:6px;line-height:1.4;">{ep["note"]}</div>' if ep["note"] else ""
        entry_plan_html = (
            f'<div class="section-title">入场计划{hypo_badge}</div>'
            '<div class="grid2">'
            f'<div class="k">买入区间 (pivot+5%)</div><div class="v">${ep["pivot"]:.2f} – ${ep["buy_zone_high"]:.2f}</div>'
            f'<div class="k">止损</div><div class="v down">${ep["stop"]:.2f} ({ep["stop_pct"]:+.1f}%)</div>'
            f'<div class="k">第一目标 (+{ep["target1_pct"]:.0f}%)</div><div class="v up">${ep["target1"]:.2f}</div>'
            f'<div class="k">第二目标 (+{ep["target2_pct"]:.0f}%)</div><div class="v up">${ep["target2"]:.2f}</div>'
            f'<div class="k">R/R 比例 (基于 T2)</div><div class="v {rr_cls}">{ep["rr"]:.2f} : 1{rr_warn}</div>'
            "</div>"
            f'{note_html}'
            '<div style="font-size:10px;color:#6e7681;margin-top:8px;line-height:1.5;border-left:2px solid #21262d;padding-left:8px;">'
            '<b>三阶段止损（SEPA 规则）</b><br>'
            '① 入场后硬止损 −7~8%，绝不下移<br>'
            '② 涨 +8%：卖一半，止损上移到本钱（不再亏）<br>'
            '③ 涨 +15%：再卖 25%，剩仓沿 20MA 跟踪；跌破 20MA 全清'
            '</div>'
        )

    support_zones_html = ""
    if support_zones:
        zone_rows = []
        for z in support_zones:
            dist = (z["high"] + z["low"]) / 2 / last * 100 - 100
            sources_str = (
                f'<span style="color:#6e7681;"> · {" / ".join(z["sources"])}</span>'
                if z["sources"] else ""
            )
            zone_rows.append(
                f'<div class="zone-item" style="--zc: {z["axis_color"]};">'
                f'<div class="zone-head">'
                f'<span class="zone-label">{z["label"]}</span>'
                f'<span class="zone-range">${z["low"]:.2f} – ${z["high"]:.2f} ({dist:+.1f}%)</span>'
                f'</div>'
                f'<div class="zone-meta">{z["note"]}{sources_str}</div>'
                f'</div>'
            )
        support_zones_html = (
            '<div class="section-title">支撑区</div>'
            + "".join(zone_rows)
        )

    position_html = ""
    if position:
        shares = position.get("shares")
        cost = position.get("cost")
        if shares and cost:
            unr = (last - cost) * shares
            unr_pct = (last / cost - 1) * 100
            pnl_cls = "up" if unr >= 0 else "down"
            position_html = (
                '<div class="section-title">持仓视角</div>'
                '<div class="grid2">'
                f'<div class="k">持仓</div><div class="v">{shares} sh</div>'
                f'<div class="k">成本</div><div class="v">${cost:.2f}</div>'
                f'<div class="k">浮{("盈" if unr >= 0 else "亏")}</div><div class="v {pnl_cls}">${unr:+.2f} ({unr_pct:+.2f}%)</div>'
                f'<div class="k">守仓边界 (50MA)</div><div class="v">${ma50_now:.2f}</div>'
                "</div>"
            )

    rs_kvs = ""
    if spy_excess_21d is not None:
        cls21 = "up" if spy_excess_21d >= 0 else "down"
        rs_kvs += f'<div class="k">RS 21d (vs SPY)</div><div class="v {cls21}">{spy_excess_21d:+.1f} pp</div>'
    if spy_excess_126d is not None:
        cls126 = "up" if spy_excess_126d >= 0 else "down"
        rs_kvs += f'<div class="k">RS 126d (vs SPY)</div><div class="v {cls126}">{spy_excess_126d:+.1f} pp</div>'

    chg_cls = "up" if chg_pct >= 0 else "down"
    chg_text = f"{chg_pct:+.2f}%"
    ext_line = ma50_now * 1.25 if ma50_now else 0

    data_js = {
        "candles": candles,
        "ma50":  _line_data(times_ts, ma50_arr),
        "ma150": _line_data(times_ts, ma150_arr),
        "ma200": _line_data(times_ts, ma200_arr),
        "volumes": volumes_js,
        "volRatio": vol_ratio_js,
        "rs21": rs21, "rs63": rs63, "rs126": rs126,
        "markers": markers,
        "high52w": high_52w,
        "low52w": low_52w,
        "extendedLine": ext_line,
        "entryPlan": entry_plan,
        "supportZones": support_zones,
        "volumeProfile": vp,
    }

    h52_pct = (last / high_52w - 1) * 100
    l52_pct = (last / low_52w - 1) * 100
    ma50_pct = (last / ma50_now - 1) * 100
    ma200_pct = (last / ma200_now - 1) * 100

    replacements = {
        "__TITLE__": f"{symbol} — SEPA Dashboard ({as_of})" if as_of else f"{symbol} — SEPA Dashboard",
        "__CDN__": LIGHTWEIGHT_CHARTS_CDN,
        "__SYMBOL__": symbol,
        "__NAME__": name,
        "__LAST__": f"{last:.2f}",
        "__CHG__": chg_text,
        "__CHG_CLS__": chg_cls,
        "__AS_OF__": as_of or dates[-1],
        "__VERDICT__": verdict["label"],
        "__REASON__": verdict["reason"],
        "__VC__": verdict["color"],
        "__STAGE_SECTION__": stage_html,
        "__CHECKS__": checks_html,
        "__H52__": f"{high_52w:.2f}",
        "__H52_PCT__": f"{h52_pct:+.2f}%",
        "__L52__": f"{low_52w:.2f}",
        "__L52_PCT__": f"{l52_pct:+.0f}%",
        "__MA50__": f"{ma50_now:.2f}",
        "__MA150__": f"{ma150_now:.2f}",
        "__MA200__": f"{ma200_now:.2f}",
        "__MA50_PCT__": f"{ma50_pct:+.2f}%",
        "__MA50_CLS__": "up" if ma50_pct >= 0 else "down",
        "__MA200_PCT__": f"{ma200_pct:+.2f}%",
        "__MA200_CLS__": "up" if ma200_pct >= 0 else "down",
        "__RS_KVS__": rs_kvs,
        "__SUPPORT_ZONES_SECTION__": support_zones_html,
        "__ENTRY_PLAN_SECTION__": entry_plan_html,
        "__POSITION_SECTION__": position_html,
        "__DATA__": json.dumps(data_js, ensure_ascii=False, default=str),
    }

    html = SEPA_HTML_TEMPLATE
    for k, v in replacements.items():
        html = html.replace(k, v)

    return html, {
        "verdict_tier": verdict["tier"],
        "fails": sum(1 for c in checks if c["status"] == "fail"),
        "passes": sum(1 for c in checks if c["status"] == "pass"),
        "bars": len(times_ts),
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


def load_dict(args) -> dict:
    if args.data:
        with open(args.data, encoding="utf-8") as f:
            data = json.load(f)
    else:
        if sys.stdin.isatty():
            raise client.ClientError(
                "No input. Pipe JSON object to stdin or pass --data <path>.",
                exit_code=2,
                hint='e.g. render.py --type sepa --data input.json (input is an OBJECT, not array)',
            )
        data = json.load(sys.stdin)
    if not isinstance(data, dict):
        raise client.ClientError(
            "sepa input must be a JSON object.",
            exit_code=2,
            hint=f"Got: {type(data).__name__}; expected dict with keys {{symbol, kline, ...}}",
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

ALL_TYPES = list(BUILDERS) + ["sepa"]


def _render_sepa(args) -> dict:
    payload = load_dict(args)
    html, meta = build_sepa_html(payload)
    symbol = payload.get("symbol", "sepa")
    title = args.title or f"{symbol} SEPA"

    if args.out:
        out = Path(args.out)
    else:
        today = datetime.now().strftime("%Y-%m-%d")
        sym_slug = slugify(symbol.replace(".US", "").replace(".HK", "").lower(), "sepa")
        out = PROJECT_ROOT / "journal" / "charts" / f"{today}-{sym_slug}-sepa.html"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    if args.open:
        open_in_browser(out)

    return client.success(
        {
            "path": str(out.resolve()),
            "type": "sepa",
            "symbol": symbol,
            "bars": meta["bars"],
            "verdict_tier": meta["verdict_tier"],
            "checks": {"passes": meta["passes"], "fails": meta["fails"]},
            "opened": bool(args.open),
        },
        chart_type="sepa",
    )


def main() -> dict:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--type", choices=ALL_TYPES, help="Chart kind")
    p.add_argument("--title", default="", help="Chart title (also used in output slug)")
    p.add_argument("--subtitle", default="", help="Source / units / disclaimer (flow/kline/cohort only)")
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
            "--type is required (flow|kline|cohort|sepa) unless --smoke.",
            exit_code=2,
        )

    if args.type == "sepa":
        return _render_sepa(args)

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
