---
name: intraday-signal
description: >
  Short-term multi-timeframe (5m/15m/1h) technical read for a single symbol —
  pulls K-line across three timeframes, reads MACD + swing structure, writes a
  direction call (long/short/neutral) with an explicit anchor price, a 2–4
  scenario forward read, a range-bound playbook (long tactic + short tactic;
  a neutral call carries a numeric low/high zone instead of an entry plan and
  is scored on whether the zone held), an entry/stop/target plan with
  dual-basis R/R (T1 + T2) for directional calls only, position sizing with a
  nominal cap from the live broker account, an event-risk gate (earnings /
  FOMC / CPI), and
  market/sector alignment + relvol volume checks — MACD divergence/背驰,
  candle patterns like Pin Bar, and 123 structures are auto-detected and drawn
  server-side —
  then renders it via the `chart` skill (type `intraday`,
  POST preview → PATCH prediction) and logs a journal entry. US-only, single-symbol, short horizon (intraday to
  a few sessions) — a companion to `market-session-tracker`, not a replacement.
  Triggers: 短线预测、日内多周期、做多做空、5分钟15分钟1小时、MACD 背离、
  Pin Bar、入场点、盈亏比、short-term call, intraday prediction, entry point,
  risk reward ratio, multi-timeframe MACD.
---

# intraday-signal

Single-symbol, short-horizon technical read across 5 分钟 / 15 分钟 / 1 小时—
produces an explicit long/short call anchored to a price, a probability-weighted
forward read, and a concrete entry/stop/target plan, backed by server-side
auto-detected K-line signals (MACD divergence/背驰, candle patterns such as
Pin Bar, 123 structures). Ends by rendering an interactive dashboard and
writing a journal entry.

> **Scope**: one symbol per run. For a cross-section "where is money moving"
> question use `capital-rotation`; for live tracking of a watchlist across a
> session use `market-session-tracker`; this skill is the deep single-symbol
> drill-down when the user wants a concrete short-term trade read.

## When to use

- "MU 短线怎么走", "这里能不能做多/做空", "给我一个短线入场点"
- "5分钟15分钟1小时怎么看", "MACD 有没有背离", "这是不是 Pin Bar"
- "盈亏比多少", "入场点在哪", "止损止盈怎么设"
- **Not** for a broad market/sector scan (`capital-rotation`)
- **Not** for live multi-symbol session monitoring (`market-session-tracker`)
- **Not** for weeks/months-horizon swing entries (`sepa-strategy`)

## Workflow

### Step 1 — Resolve the symbol

If ambiguous (e.g. a company name with multiple listings), ask back rather than guessing.

### Step 2 — Tiered grounding context

The chart server pulls the three timeframes of K-line itself (5m/15m/1h × 1000
bars) — no manual `longbridge kline` calls needed. Multi-source grounding is
tiered so runs stay fast — pull the "always" tier every run, judge the rest by
the day's tape:

- **Always, before anything else: read `journal/lessons.md`** — the distilled
  lesson list from past post-mortems. Every rule there was paid for with a real
  loss; the read you're about to write must not repeat one. If a lesson applies
  to today's setup, say so explicitly in the report（如"止损已避开 1000 关口
  扎堆区，参照 lessons 2026-07-06"）.
- **Always, check first**: `twitter-reader` — X is the fastest tape on breaking
  news and sentiment; on an intraday horizon its lead time over aggregated feeds
  is exactly the window that matters. Search the symbol, read the last few hours.
  X sentiment is an *input*, not a conclusion — form the price-structure read in
  Step 3 independently, then reconcile; don't go hunting the chart for evidence
  of whatever narrative X planted. **If the `twitter-reader` skill is not
  available in the current session, don't silently skip it: write "X 未查"
  into the report/`context.sources_used`, and treat the 催化日/平静日 call as
  provisional（longbridge-news 有延迟，"还没看到新闻"不等于"没有新闻"）.**
- **Always: event risk（财报 + 宏观时刻表）**. Two calls, no manual hunting:
  `longbridge finance-calendar report --symbol <SYM>.US --format json`（下一个
  财报日；若返回为空再退回 news / X / IR 并注明未确认）and
  `longbridge finance-calendar macrodata --market US --star 3 --start <today>
  --end <horizon-end> --format json`（横跨持仓周期的重要宏观发布，带前值/预测；
  时间为 ET——CPI/非农 8:30, 多数数据 10:00, FOMC 决议 14:00 + 记者会 14:30）. Any
  hard event inside the trade horizon must appear in the scenarios — a stop
  cannot protect you through a gap（跳空开盘直接越过止损价，实际亏损可远大于计划）.
