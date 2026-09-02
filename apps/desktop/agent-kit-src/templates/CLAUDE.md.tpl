# Kansoku Agent Kit

这里是接入 Kansoku 的 Agent 项目。用户研究内容统一存放在
`$KANSOKU_DATA_ROOT` 指向的 Agent Workspace；当前目录只有在 Agent Kit
选择“使用 Agent Workspace”时才与它相同。

## 开始前

每次新 shell 先加载运行环境：

```sh
[ -f .kansoku-agent-kit/runtime.env ] && . .kansoku-agent-kit/runtime.env
```

关键路径：

- 用户文件：`$KANSOKU_DATA_ROOT/journal/`、`$KANSOKU_DATA_ROOT/stocks/`
- 图表 JSON：`$KANSOKU_DATA_ROOT/journal/charts/data/<id>.json`
- SQLite：不要直接操作文件，统一使用 `$KANSOKU_CLI`
- CLI：`$KANSOKU_CLI`
- CLI 目录：`$KANSOKU_AGENT_KIT_DIR/.kansoku-agent-kit/bin`

直接写 Markdown 或其他用户文件时，目标必须位于 `$KANSOKU_DATA_ROOT`，
不要假设当前工作目录就是数据目录。如果当前 Agent 沙箱不允许跨项目写入，
请直接把 `$KANSOKU_DATA_ROOT` 作为 Agent 项目打开。

调用示例：

```sh
"$KANSOKU_CLI" chart create --type sepa --symbol NVDA --json-input - < payload.json
"$KANSOKU_CLI" info data-root
```

## Skill

`.claude/skills/`（Claude Code）和 `.agent/skill/`（Agent Kit 客户端）都是指向
Kansoku 内置研究 skills 的软链接。应用更新、启动同步或手动重刷时会校验
最终指向，被删除或改指向后会自动修复。其中包含市场读取、深度研究、
图表生成、决策关卡、日内多周期预测等。任何 skill 里的 SQLite / 图表操作
都会通过 `kansoku-cli` 落到同一个 Workspace 和本地数据库，不需要额外服务。

## 规则

- 交易纪律：见 `.claude/skills/trading-discipline/SKILL.md`
- 语言：所有 markdown 用中文白话
- 数据虚实：TD-DATA-01 不造数据；TD-DATA-02 标数据时点
- 输出：TD-LANG-02 少用行话
