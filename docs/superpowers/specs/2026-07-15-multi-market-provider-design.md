# 多市场支持与行情 provider 抽象设计

日期：2026-07-15
状态：已确认（方案二：市场化 + provider 缝补完整，暂不写第二个 provider）

## 背景

app 内核（`packages/core`）目前只服务美股，数据源焊死长桥。实测确认现有长桥账号已能拉 A 股（`.SH`/`.SZ`）和港股（`.HK`）的报价、日 K、分钟 K、分时资金流、大中小单分布，因此第一期不需要引入新数据源。

探查结论：拉数据路径已有 `MarketDataProvider` 接口（`src/services/marketdata/types.ts`）和注册表（`registry.ts`）这道缝，但四块仍是长桥/美股硬编码：

1. 实时推送链（`longbridgeSocket` / `longbridgeProtocol` / `longbridgeStream` / `longbridgeToken`）没有抽象，`realtime/charts.ts` 直接引用长桥流。
2. 财报/宏观日历（`services/events.ts`）绕过接口直接调 CLI，且写死 `--market US`。
3. 交易时段逻辑（`services/session.ts`）写死纽约时区与美股盘前盘后。
4. 代号格式：`symbol.utils.ts` 默认补 `.US`，另有多处硬编码 `SPY.US` / `QQQ.US` / `SMH.US`。

指标计算、图表构建、形态识别只消费已拉回的 K 线数组，与数据源无关，不需要动。

## 目标

- 第一期：A 股 + 港股的图表可用，含盘中实时刷新；数据全部仍走长桥。
- 抽象一次做对：将来接入其他券商（如盈透、富途）时只写新实现，不动骨架。

## 非目标

- 不写第二个 provider 实现。
- 不设计非券商数据源（AKShare / Tushare 等 A 股特有数据）的能力位。
- 不改动直接调 longbridge CLI 的 6 个 skill（capital-rotation、chart、intraday-signal、market-session-tracker、options-levels、trade-gate）。`chart` skill 走 app 接口，A/HK 支持自动跟上。
- 不做 A 股/港股的持仓与账户管理。

## 第 1 节 — 市场概念与交易时段

引入 `Market` 类型：`"US" | "HK" | "CN"`，由代号后缀推导（`.US` → US，`.HK` → HK，`.SH`/`.SZ` → CN），推导函数 `marketOf(symbol)` 放在 `symbol.utils.ts`。裸代号默认补 `.US` 的行为保留。

`services/session.ts` 从写死纽约改为按市场查时段表：

| 市场 | 时区             | 正常时段                        | 盘前/盘后                        |
| ---- | ---------------- | ------------------------------- | -------------------------------- |
| US   | America/New_York | 9:30–16:00                      | 盘前 4:00 起、盘后至 20:00、隔夜 |
| HK   | Asia/Hong_Kong   | 9:30–12:00、13:00–16:00（午休） | 无                               |
| CN   | Asia/Shanghai    | 9:30–11:30、13:00–15:00（午休） | 无                               |

`classifySession` / `offSessionSegments` / `easternMinuteOfDay` 等函数加市场参数；A/HK 日内图正确处理午休断档。图表数据的"交易日"按各市场本地交易日计算；美股 journal 文件命名规则（TD-JOURNAL-01）不受影响。

## 第 2 节 — provider 按市场路由 + 日历收编

`registry.ts` 从全局单一 provider 改为每市场一个 provider 的路由表，第一期 US/HK/CN 三个市场都指向 longbridge；将来换券商是一行配置。

财报日历与宏观日历两个能力收编进 `MarketDataProvider` 接口，`services/events.ts` 改走 provider，去掉直接调 CLI 的口子。用现有 `Capability` 机制声明各 provider 支持的能力；不支持的能力返回明确的"不支持"结果，上层优雅跳过。

## 第 3 节 — 实时流接口化

定义中性流接口 `QuoteStream`：订阅报价、订阅分钟蜡烛，回调统一格式事件，退订用引用计数（沿用现 `longbridgeStream` 语义）。`LongbridgeStream` 改造为该接口的第一个实现；`realtime/charts.ts` 等消费方只依赖接口。

时段标签（盘前/盘后/午休）改由市场化的 `session.ts` 计算，不再依赖长桥协议常量（`longbridgeProtocol.ts` 的 `TRADE_SESSION_*` 仅留在长桥实现内部）。

流与拉取共用第 2 节的按市场路由表。

**待验证点：** CLI 拉取 A/HK 已实测通过，但长桥 WS 推送对 `.SH`/`.SZ` 的订阅未实测——实施第一步先验证；若 WS 不支持 A 股推送，A 股实时退化为定时拉取（接口不变，实现内部轮询）。

## 第 4 节 — 降级、错误与前端范围

美股专属功能按市场闸门优雅跳过：财报日历、期权档位（options-levels）、SPY/QQQ 基准对比只对 US 代号生效；A/HK 的 symbol 页不显示对应模块，也不报错。

`.US` 硬编码清理范围：`events.ts` 的 US-only 早退改为市场闸门；`benchmark.ts` / `symbols.service.ts` 的基准代号、`datapack.ts` / `build.ts` 的 SPY/QQQ 上下文保持美股语义，但改为显式 `Market` 判断而非字符串后缀散落各处。

## 第 5 节 — 前端时间组件市场化

`apps/web/src/ui/MarketTime.tsx` 及底层 `formatMarketClock` / `formatMarketDateTime` / `formatMarketMonthDayTime` 加市场参数：US 显示美东时间，HK 显示香港时间，CN 显示北京时间；悬停提示"美东时间 …"字样按市场替换。symbol 页与日内图表调用点传入当前代号的市场；无市场上下文的场合（如纯美股的首页时间线）默认 US，行为不变。时区设置卡片语义不动。

## 测试与验收

- 单元测试（沿用 `packages/core/test` 模式）：`marketOf` 推导、三张时段表（含午休断档与美股盘前盘后）、provider 路由表、`QuoteStream` 假实现的引用计数订阅/退订。
- 前端：`MarketTime` 三市场格式化用例（沿用 `MarketTime.test.ts`）。
- 端到端验收：为 `700.HK` 与 `600519.SH` 各建一张 sepa 图和一张 intraday 图，盘中打开 symbol 页可见分钟级实时跳动；美股既有页面行为无回归。

## 将来扩展（记录，不实施）

- 接盈透/富途：实现 `MarketDataProvider` + `QuoteStream`，在路由表把对应市场指过去。
- A 股特有数据（北向资金、龙虎榜等）：届时再设计数据源类 provider 的能力位；国内可选项为 AKShare（免费爬虫、稳定性差）与 Tushare Pro（付费、口径稳），同花顺无个人接口，东方财富无官方接口。