- **Always: market alignment（大盘/板块对齐）**. One call:
  `longbridge quote SPY.US QQQ.US <sector-ETF>.US`（如半导体 SMH、软件 IGV）.
  State whether the intended direction is with or against today's index/sector
  tape; trading against it is allowed but must be justified in one line.
- **Always: volume check**. `GET /api/symbols/<SYM>/relvol`（服务端已算好的
  相对成交量——当前量相对同时段常态量的倍数）+ `longbridge capital <SYM>.US
  --format json`（triple-bucket flow）. Breakouts and reversals without volume
  are suspects, not signals; cite relvol when calling any breakout real.
- **Always**: `longbridge-news` on the symbol — official/aggregated headlines.
  It lags X by minutes to hours, so treat it as confirmation and source-anchoring
  for what X surfaced, not as the breaking-news feed; its item timestamps are
  publish times, not event times. The chart server also auto-attaches raw
  headlines to the sidebar's `news` list, but that's unclassified — the AI must
  still read and tag them for `context`.
- **Always: options levels（期权关键价位）**. One call:
  `python3 .claude/skills/options-levels/scripts/levels.py <SYM>` — 现价附近
  最近两个到期日的高持仓行权价（磁铁位/止损扎堆区）+ 全链 put/call 比。
  上方高持仓 call 位 ≈ 上行磁铁与压力，下方高持仓 put 位 ≈ 支撑墙；这些
  价位直接约束 Step 4 的止损与目标摆放（见 entry plan 规则）。CBOE 不覆盖
  的标的（无期权）注明"期权 N/A"即可。
- **On-demand** (judge by the day's tape, don't run every time): `trump-truth-monitor`
  (policy-sensitive days), `sec-edgar` (filing/insider leads), `gdelt` / `fred`
  (macro event days).
- Whatever was actually pulled goes into `context.sources_used` (Step 4).
- Housekeeping, pulled as needed regardless of tiering: the user's live position
  via `longbridge positions --format json` if they hold this symbol, and account
  size via `longbridge portfolio --format json` (needed for position sizing in
  Step 4 — never ask the user, read the broker).

### Step 3 — Preview: read the technicals

Check the chart server is up (`curl -s http://localhost:5199/api/health`; if
down: `pnpm start` at the repo root in the background), then POST a preview (no
`prediction`):

```bash
curl -s -X POST http://localhost:5199/api/charts \
  -H 'Content-Type: application/json' \
  -d '{"type":"intraday","symbol":"<SYM>.US","name":"..."}'
```

Only add a `"position": {"shares": N, "cost": X}` field when `longbridge
positions` shows a **real** holding in this symbol — never a placeholder; a
fabricated position renders a bogus 持仓视角 card on the dashboard.

The response's `data.technicals` gives, per timeframe: the latest DIF/DEA/HIST,
the session VWAP（`last_vwap`，当日成交量加权均价——日内机构衡量贵贱的基准线，
m5/m15 有值）, the last ~6 swing highs/lows, the most recent 金叉/死叉
(`last_cross`), any
auto-detected `divergence_candidates` / `beichi_candidates`, and `pattern_123` —
auto-detected 123 reversal structures (①extreme → ②reaction pivot → ③higher-low /
lower-high), each with `status` (`forming` = trigger not yet broken, `confirmed` =
close broke the ② trigger), `trigger`, and `invalidation` prices. A `forming`
pattern_123 is a ready-made entry setup: entry at the ② trigger break, stop
beyond ① (all confirmed pivots only — the chart itself also draws these
automatically, in both preview and final render).
The response also carries `meta.day_context`（日线背景与日内参照位，服务端自动算）:
`daily_trend`（up/down/range，日线收盘对 MA20/MA50 的位置）、`daily_ma20`/`daily_ma50`、
`high_20d`/`low_20d`（近 20 个交易日高低）、`prev_day`（昨日高/低/收）、
`pre_market`（今日盘前高低）、`opening_range`（开盘前 30 分钟区间）、`vwap`。
`meta` 还带 `options_levels`（期权墙——服务端拉 CBOE 自动算，与 Step 2 的
`options-levels` 脚本同源同口径，preview 里有值时 Step 2 的脚本调用可省）和
`event_risk`（下次财报日 + 近 3 天重要宏观发布——同样可替代 Step 2 的
`finance-calendar` 调用）；两者都会渲染到页面（期权墙画线 + 事件风险卡）。
**先读 day_context 再读三个周期**——1 小时的"趋势"可能只是日线大区间里的一段震荡；
h1 方向与 `daily_trend` 相反时必须在报告里写明这是逆日线的判断。这些参照位
也画在图上（"日内参照位"图层）。

