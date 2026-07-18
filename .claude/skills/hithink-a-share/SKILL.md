---
name: hithink-a-share
description: A 股官方数据，来自同花顺（HiThink）官方 API——涨停股票池、连板天梯、龙虎榜、个股异动原因、热榜、A 股官方口径财报（利润表/资产负债表/现金流量表/财务指标）、行情快照与日 K。
---

# hithink-a-share

> 对话回复语言：中文白话（本仓库规则，见根 CLAUDE.md）。

## 何时用

Longbridge 不覆盖 A 股的短线情绪与官方口径财报数据，这个 skill 补这块盲区。触发词：

- 涨停 / 涨停股票池 / 连板 / 连板天梯 / 几天几板
- 龙虎榜 / 机构榜 / 游资榜
- 个股异动 / 异动原因 / 大涨大跌解读
- 同花顺热榜 / 飙升榜 / 热股榜单 / 热度排名
- A 股财报 / 利润表 / 资产负债表 / 现金流量表 / 财务指标 / ROE / 毛利率
- A 股行情快照 / A 股日 K / thscode（如 `600519.SH`）

**不要用这个 skill 做什么**：

- 分钟级 K 线、实时盯盘 —— 这些属于 Longbridge（本仓库不做港股 A 股实时看盘，Longbridge 只覆盖美股账户）。历史 K 线接口仅支持日线（`interval=1d`），不支持分钟级。
- 港股 / 美股 —— 这个 skill 只覆盖 A 股（`thscode` 形如 `600519.SH` / `000001.SZ` / `430047.BJ`）。
- **TD-LANG-03 全市场级工作不查 A 股**：只有明确要看 A 股个股/板块时才用这个 skill，不要在美股大盘扫描里顺带拉 A 股。

## 认证

需要 `HITHINK_FINANCE_API_KEY`（已在仓库根 `.env` 里配置，脚本通过 `_shared/env.py` 自动加载，无需手动 `source`）。缺失时脚本报 `exit_code=2`，提示去 `.env` 里加。

## 脚本一览

| 脚本            | 用途                                         | 关键参数                                                                                                                                                 |
| --------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot.py`   | 行情快照（多 thscode 批量，或全市场分页）    | `thscodes...`、`--limit`/`--offset`（全市场模式）                                                                                                        |
| `kline.py`      | 日 K 线                                      | `thscode`、`--days`（便捷窗口）或 `--start`/`--end`（毫秒）、`--adjust`                                                                                  |
| `special.py`    | 涨停/连板/龙虎榜/异动/热榜，用 `--kind` 切换 | `--kind limit-up-pool\|limit-up-ladder\|dragon-tiger\|skyrocket\|hot\|hot-history\|hot-rank-trend\|anomaly\|anomaly-stock`                               |
| `financials.py` | 官方口径财报 + 财务指标                      | `thscode`、`--kind income\|balance\|cashflow\|indicators`、`--period annual\|quarterly`、`--limit` 或 `--start`/`--end`；indicators 用 `--report yyyy-N` |
| `calendar.py`   | A 股近一年交易日序列                         | 无参数                                                                                                                                                   |
| `search.py`     | 标的检索 / 批量代码表                        | `query`（thscode/代码/中英文名），`--list` 切到批量代码表                                                                                                |

所有脚本都支持 `--help` / `--smoke` / `--verbose` / `--json`（占位，输出恒为 JSON）/ `--fresh`（绕过缓存）。缓存在 `~/.cache/market-intel/hithink/`，节流默认 ≥0.5 秒/请求（`_shared/client.py` 的节流机制）。

## CLI 示例

```bash
# 行情快照：单只/多只
python3 .claude/skills/hithink-a-share/scripts/snapshot.py 600519.SH
python3 .claude/skills/hithink-a-share/scripts/snapshot.py 600519.SH 000001.SZ

# 日 K：默认近 120 个自然日，前复权
python3 .claude/skills/hithink-a-share/scripts/kline.py 600519.SH --days 90
python3 .claude/skills/hithink-a-share/scripts/kline.py 000001.SZ --adjust backward

# 涨停股票池 / 连板天梯
python3 .claude/skills/hithink-a-share/scripts/special.py --kind limit-up-pool --sort-field limit_up_time --sort-dir desc
python3 .claude/skills/hithink-a-share/scripts/special.py --kind limit-up-ladder

# 龙虎榜（默认最近交易日，全部榜；可选机构/游资榜 + 指定日期）
python3 .claude/skills/hithink-a-share/scripts/special.py --kind dragon-tiger
python3 .claude/skills/hithink-a-share/scripts/special.py --kind dragon-tiger --board-type hot_money --date 2026-07-14

