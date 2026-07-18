# intraday 图 AI 预测时效标记 — 设计

日期：2026-07-02 · 状态：已批准

## 背景与目标

chart app 的 intraday 图表有两层内容：指标层（server 每 60 秒 SSE 重建，自动更新）和 AI 预测层（`prediction`，由 Claude Code 会话通过 PATCH 写入，之后一直冻结）。盘中行情变化后，页面上的预测可能已经陈旧，但看图的人无从分辨。

目标：让「预测是几分钟前的判断」在页面上可见，盘中超过 15 分钟未更新就标黄提醒；并给会话端的定时更新循环提供工作清单接口。**AI 重评本身不进 server**——server 只做时效标记，重评由 Claude Code 会话（/loop 或手动）执行，其约束写入 `chart` skill 文档。

## 数据模型

`ChartDoc`（`packages/shared/types.ts`）新增可选字段：

```ts
prediction_updated_at?: string   // ISO 时间
```

写入时机：**仅当 PATCH 请求体显式包含 `prediction` 键**时，server 落当前时间。以下情况不碰它：

- SSE 60 秒重建（不落盘，本来也不经过 PATCH）
- 只改 `position` / `subtitle` / `refresh` 等其他字段的 PATCH

兼容：旧文档无此字段 → 页面不显示更新时间，也不判过期（避免误报）。

## 过期判定（纯函数，不落盘）

```
predictionStale(doc, now) =
  doc.type === "intraday"
  && doc.input.prediction 非空
  && doc.prediction_updated_at 存在
  && classifySession(now) === "regular"     // 复用 services/session.ts，美东正常时段
  && now − prediction_updated_at > 15 分钟
```

阈值 15 分钟写死为常量（`PREDICTION_STALE_MS`）。过期状态每次读取时计算，不存储——避免落盘一个随时间变化的字段。

## Server 改动

1. `routes/charts.ts` PATCH：`"prediction" in body` → `prediction_updated_at = new Date().toISOString()`。
2. 新增 `predictionStale` 纯函数（放 `services/` 下，与 `session.ts` 同层）。
3. `GET /api/charts`（列表）与 `GET /api/charts/:id`：返回附带 `prediction_updated_at` 与 `prediction_stale`。
4. `GET /api/charts?stale=true`：只返回当前过期的图——会话循环的工作清单。
5. SSE `/api/stream/charts/:id`：每次 tick 的 data envelope 附带 `prediction_updated_at` + `prediction_stale`，页面开着即可自动变黄。

## Web 改动

1. `IntradaySidebar` 预测卡片标题旁：`更新于 HH:MM（N 分钟前）`；stale 时换黄色徽章 `⚠ 盘中已过期`。年龄文案随 SSE tick 刷新。
2. `ChartList` 列表项：stale 的 intraday 图加黄点标记。

## skill 文档更新（AI 侧约束）

`.claude/skills/chart/SKILL.md` 增加「realtime prediction upkeep」一节，约定：

- 开盘后更新 intraday 图必须用 `{"session": "intraday", "refresh": true}`（盘中版不画盘前/夜盘 bars）。
- 量能结论必须对齐前几个交易日**同时段**成交量（5m K 正常时段口径），不得拿全日量比。
- 盘中定时循环（约 15 分钟一轮）：`GET /api/charts?stale=true` 取清单 → 拉最新行情/资金流 → 情景有实质变化才改 prediction 内容，无变化也 PATCH 一次原 prediction 刷新时间戳 → 重大修正追加 journal（带时间戳，符合 revision discipline）→ 16:00 ET 收盘后收尾并停循环。

## 测试

server vitest：

- `predictionStale` 边界：盘中/盘前/盘后/周末、恰好 15 分钟、缺 `prediction_updated_at`、`prediction` 为 null、非 intraday 类型。
- PATCH 带 `prediction` 落时间戳；不带则不动。
- `?stale=true` 过滤正确。

现有 golden 测试不受影响（`built` 结构不变）。

## 不做的事

- server 端 AI 调用（headless claude / Anthropic API）
- 价格破位自动改情景概率之类的自动失效逻辑
- 每图可配置的过期阈值