Read these numbers — don't guess MACD direction from eyeballing candles.
**MACD 是滞后的确认指标，不是方向的来源**：方向来自结构（摆动点、123、
关键参照位的攻守），MACD/背离只用来确认或否决，一根还没被结构支持的
背离候选不构成入场理由. Note the
auto-detector can't confirm a pivot on the last 1-2 bars (needs bars on both sides);
for very recent action, read `last_dif`/`last_dea`/`last_hist` directly and reason
about it yourself (e.g. a sharp reversal-and-close-on-the-low bar is a real signal
even before any swing/divergence algorithm can confirm it — see the MU 2026-07-01
session for an example: the auto-divergence check didn't catch the final-hour
blow-off because the session's last bar can't be a confirmed pivot yet).

### Step 4 — Write the technical read

**First, classify the day from Step 2's pull (消息面权重定级):**

- **催化日** — a live symbol-moving item exists today: earnings/guidance, policy
  or tariff news touching the name, a major industry headline, or any story that
  already visibly moved the price. News leads, technicals follow: technical
  levels are demoted to "where does it land after the shock" rather than
  direction; every scenario's probability must state how the news shifted it;
  if the news points against the technical read, cap the technical-side scenario
  at ≤40% or call `neutral`.
- **平静日** — no such item. Technicals lead; news is confirmation only and must
  not override a clean structure read.

State which regime was applied in `conclusion.summary`. Then, using the
timeframe data + Step 3's numbers, decide:

1. **Direction + anchor** — `long` / `short` / `neutral`, anchored to a specific
   timeframe + time + price (never a bare directional call with no anchor).
   **Timeframe roles（周期分工）**: 日线定背景（`day_context.daily_trend` +
   关键参照位——顺日线的短线判断成功率天然更高，逆日线要单独说明理由）,
   h1 定趋势方向, m15 定结构与入场, m5 只做触发与微调。
   **位置参照（必做）**: 方向判断必须对照 VWAP 与日内参照位说话——价格在
   VWAP 上方还是下方、离昨高/昨低/盘前高低/开盘区间哪条最近、是攻还是守。
   "突破"类情景的 trigger 应指向具体参照位（如"放量站上昨高"），而不是
   凭感觉画的价位。**The anchor lives on m15 by default** — `anchor.timeframe` also sets
   the dashboard's default tab. Anchor on m5 only for a pure scalp call, on h1
   only for a swing-level statement. Align `anchor.time` to a bar boundary of its
   timeframe (m15 → :00/:15/:30/:45).
2. **Scenarios** — 2 to 4, by real structure（通常是上破/震荡/下破三个，不要为
   凑数硬编一个 5% 的情景）, probabilities summing to ~100%, each with a `path`
   (what the K-line likely does) and a `trigger` (what confirms it). Reuse the
   3-scenario discipline from `market-session-tracker` (Bull/Base/Bear-style).
3. **Range-bound playbook** — if one scenario is "震荡/oscillating", fill
   `range_bound_plan` with an explicit tactic for **both** directions (`long_tactic`
   and `short_tactic`) — never describe only one side of a two-sided range.
   **For a `neutral` call the playbook additionally MUST carry numeric `low` /
   `high`（箱体下沿/上沿，low < high，须包住锚点价）** — 观望 = 预判价格守在
   这个区间内。这两个数是观望判断的事后对账依据：服务端会按"收盘价离开区间 =
   破位（判错）/ 守满一个交易时段 = 守住（判对）"记入记分板，没有它们观望就
   是一个说错零成本的空话。
