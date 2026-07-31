# Landing 顶部栏加大盘行情条

日期：2026-08-01
范围：`apps/site` 终端外壳顶部栏（`TerminalChrome.astro` / `chrome.ts` / `chrome.css`）+ 新增 `functions/api/tape.ts`

## 为什么

落地页顶部栏原本只有 ET 时钟和开闭市状态点，想把大盘的当前数据也标上去。难点在于免费且能公开用的行情源：

- 指数**实时**报价要授权费，任何免费源都只有延迟数据。
- 实测下来 Cboe 官网自己前端用的公开延迟行情 JSON 最合适：`https://cdn.cboe.com/api/global/delayed_quotes/quotes/_SPX.json`，无需注册、无 key，延迟 15 分钟，字段直接就是 `current_price` / `price_change_percent` / `last_trade_time`。
- 但 Cboe 和 Yahoo 的免费接口都不带跨域许可头，页面 JS 无法直连；Stooq 的免费 CSV 已 404。Finnhub / Twelve Data 免费档要暴露 key 且不给指数数据。

## 决定

站点已部署在 Cloudflare Pages，加一个 Pages Function 做转发，页面只打自己域名：

- **`functions/api/tape.ts`** — 并发拉 Cboe 的 `_SPX` / `_NDX` / `_VIX` 三个 JSON（上游请求带 `cf.cacheTtl: 60` 边缘缓存），拼成 `{ delayedMinutes: 15, quotes: [{ symbol, last, changePercent, asOf }] }`。响应 `max-age=30, s-maxage=60`；全部上游失败时返回 502。免费额度每天 10 万次调用，对落地页流量绰绰有余。
- **`src/scripts/landing/tape.ts`** — 纯函数：`TAPE_SYMBOLS` 名单（function 与 Astro 组件共用）、载荷校验 `parseTapeQuotes`（symbol 白名单正则 + 数值校验，杜绝把上游内容当 HTML 注入）、`formatTapeLast` / `formatTapeChange` / `tapeDirection`（涨跌方向按显示用的两位小数取整判定，避免 +0.001% 显示 0.00% 却标成上涨）。配套 `tape.test.ts`。
- **`TerminalChrome.astro`** — 顶部栏 spacer 和导航之间加 `.chrome-tape`：三个占位 item（`--`）+ `Delayed 15m` 标签，结构由 `TAPE_SYMBOLS` 生成，JS 只填 `textContent`，不用 innerHTML。
- **`chrome.ts`** — `initTape()`：加载即拉一次，之后每 60 秒刷一次（页面隐藏时跳过），页面从后台切回可见时立刻补一次（否则后台打开的标签页要空等 60 秒——实测踩到过）。成功渲染后给容器加 `is-live`。

## 降级

- 行情条默认 `display: none`，同时满足「拿到数据（`is-live`）+ 视口 ≥1024px」才显示：`astro dev` 没有 Pages Function、接口挂了、窄屏，三种情况都自动退回原顶部栏，无报错无占位。
- 涨跌色沿用 `--up` / `--down`，延迟标签用 `--text-3` 小字，与顶部栏全大写等宽字风格一致。

## 验证（已跑）

- `pnpm test`（12 文件 109 用例）/ `pnpm typecheck` / `pnpm build` 全绿。
- `wrangler pages dev` 本地实测：`GET /api/tape` 返回三个指数（延迟约 15 分钟，`asOf` 与实时差 15 分钟吻合）。
- 浏览器实测：1280 宽下顶部栏渲染 `SPX 7451.51 +0.19% · NDX 28151.92 +0.16% · VIX 17.30 +1.23% · DELAYED 15M`，红绿色正确；900 宽下行情条隐藏，顶部栏不挤。
