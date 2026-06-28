#!/usr/bin/env python3
"""Weekly market watch — pulls 4 key signals + market temp, writes journal entry.

Designed to run weekly (e.g. Monday morning) via launchd. Anchors on the
4-item watchlist defined in journal/2026-06-26-fear-vs-tape.md §7:
  1. Hyperscaler capex guidance (qualitative — only flagged near earnings)
  2. Hyperscaler IG bond spreads (qualitative — needs FRED, hard-coded reminder)
  3. MU earnings call "customer inventory rising" language (countdown only)
  4. NVDA forward backlog QoQ delta (countdown only)

And 5 quantitative thresholds checkable from longbridge alone:
  - Market temp > 85 (euphoria) or < 25 (panic)
  - VXX sustained > 35
  - SPY drawdown > 10% from 50-day high
  - MAGS + MU + SMH same-week all red (rotation vs systemic discriminator)
  - DRAM ETF AUM (manual — printed reminder only)

Output: ok-envelope JSON to stdout + markdown file to journal/.
"""

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
JOURNAL_DIR = REPO_ROOT / "journal"

INDEX_SYMBOLS = ["SPY.US", "QQQ.US", "MAGS.US", "DIA.US", "IWM.US"]
AI_MAIN = ["MU.US", "NVDA.US", "MRVL.US", "SMH.US", "SOXX.US", "DRAM.US"]
RISK_SIGNAL = ["VXX.US", "GLD.US", "TLT.US"]
ALL_SYMBOLS = INDEX_SYMBOLS + AI_MAIN + RISK_SIGNAL

EARNINGS_CALENDAR = {
    "NVDA.US": ("2026-08-27", "NVDA Q2 FY27 — 听 forward backlog 是否首次环比下滑"),
    "MU.US":   ("2026-12-18", "MU Q4 FY26 — 听是否出现「customer inventory rising」措辞"),
    "MSFT.US": ("2026-10-29", "MSFT Q1 FY27 — 听 CFO 是否用 'review pace of AI investment'"),
    "META.US": ("2026-10-29", "META Q3 — 听 capex 指引方向"),
    "GOOGL.US": ("2026-10-28", "GOOGL Q3 — 听 capex 指引方向"),
    "AMZN.US": ("2026-10-30", "AMZN Q3 — 听 AWS AI capex 措辞"),
}

CO_MOVEMENT_LOOKBACK_DAYS = 7


def lb_json(*args, timeout=30, retries=2):
    cmd = ["longbridge", *args, "--format", "json"]
    last_err = None
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            last_err = f"timeout after {timeout}s"
            continue
        if result.returncode == 0:
            return json.loads(result.stdout)
        last_err = result.stderr.strip() or result.stdout.strip()
    raise RuntimeError(f"longbridge {' '.join(args)} failed after {retries+1} tries: {last_err}")


def market_temp_dict():
    raw = lb_json("market-temp", "US")
    return {row["field"]: row["value"] for row in raw}


def quotes_by_symbol(symbols):
    raw = lb_json("quote", *symbols)
    return {q["symbol"]: q for q in raw}


def daily_klines(symbol, count=60):
    return lb_json("kline", symbol, "--period", "day", "--count", str(count))


def pct_change(curr, prev):
    if prev == 0:
        return 0.0
    return (curr - prev) / prev * 100


def week_change_pct(symbol):
    klines = daily_klines(symbol, count=CO_MOVEMENT_LOOKBACK_DAYS + 1)
    if len(klines) < 2:
        return None
    first_close = float(klines[0]["close"])
    last_close = float(klines[-1]["close"])
    return pct_change(last_close, first_close)


def spy_drawdown_from_50d_high(quotes):
    klines = daily_klines("SPY.US", count=50)
    if not klines:
        return None, None
    high_50d = max(float(k["high"]) for k in klines)
    spy_now = float(quotes["SPY.US"]["last"])
    return pct_change(spy_now, high_50d), high_50d


def earnings_countdown(today):
    out = []
    for sym, (datestr, note) in EARNINGS_CALENDAR.items():
        try:
            target = datetime.strptime(datestr, "%Y-%m-%d").date()
        except ValueError:
            continue
        days = (target - today).days
        if days < -7:
            continue
        out.append({"symbol": sym, "date": datestr, "days_left": days, "note": note})
    return sorted(out, key=lambda x: x["days_left"])