4. **Entry plan** — `entry`, `stop`, `target1_pct`, `target2_pct` — **only for
   `long` / `short` calls. A `neutral` call submits NO `entry_plan`**: 观望就是
   现在没有可执行的入场/止损/目标，两侧的条件应对全部写进 `range_bound_plan`
   （见上一条），不要一边喊观望一边给价位。Steps 5–6 below (position size,
   trade management) likewise apply only to directional calls.
   - **Stop = structure, not a number.** The stop sits beyond a named structure
     (swing point 外沿、123 结构的 ①、区间边界), never a bare round number or
     arbitrary %. Name the structure in `stop_note`.
   - **Stop crowding check（止损显眼度）.** Before finalizing, check the stop
     against three crowded zones: 整数关口（±0.5%）、当日/昨日高低点（±0.3%）、
     Step 2 期权高持仓价位（±0.5%）. A stop inside any of them is where sweeps
     happen（2026-07-06 三笔止损全灭于 1000 关口上方）— either push it beyond
     the zone with extra cushion (smaller size for the wider stop), or switch
     to a confirmation entry（等反抽失败再进）. State in `stop_note` which
     zones were checked and cleared.
   - **R/R in both口径.** Compute direction-aware R/R twice: T1-based and
     T2-based (`long`: risk = entry−stop, reward = target−entry; `short`
     mirrored). Report both. **One unified rule（全仓库同一口径）: T1-based
     R/R < 1:1 → the plan is rejected, rework the entry or pass; 1:1–2:1 →
     allowed, but the report must explicitly say 赔率偏薄（the chart sidebar
     flags < 2:1 in red for the same reason — that's a warning, not the
     rejection line）.** If only the T2 口径 reaches 2:1, say so explicitly
     （远目标是有条件的，不许拿它化妆头条盈亏比）.
   - **Event gate.** Default: no holding through earnings or a scheduled
     FOMC/CPI-class release within the horizon. An exception must state the gap
     risk in one line（跳空可越过止损，最大亏损≠1R）.
   - **Session liquidity.** Entries outside regular hours（盘前/盘后）must be
     flagged: spreads wide, size thin, stop execution unreliable. Also note the
     9:30–10:00 ET window is fake-breakout-prone — a breakout entry there needs
     relvol confirmation.
5. **Position size（仓位）** — from the `longbridge portfolio` pull: risk
   budget = 1% of account value by default (0.5% on a 催化日 or counter-tape
   trade); `shares = floor(budget / |entry − stop|)`. **Nominal cap（名义上限）:
   the position's nominal value（shares × entry）must not exceed 30% of account
   value** — a tight stop makes the risk formula spit out huge share counts
   （止损贴得越近算出的股数越多，极端时名义金额会超过账户本身，等于隐性加杠杆）;
   when the risk-based size breaks the cap, cut shares to the cap and say so.
   Report 股数、名义金额、占账户 %。**A plan without a size is not a plan** —
   this is what separates an opinion from a trade.
6. **Trade management（入场后）** — write the management leg into
   `entry_plan.note` / the report: at T1 take half off and move the stop to
   breakeven（推保本）; time stop — **~6 bars of the anchor timeframe**
   (m5 锚点 ≈30min、m15 锚点 ≈1.5h、h1 锚点 ≈6h——波段级判断不该被日内级的
   时间止损误杀), if the trade hasn't moved by then the thesis is stale, exit
   flat; stopped out = stay out, no revenge re-entry unless a *new* structure
   signal forms.
7. **Existing position（若用户已持仓）** — the read must end with an explicit
   加 / 减 / 持 / 清 call on the live position, reconciled against cost basis —
   not just a fresh-entry plan alongside an ignored holding.
8. **Signals（可选）** — the chart auto-detects and draws MACD divergence/背驰,
   candle patterns, and 123 structures server-side; cite those markers in the
   report rather than re-labeling them. The only signal worth adding by hand is
   an `other`-type note for something the detectors cannot see yet — e.g. a
   last-bar blow-off whose pivot the swing algorithm can't confirm (the MU
   2026-07-01 final hour) — anchored to a specific `timeframe` + `time` +
   `price`.
