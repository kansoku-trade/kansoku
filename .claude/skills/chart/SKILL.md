---
name: chart
description: >
  Render financial charts to a self-contained HTML file using ECharts via CDN.
  Three chart types: intraday capital-flow line (`flow`), OHLC candlestick with
  volume (`kline`), and cross-symbol signed-bar comparison (`cohort`). Input
  JSON formats match Longbridge CLI native output, so you can pipe
  `longbridge capital --flow` / `longbridge kline` directly. Output lands in
  `journal/charts/YYYY-MM-DD-<slug>.html`. Triggers: 出图、生成图表、画 K 线、
  画资金流曲线、画对比图、可视化、render chart, plot, visualise, save as html.
---

# chart

Generates self-contained HTML charts (ECharts via CDN) so the user can open
them in a browser instead of squinting at tables.

> **Response language**: match the user — 简体 / 繁體 / English.

## When to call

- After running `longbridge capital --flow` and the user wants a visual ⇒ `flow`
- After running `longbridge kline` for multi-day K-line review ⇒ `kline`
- After collecting cumulative net inflow across a cohort of symbols
  (e.g. storage vs Mag 7) ⇒ `cohort`
- When inside `capital-rotation` / `market-session-tracker` / `stock-deep-dive`,
  call this as the LAST step and append a link to the produced HTML in the
  markdown journal entry.

Skip when the user only wants a single number or a tiny series — a Unicode
sparkline in the chat reply is faster.

## CLI

```bash
# All three modes read JSON from stdin OR from --data <path>
longbridge capital MU.US --flow --format json \
  | python3 .claude/skills/chart/scripts/render.py \
      --type flow \
      --title "MU 主力资金流 2026-06-25" \
      --subtitle "Source: Longbridge · 单位推断为千 USD · 仅供参考" \
      --open

longbridge kline NVDA.US --period day --count 30 --format json \
  | python3 .claude/skills/chart/scripts/render.py \
      --type kline --title "NVDA 30 日 K 线" --open

# Cohort takes [{symbol, value}] or [{label, value, group}]
echo '[{"symbol":"MU","value":-17087},{"symbol":"NVDA","value":-35728}]' \
  | python3 .claude/skills/chart/scripts/render.py \
      --type cohort --title "存储 vs Mag 7 主力净流" --open
```

Flags:

| Flag | Required | Meaning |
|---|---|---|
| `--type {flow,kline,cohort}` | yes (unless `--smoke`) | Chart kind |
| `--title <str>` | no | Chart title (used in HTML `<title>` and output slug) |
| `--subtitle <str>` | no | Source / units / disclaimer line under the title |
| `--data <path>` | no | JSON path; if omitted, reads stdin |
| `--out <path>` | no | Override output path; default `journal/charts/YYYY-MM-DD-<slug>.html` |
| `--open` | no | After write, open the file in the default browser (macOS `open`) |
| `--smoke` | no | Self-test: render synthetic cohort to `/tmp` and verify |
| `--help` | no | Standard argparse help |

## Input JSON contracts

| Type | Shape | Source |
|---|---|---|
| `flow` | `[{"time": ISO-8601, "inflow": str-or-num}, ...]` | `longbridge capital <SYM> --flow` |
| `kline` | `[{"time": ISO-8601, "open": ..., "high": ..., "low": ..., "close": ..., "volume": ...}, ...]` | `longbridge kline <SYM>` |
| `cohort` | `[{"symbol": str, "value": num}, ...]` or `[{"label": str, "value": num, "group"?: str}, ...]` | hand-rolled JSON from cohort net flows |

Numeric strings (Longbridge default) are accepted — `float(...)` cast happens in Python.

## Output contract

On success (stdout):
```json
{"ok": true, "data": {"path": "/abs/path/to/file.html", "type": "flow", "rows": 246}, "meta": {"chart_type": "flow"}}
```

On failure:
```json
{"ok": false, "error": "...", "hint": "..."}
```

## Sparkline alternative (no script)

For tiny in-chat previews, the LLM should render Unicode sparklines directly:
`▁▂▄▆█` plus ANSI green/red. No file generated. Use for 5-20-point series
where a full HTML chart would be overkill.

## Storage

- HTML files: `journal/charts/YYYY-MM-DD-<slug>.html` — gitignored (under `journal/`)
- The skill itself: `.claude/skills/chart/` — committed to public repo

## Related skills

- `longbridge-capital-flow` — produces `flow` JSON
- `longbridge-kline` — produces `kline` JSON
- `capital-rotation` — should call `cohort` at the end
- `market-session-tracker` — may call `flow` and `kline`