def evaluate_thresholds(temp, quotes, weekly_changes, spy_dd):
    flags = []

    try:
        t = int(temp.get("Temperature", "0"))
        if t > 85:
            flags.append(("狂热警戒", f"市场温度 {t} > 85（极度看多）→ 历史顶部常见区间"))
        elif t < 25:
            flags.append(("恐慌警戒", f"市场温度 {t} < 25（极度恐慌）→ 历史底部常见区间"))
    except ValueError:
        pass

    vxx = quotes.get("VXX.US")
    if vxx:
        vxx_last = float(vxx["last"])
        if vxx_last > 35:
            flags.append(("VXX 高位", f"VXX 收 {vxx_last:.2f} > 35（真恐慌阈值）"))

    if spy_dd is not None and spy_dd < -10:
        flags.append(("大盘走弱", f"SPY 距 50 日高点 {spy_dd:.2f}%（< -10%）→ 大盘已进入修正"))

    mags_w = weekly_changes.get("MAGS.US")
    mu_w = weekly_changes.get("MU.US")
    smh_w = weekly_changes.get("SMH.US")
    if all(x is not None and x < 0 for x in (mags_w, mu_w, smh_w)):
        flags.append((
            "三同跌",
            f"MAGS/MU/SMH 本周同步下跌（MAGS {mags_w:+.2f}% / MU {mu_w:+.2f}% / SMH {smh_w:+.2f}%）→ "
            "区分轮动 vs 系统性的关键信号"
        ))

    return flags