9. **`context`** — besides `prediction`, write the `context` payload (see
   `chart` skill's `context` schema): tag every news/sentiment item pulled in
   Step 2 with `source` + `tag` + a one-line `note`, list what was actually
   pulled in `sources_used`, and write the `conclusion` card (`stance` /
   `summary` / `action`). `generated_at` = now, ISO timestamp.

### Step 5 — Final render

PATCH the same chart with BOTH `prediction` and `context` filled in, in one
call (see `chart` skill's `prediction` / `context` schemas for the full shapes):

```bash
curl -s -X PATCH http://localhost:5199/api/charts/<id-from-step-3> \
  -H 'Content-Type: application/json' \
  -d '{
    "prediction": { "direction": "short", "anchor": {"timeframe":"m15","time":"2026-07-06T14:15:00Z","price":61.10}, "scenarios": [ ... ] },
    "context": {
      "generated_at": "2026-07-06T14:30:00Z",
      "conclusion": { "stance": "short", "summary": "一句话综合判断", "action": "现在该做什么" },
      "news": [ { "time": "2026-07-06T13:10:00Z", "source": "longbridge", "tag": "catalyst", "title": "...", "note": "AI 一句话解读" } ],
      "sources_used": ["longbridge-news", "twitter-reader"]
    }
  }'
```

Include `position` in the Step-3 POST (from the optional `longbridge positions`
pull) if the user holds this symbol — the dashboard renders a 持仓视角 card.

### Step 6 — Report structure

Present in this order (mirrors the user's original ask):

1. 大盘/板块环境 + 事件风险（顺风还是逆风；财报/宏观时刻表内有没有雷）
2. 方向判断 + 锚点（在哪个位置做的判断）
3. 情景推演（后续 K 线可能的多种走势，带百分比）
4. 震荡应对（若为震荡情景：多、空两种打法）
5. 入场计划（双口径盈亏比 + 入场点/止损/目标 + 止损依托的结构）
6. 仓位建议（股数、名义金额、占账户 %、单笔风险额）+ 入场后管理（T1 减半推保本 / 时间止损）
7. 持仓处置（若已持仓：加 / 减 / 持 / 清，对照成本价）
8. 支撑信号（引用图上自动检测的 MACD 背离/背驰、K 线形态、123 结构，指到具体 K 线；如有 `other` 补充备注一并说明；量能 relvol 佐证）
9. 图表链接：主链接是 `data.url`（形如
   `http://localhost:5199/symbol/<SYM>?analysis=<id>`——标的驾驶舱页面钉在本次
   分析上，含本次预测/情景/入场/信号，分析完立即打开就是看它；旧的
   `http://localhost:5199/charts/<id>` 链接依然有效，会自动跳转到这里），辅链接是
   去掉 `?analysis=` 参数的驾驶舱主页 `http://localhost:5199/symbol/<SYM>`
   （聚合活数据 + 历史分析，永远跟随最新一次分析），附在后面
10. 免责声明：仅供参考，不构成投资建议

### Step 7 — Journal

Write `journal/YYYY-MM-DD-<symbol>-intraday.md` (US session date). Same-day
re-run on the same symbol appends a new timestamped section — never overwrite.
The cockpit's 历史 tab (`GET /api/symbols/:sym/analyses`, rendered on
`/symbol/<SYM>`) now lists past analyses for this symbol with a mechanical
outcome judgment (`hit_target` / `hit_stop` / `open`, computed server-side from
post-anchor bars) — that's a quick mechanical scoreboard, not a substitute for
the journal's narrative record.

**Calibration loop（对账）**: **every run**, before writing the journal entry,
pull `GET /api/overview/stats`（或该标的的 `GET /api/symbols/:sym/analyses`）
and copy the mechanical scoreboard into the entry — one line: 总次数、命中率、
目标/止损/守区间/破区间的分布（观望判断按守住/破位计入，说错不再是零成本）、
**平均盈亏倍数 `avg_r`（每笔平均赚/亏多少个止损单位——命中率 40% 但赢 2 亏 1
长期是赚的，命中率 70% 但赢小亏大照样亏，光看命中率会骗人）**.
The scoreboard is machine-judged, so this step is a copy, not an audit — no
counting discipline required. Scenario-probability calibration（标了 60% 的
情景实际兑现了几成）stays qualitative: when the scoreboard shows a losing
streak or the stated probabilities feel systematically over-confident, say so
in that day's entry — probabilities that never get compared against outcomes
degrade into rhetoric.

**Lesson distillation（教训沉淀）**: whenever a post-mortem (收盘复盘或单笔
对账) produces an actionable lesson — a rule that would have changed an entry,
a stop, or a probability — append it to `journal/lessons.md` as one dated line
(合并同类条目并加注重复次数; lessons already absorbed into skill rules move
to the file's 已固化 section, never deleted). A lesson that only lives in a
dated journal file is a lesson the next run will not see.

## Anti-patterns

- ❌ A directional call with no anchor price/time
- ❌ Scenarios that don't sum to ~100%, or only one scenario
- ❌ A range-bound call that only covers one direction (must give both long and short tactics)
- ❌ A `neutral` call without numeric `low`/`high` in `range_bound_plan`（没有区间的观望事后无法对账，等于零成本喊话）
- ❌ Submitting a plan whose T1-based R/R is below 1:1, or a 1:1–2:1 plan without explicitly calling the odds thin（赔率偏薄要写出来）
- ❌ Reporting only the T2-based R/R（拿有条件的远目标化妆盈亏比）
- ❌ An entry plan with no position size, or a size invented without pulling `longbridge portfolio`
- ❌ A stop parked on a round number / bare % with no structure behind it
- ❌ A stop inside a crowded zone（整数关口 / 当日昨日高低点 / 期权高持仓价位）without the crowding check named in `stop_note`
- ❌ Skipping `journal/lessons.md`, or repeating a mistake already recorded there without addressing it
- ❌ Finding the earnings date by manual news-hunting when `longbridge finance-calendar report --symbol` answers it in one call
- ❌ Calling `longbridge option quote`（本账户无期权行情权限，必报 no quote access）— per-strike data comes from `options-levels`
- ❌ Planning to hold through earnings or an FOMC/CPI-class event without naming the gap risk
- ❌ A counter-tape call (against SPY/QQQ/sector direction) with no one-line justification
- ❌ Calling a breakout real without citing relvol/volume
- ❌ "看起来有背离" without citing the auto-detected marker (or the two specific bars, if the detector hasn't confirmed it yet)
- ❌ Skipping the preview call and guessing MACD values instead of reading them
- ❌ Ignoring `day_context` — a direction call that never says where price sits vs VWAP / 昨日高低 / 盘前区间, or an h1-counter-daily call without naming it
- ❌ Using MACD divergence as the entry reason by itself, without a structure (swing / 123 / 参照位) backing the same read
- ❌ Skipping the journal write
- ❌ Contradicting a live `market-session-tracker` read for the same symbol without reconciling — this is a narrower, single-symbol lens, not an override
- ❌ Writing a `context.news` item without a `source`
- ❌ Skipping the 催化日/平静日 classification, or trading pure technical levels on a 催化日 without stating how the news shifted each scenario's probability
- ❌ Calling a day 平静 from `longbridge-news` alone without having checked X — longbridge lags; "no headline yet" there doesn't mean no news
- ❌ A `conclusion.action` that contradicts the prediction's direction without explaining why
- ❌ Pulling every on-demand source (`trump-truth-monitor` / `sec-edgar` / `gdelt` / `fred`) on every run — tiering exists to keep runs fast; judge by the day's tape

## Related skills

- `chart` — renders type `intraday`; this skill is chart's primary caller for that type
- `longbridge-kline` — same data the chart server pulls; call directly only for in-chat analysis
- `longbridge-capital-flow` — optional grounding context (distribution check)
- `options-levels` — always-tier: per-strike open-interest levels（磁铁位/止损扎堆区）+ put/call ratios from the CBOE delayed chain
- `twitter-reader` — always-tier, checked first (fastest tape on breaking news/sentiment)
- `longbridge-news` — always-tier grounding context (lagging official headlines; confirmation + source anchor)
- `trump-truth-monitor` — on-demand grounding context (policy-sensitive days)
- `sec-edgar` — on-demand grounding context (filing/insider leads)
- `gdelt` / `fred` — on-demand grounding context (macro event days)
- `market-session-tracker` — broader live multi-symbol session monitoring; this skill is the single-symbol short-term drill-down
- `sepa-strategy` — the weeks/months-horizon counterpart for swing entries