# 个股异动原因：当日全部，或按标的批量查
python3 .claude/skills/hithink-a-share/scripts/special.py --kind anomaly --tag-codes LIMIT_UP,SHARP_FALL
python3 .claude/skills/hithink-a-share/scripts/special.py --kind anomaly-stock --thscodes 600519.SH,000001.SZ

# 热榜：飙升榜 / 热股榜 / 历史热股 / 个股排名走势
python3 .claude/skills/hithink-a-share/scripts/special.py --kind skyrocket --period hour
python3 .claude/skills/hithink-a-share/scripts/special.py --kind hot
python3 .claude/skills/hithink-a-share/scripts/special.py --kind hot-history --date 2026-07-14
python3 .claude/skills/hithink-a-share/scripts/special.py --kind hot-rank-trend --thscode 300034.SZ --start-date 2026-06-21 --end-date 2026-07-14

# 财报：最近 N 期 / 时间区间二选一
python3 .claude/skills/hithink-a-share/scripts/financials.py 600519.SH --kind income --period annual --limit 3
python3 .claude/skills/hithink-a-share/scripts/financials.py 600519.SH --kind cashflow --period annual --start 1577808000000 --end 1735574400000
python3 .claude/skills/hithink-a-share/scripts/financials.py 300033.SZ --kind indicators --report 2025-1

# 交易日历
python3 .claude/skills/hithink-a-share/scripts/calendar.py

# 标的检索 / 批量代码表
python3 .claude/skills/hithink-a-share/scripts/search.py 贵州茅台
python3 .claude/skills/hithink-a-share/scripts/search.py 600519.SH
python3 .claude/skills/hithink-a-share/scripts/search.py --list --asset-type a-share-index --limit 500

# 绕过缓存
python3 .claude/skills/hithink-a-share/scripts/snapshot.py 600519.SH --fresh
```

## 输出格式

统一走 `_shared/client.py` 的信封：

```json
{"ok": true, "data": [...], "meta": {...}}
```

失败时：

```json
{ "error": "hithink error 1003: ...", "hint": "request_id=...", "ok": false }
```

## 数据陷阱（读这些数字前必看）

- **金额单位恒为原币元**，A 股币种恒为 CNY，不做单位换算（呼应 TD-UNIT-01 的精神：不确定单位就别自己算）。
- **`financials.py` 的 `--limit` 与 `--start`/`--end` 互斥**，同传或半开区间（只传一个）都会报错——脚本已提前拦截，服务端也会返回 `code=1004`。
- **`indicators`（财务指标）走完全不同的参数契约**：只认 `thscode` + `report`（`yyyy-N`，N=1/2/3/4 对应一季报/中报/三季报/年报），不支持 `period`/`limit`。
- **龙虎榜 `date` 必须是真实交易日**，传非交易日直接报错，不会自动回退；省略时服务端自动取最近可用交易日。收盘不久后当日龙虎榜可能还没发布，返回空列表是正常现象，不是接口坏了。
- **历史 K 线单次仅一个 thscode，且 `[start, end]` 跨度不超过 10 年**；要多只标的必须分开请求。
- **财务指标 `value` 是字符串，不是 number**——服务端故意保留原始精度，展示时按 `index_id` 名称判断单位（含"率""比率"的按百分比，"周转率"按次，"倍数"按倍）。
- **一手信源优先（TD-SOURCE-01）**：`anomaly-analysis-list` / `anomaly-analysis-stock` 的解读文案是同花顺二手归纳，不能替代公司公告/交易所披露作为结论依据，只能当情绪信号参考。

## 错误处理

| exit code | 含义                                             | 处理                                                                                               |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 0         | 成功                                             | 解析 `data`                                                                                        |
| 1         | 参数校验失败（本地拦截，未发请求）               | 按 `hint` 补齐参数                                                                                 |
| 2         | 缺 `HITHINK_FINANCE_API_KEY`                     | 提示用户去 `.env` 补 key                                                                           |
| 3         | HiThink 业务错误（`code!=0`）或 HTTP 4xx/非 JSON | 参考 `error` 里的 code 含义（1001 缺参/1002 格式错/1003 越界/1004 参数冲突/2003 无权限/4001 超频） |
| 4         | 网络错误                                         | 建议重试                                                                                           |
| 5         | HTTP 401                                         | 检查 API Key 是否失效                                                                              |

## 相关 skill

- `longbridge-*` —— 美股 / 港股实时行情、分钟级 K 线、账户持仓。
- `stock-deep-dive` —— 单只标的多维度首次尽调（美股）。
- `trading-discipline` —— 判读纪律共享源头，TD-LANG-03（只做美股，A 股是明确例外场景）、TD-SOURCE-01（一手信源）等规则见此。
