# 图表应用（app/）

本地图表应用，取代了原来嵌在 Python 字符串里的 HTML 模板渲染。分两部分：

- `server/` — Hono + TypeScript。负责调 longbridge CLI 拉数据、计算所有指标与信号（均线 / MACD / RS / 趋势模板 8 条 / 成交分布 / 背离与背驰 / MACD 结构分类 / K 线形态 / 交易时段分类）、把图表数据持久化成 JSON、对外提供 API，并托管打包好的前端。
- `web/` — Vite + React + TypeScript。五种图的渲染组件：flow / kline / cohort（ECharts）、sepa / intraday（TradingView Lightweight Charts），外加图表列表页和旧版 HTML 存档入口。

## 启动

```bash
pnpm install        # 首次
pnpm build          # 打包前端（server 托管 dist）
pnpm start          # http://localhost:5199
```

开发时改前端代码用 `pnpm dev`（Vite 热更新在 5198，API 代理到 5199）。

## AI 怎么用

出图统一走 API（详见 `.claude/skills/chart/SKILL.md`）：

```bash
curl -s -X POST http://localhost:5199/api/charts \
  -H 'Content-Type: application/json' \
  -d '{"type":"sepa","symbol":"MRVL.US"}'
```

server 自己拉 260 根日 K + SPY、算完所有指标、落盘并返回 `{id, url, ...}`。
intraday 用两段式：POST 建预览图并从响应里读技术指标数值，再 PATCH 补上
`prediction` 生成最终预测面板。

## intraday 面板的自动标注

不依赖 `prediction`，每次渲染都由 server 自动检测并画上（tooltip 带含义解释）：

- **MACD 结构信号**：每个 DIF/DEA 交叉按零轴位置分类（零上/零下金叉、零上/零下
  死叉），并识别结构组合——二次金叉（零下双金叉且低点抬高 = 底部确认）、空中加油
  （零上二次金叉 = 强势延续）、二次死叉、DIF 上穿/下穿零轴（最新 1-2 根标 `?`
  待确认）、零轴缠绕检测（震荡市警示）。数据同时出现在
  `technicals.<tf>.structure_signals` / `zero_tangle` 里供分析流程读取。
- **14 种经典 K 线形态**：单根（锤子线 / 上吊线 / 倒锤子 / 射击之星）、双根
  （看涨/看跌吞没、乌云盖顶、刺透、看涨/看跌孕线）、三根（启明星 / 黄昏星 /
  红三兵 / 三只乌鸦）。带趋势背景过滤（形态前 4 根净涨/净跌）和实体大小过滤
  （对比近 14 根均值），同一根 K 线只标最强的一个。数据在
  `technicals.<tf>.candle_patterns`。
- **时段覆盖层**：盘前/盘后浅蓝、夜盘深蓝的整高背景（主图与 MACD 副图同步），
  一眼区分薄成交时段的走势；正常盘 = 09:30-16:00 ET，纽约时区实算，夏令时自动
  正确。
- **交互**：主图与 MACD 副图之间有拖拽分隔条（MACD 高度 100-340px，记忆在
  浏览器本地）；成交量柱半透明且与 K 线纵向分区，互不遮挡。

## 数据存哪

- 每张图一个 JSON：`journal/charts/data/YYYY-MM-DD-<slug>.json`（带
  `schema_version`，跟着 journal 一起被 gitignore）。前端永远用最新代码渲染
  旧数据，改组件不影响历史图表。
- 旧的单文件 HTML 存档还在 `journal/charts/*.html`，应用列表页有入口，
  由 server 在 `/legacy/` 下原样托管。

## 测试

从 Python 迁移过来的计算逻辑由金标测试锁定——用原 Python 实现对真实行情
数据算出的结果做基准，TS 版必须逐数对上（误差 < 1e-8）：

```bash
pnpm test           # vitest（server 包）
pnpm typecheck      # 两个包的 tsc
```

基准数据在 `server/test/fixtures/`。改指标算法前先想清楚：测试挂了说明
和 Python 版行为不一致，要么是 bug，要么就该同步更新基准并在提交信息里说明。

## 实时数据（二期，已完成）

SSE 推送 + 订阅驱动的按需轮询：页面开着才轮询，关掉自动停。

- `GET /api/stream/quotes?extra=SYM1,SYM2` — 行情快照流。标的 = 长桥
  watchlist ∪ 持仓 ∪ extra 参数，10 秒一轮（一条 `longbridge quote` 拉全部），
  自动识别盘前 / 盘后 / 隔夜时段并按对应时段报价。列表页顶部行情条和图表页
  右上角的实时价都吃这条流。
- `GET /api/stream/charts/:id` — 图表数据流。flow / kline / intraday 三种图
  被打开时每 60 秒重拉数据、重算指标、推新数据（sepa 是收盘级研判工具，
  不参与实时）。每轮重建都从最新落盘文档读输入，PATCH 后推送内容立即跟上。
  前端收到后原地更新，不重置缩放。
- 数据指纹去重（不变不推），连续 5 次拉取失败退避到 5 分钟并在页面上亮黄点。
- **实时数据不落盘**：`journal/charts/data/` 里的文档永远是"研判那一刻的快照"，
  只有 POST / PATCH 才写盘。

## 后续规划

持仓实时盈亏面板、日志浏览、多图对比、交互标注。