def render_markdown(today, temp, quotes, weekly_changes, spy_dd, spy_50d_high, flags, earnings):
    lines = [
        f"# {today.isoformat()} · 每周市场观察 (auto)",
        "",
        f"**生成时间**: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"**脚本**: `.claude/skills/market-session-tracker/scripts/weekly-watch.py`",
        f"**关联**: [2026-06-26-fear-vs-tape.md](2026-06-26-fear-vs-tape.md) §7（4 项观察清单）",
        "",
        "---",
        "",
        "## 1. 阈值警报",
        "",
    ]
    if flags:
        for tag, msg in flags:
            lines.append(f"- **🔴 {tag}** — {msg}")
    else:
        lines.append("**无警报**。5 项量化阈值全部安全。继续按节奏观察。")
    lines.extend(["", "---", "", "## 2. 市场温度（长桥读数）", ""])
    lines.append(f"- 温度: **{temp.get('Temperature', '?')}** — {temp.get('Description', '?')}")
    lines.append(f"- 估值: {temp.get('Valuation', '?')} · 情绪: {temp.get('Sentiment', '?')}")

    lines.extend(["", "---", "", "## 3. 关键指数本周走势", "",
                  "| 标的 | 现价 | 距 prev close | 本周变化 |",
                  "|---|---:|---:|---:|"])
    for sym in INDEX_SYMBOLS:
        q = quotes.get(sym)
        if not q:
            continue
        w = weekly_changes.get(sym)
        w_str = f"{w:+.2f}%" if w is not None else "—"
        lines.append(f"| {sym} | {q['last']} | {q['change_percentage']}% | {w_str} |")

    lines.append("")
    if spy_dd is not None:
        lines.append(f"**SPY 距 50 日高点**: {spy_dd:+.2f}% （50 日高 = ${spy_50d_high:.2f}）")

    lines.extend(["", "---", "", "## 4. AI 主线本周走势", "",
                  "| 标的 | 现价 | 距 prev close | 本周变化 |",
                  "|---|---:|---:|---:|"])
    for sym in AI_MAIN:
        q = quotes.get(sym)
        if not q:
            continue
        w = weekly_changes.get(sym)
        w_str = f"{w:+.2f}%" if w is not None else "—"
        lines.append(f"| {sym} | {q['last']} | {q['change_percentage']}% | {w_str} |")

    lines.extend(["", "---", "", "## 5. 风险信号资产", "",
                  "| 标的 | 现价 | 距 prev close | 本周变化 |",
                  "|---|---:|---:|---:|"])
    for sym in RISK_SIGNAL:
        q = quotes.get(sym)
        if not q:
            continue
        w = weekly_changes.get(sym)
        w_str = f"{w:+.2f}%" if w is not None else "—"
        lines.append(f"| {sym} | {q['last']} | {q['change_percentage']}% | {w_str} |")

    lines.extend(["", "---", "", "## 6. 财报倒计时", ""])
    if earnings:
        lines.append("| 标的 | 日期 | 倒计时 | 要听的信号 |")
        lines.append("|---|---|---:|---|")
        for e in earnings:
            days = e["days_left"]
            badge = f"{days} 天" if days >= 0 else f"刚过 {-days} 天（应已读电话会）"
            lines.append(f"| {e['symbol']} | {e['date']} | {badge} | {e['note']} |")
    else:
        lines.append("近期无关键财报（窗口 -7 天 +∞）。")

    lines.extend([
        "",
        "---",
        "",
        "## 7. 不能自动测、要人工去看的（提醒）",
        "",
        "- **超大厂投资级债券利差**（需要 FRED / 第三方）—— 当前基线 +50-80bp。破 +100bp 预警，破 +150bp 触发清单 §11。手动查：FRED `BAMLC0A4CBBB` 或 IG 利差仪表盘。",
        "- **DRAM 杠杆 ETF AUM**（清单 §6 散户 FOMO 标记）—— 当前约 $XB（手动查 ETF issuer 页）。破 $5B 触发。",
        "- **Samsung/SK Hynix 新增消费级 DRAM 产能新闻**（清单 §1）—— 手动关注三星 / SK 海力士 capex announcement。",
        "- **超大厂 CFO 对 AI ROI 的措辞**（清单 §7，最毒）—— 关注 \"review pace of AI investment\" 类原话。",
        "",
        "---",
        "",
        "**数据源**: 长桥证券 · **Disclaimer**: ⚠️ 仅供参考，不构成投资建议",
    ])

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Weekly market watch — pulls 4 key signals + market-temp.")
    parser.add_argument("--smoke", action="store_true", help="Connectivity self-test")
    parser.add_argument("--json", action="store_true", help="Output JSON envelope only")
    parser.add_argument("--no-write", action="store_true", help="Print markdown to stdout, do not write to journal/")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    if args.smoke:
        try:
            temp = market_temp_dict()
            envelope = {"ok": True, "data": {"market_temp": temp}, "meta": {"smoke": True}}
            print(json.dumps(envelope, ensure_ascii=False, indent=2))
            sys.exit(0)
        except Exception as exc:
            envelope = {"ok": False, "error": str(exc), "hint": "check `longbridge auth login` / network"}
            print(json.dumps(envelope, ensure_ascii=False), file=sys.stderr)
            sys.exit(1)

    try:
        if args.verbose:
            print("[verbose] pulling market temp…", file=sys.stderr)
        temp = market_temp_dict()

        if args.verbose:
            print(f"[verbose] pulling quotes for {len(ALL_SYMBOLS)} symbols…", file=sys.stderr)
        quotes = quotes_by_symbol(ALL_SYMBOLS)

        if args.verbose:
            print("[verbose] computing weekly changes…", file=sys.stderr)
        weekly_changes = {}
        for sym in ALL_SYMBOLS:
            try:
                weekly_changes[sym] = week_change_pct(sym)
            except Exception as exc:
                if args.verbose:
                    print(f"[verbose] week_change {sym}: {exc}", file=sys.stderr)
                weekly_changes[sym] = None

        if args.verbose:
            print("[verbose] computing SPY 50d drawdown…", file=sys.stderr)
        try:
            spy_dd, spy_50d_high = spy_drawdown_from_50d_high(quotes)
        except Exception as exc:
            if args.verbose:
                print(f"[verbose] spy_dd: {exc}", file=sys.stderr)
            spy_dd, spy_50d_high = None, None

        flags = evaluate_thresholds(temp, quotes, weekly_changes, spy_dd)
        today = date.today()
        earnings = earnings_countdown(today)
        markdown = render_markdown(today, temp, quotes, weekly_changes, spy_dd, spy_50d_high, flags, earnings)

        out_path = None
        if not args.no_write:
            JOURNAL_DIR.mkdir(parents=True, exist_ok=True)
            out_path = JOURNAL_DIR / f"{today.isoformat()}-weekly-watch.md"
            out_path.write_text(markdown, encoding="utf-8")

        if args.json:
            envelope = {
                "ok": True,
                "data": {
                    "path": str(out_path) if out_path else None,
                    "flags": [{"tag": t, "msg": m} for t, m in flags],
                    "market_temp": temp,
                    "spy_drawdown_50d": spy_dd,
                    "earnings_upcoming": earnings,
                },
                "meta": {"date": today.isoformat(), "symbols": len(ALL_SYMBOLS)},
            }
            print(json.dumps(envelope, ensure_ascii=False, indent=2))
        elif args.no_write:
            sys.stdout.write(markdown)
        else:
            print(f"✓ wrote {out_path}")
            print(f"  flags fired: {len(flags)}{' — ' + ', '.join(t for t,_ in flags) if flags else ''}")

    except Exception as exc:
        envelope = {"ok": False, "error": str(exc), "hint": "check `longbridge auth login` / network / API quota"}
        print(json.dumps(envelope, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
