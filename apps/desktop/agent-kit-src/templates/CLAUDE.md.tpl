# CLAUDE.md — Kansoku 数据目录

这里不是 kansoku 源码仓库，是 kansoku desktop app 的数据目录。所有研究结果、
图表、决策日志都存在这里。

## 怎么操作数据

数据存储：

- SQLite: `charts/data/app.db`（chart_meta、comments、chat_sessions、
  symbol_follows、watched_markets_settings 等）
- 图表 JSON: `journal/charts/data/<id>.json`
- Markdown: `journal/YYYY-MM-DD-*.md`、`stocks/<SYMBOL>.md`

操作接口：`kansoku-cli`，位置见环境变量 `$KANSOKU_CLI`（由 App 写入
`.kansoku-agent-kit/runtime.env`）。想在 shell 里直接用，把
`$KANSOKU_DATA_ROOT/.kansoku-agent-kit/bin` 加到 `PATH`。

调用示例：

```sh
"$KANSOKU_CLI" chart create --type sepa --symbol NVDA --json-input - < payload.json
"$KANSOKU_CLI" info data-root
```

## Skill

`.claude/skills/` 里是 kansoku 的研究 skill——市场读取、深度研究、图表生成、
决策关卡、日内多周期预测等。任何 skill 里的接口调用都会通过 `kansoku-cli`
落到本地 SQLite / JSON，不需要额外服务。

## 规则

- 交易纪律：见 `.claude/skills/trading-discipline/SKILL.md`
- 语言：所有 markdown 用中文白话
- 数据虚实：TD-DATA-01 不造数据；TD-DATA-02 标数据时点
- 输出：TD-LANG-02 少用行话
