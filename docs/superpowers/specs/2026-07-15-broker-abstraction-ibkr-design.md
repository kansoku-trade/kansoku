# 券商抽象层解耦与 IBKR 接入 设计稿

日期：2026-07-15
状态：已与用户逐节确认

## 背景与目标

Kansoku 是公开仓库，但内核目前和长桥（Longbridge）深度绑定：不用长桥的人跑不起来。本次要做两件事：

1. **把长桥从内核解耦成可插拔的一家券商实现**——core 只定义接口，券商实现各自成独立 workspace 包。
2. **新增 IBKR（Interactive Brokers）实现**——行情和账户都能走 IBKR，让没有长桥账号的人完整用起来。

顺带完成 workspace 包名从 `@trade/*` 到 `@kansoku/*` 的整体重命名。

### 已确认的范围决策

- **行情 + 账户都接 IBKR**（不是只做行情源或只做账户源）。
- **至少配一家券商才可用**：完全没配券商时 app 能启动但不提供数据功能，首屏引导去配置。不做「零券商降级浏览」模式。
- **AI agent 数据获取整体上移到内核工具层**：系统提示词不再教内置 agent 用 bash 跑 `longbridge` CLI，彻底和券商无关。
- **IBKR 接入通道 = Web API + Client Portal Gateway**。已查证（IBKR Campus 文档，2026-07）：个人/零售账户目前只能通过本地 Client Portal Gateway 认证接入 Web API；无网关的 OAuth 直连只对机构和注册第三方厂商开放，OAuth 2.0 对个人「在考虑中，无时间表」。协议层代码是标准 REST/WS，将来若对个人开放 OAuth，只需换认证层。
- **券商选择和连接状态做进设置页**，env 变量降级为高级覆盖。

### 现状盘点（2026-07-15）

- `app/packages/core/src/services/marketdata/` 已有干净的插件缝隙：`MarketDataProvider` 接口（取数）、`QuoteStream` 接口（实时推送）、`registry.ts`（按市场 + env 变量选 provider），但表里只有长桥一家。
- 长桥在抽象层之外的泄漏点：
  1. `modules/credentials/credentials.service.ts` 写死「找 longbridge CLI + 读长桥 token」；
  2. `ai/prompts.ts` / `ai/assistantChat.ts` 的系统提示词教 agent 用 bash 跑 `longbridge` CLI；
  3. `services/intraday.ts` / `services/indicators.ts` 的报错 hint 里有 `longbridge kline ...` 命令文案。
- agent 工具层已解耦一半：`read_data_pack` / `fetch_kline` / `fetch_news`（`ai/dataTools.ts`）走注入的取数函数，底下就是 provider 层。

## 方案选择

- **A 就地泛化**（core 单包内加 ibkr 目录）：改动最小，但开源可插拔的边界不显。
- **B 拆独立包**（选定）：`@kansoku/core` 只留接口，`@kansoku/broker-longbridge` / `@kansoku/broker-ibkr` 各自成包。第三方以后可以自己发 provider 包。
- **C 最小接入**（只加 registry 条目）：满足不了设置页引导和 AI 解耦的需求，弃。

## 1. 包结构与命名

```
app/
├── packages/
│   ├── core/                 @kansoku/core        内核：broker 接口 + registry，零券商实现
│   ├── broker-longbridge/    @kansoku/broker-longbridge   现有长桥代码整体平移
│   └── broker-ibkr/          @kansoku/broker-ibkr         新写的 IBKR 实现
├── server/                   @kansoku/server
├── web/                      @kansoku/web
└── desktop/                  @kansoku/desktop
```

- 依赖方向单一：broker 包依赖 core，core 对 broker 包零依赖。
- **装配点在宿主入口**：`server` 的 `main.node.ts` 和 `desktop` 主进程各自 import 两个 broker 包、调 `registerBroker(...)` 注册进 core 的 registry。
- 根包 `trade-app` → `kansoku`；根目录 pnpm scripts 里的 `--filter @trade/*` 同步改。
- 长桥代码**平移不重写**：`services/marketdata/longbridge*.ts`、`longbridgeCli.ts`、`longbridgeToken.ts` 搬进 `broker-longbridge`，只改 import 路径。

## 2. broker 接口与注册

core 定义描述符接口，broker 包实现：

```ts
interface BrokerDescriptor {
  readonly name: string;                      // "longbridge" | "ibkr"
  readonly displayName: string;               // 设置页显示用
  readonly capabilities: ReadonlySet<Capability>;
  readonly provider: MarketDataProvider;      // 现有接口，原样保留
  createStream(): QuoteStream;                // 现有接口，原样保留
  readonly credentials: BrokerCredentialsAdapter;
}

interface BrokerCredentialsAdapter {
  check(): Promise<BrokerConnectionStatus>;   // ok | not_configured | not_logged_in | gateway_offline
  readonly setupGuide: SetupGuide;            // 结构化引导步骤，web 端渲染
}
```

- **`MarketDataProvider` 与 `QuoteStream` 接口不动**，仅一处例外：`getNews` 从必选降为可选方法，新增 `news` 能力（IBKR 没有稳定的新闻端点）。
- 现有 19 处 `getProvider()` / `getStream()` 消费点签名不变，零改动（新闻消费点除外，见能力降级）。
- **registry**：`registerBroker(descriptor)` + 现有 `getProvider(market)` / `getStream(market)`。选择优先级：env 变量（`MARKET_PROVIDER_US` 等，按市场的高级覆盖）→ 设置页保存的全局选择（settings 存储，单一 `broker` key）→ 都没有则抛 `BROKER_NOT_CONFIGURED`。
- **credentials 模块泛化**：`credentials.service.ts` 不再 import 长桥专属函数，改为遍历已注册描述符逐个 `check()`，返回 `{ broker, status, setupGuide }` 列表。
- **能力降级沿用现状**：IBKR 不声明的能力（见 §3 表），消费方已有降级逻辑自然生效；UI 补一条规则——依赖缺失能力的面板显示「当前券商不支持」，不留空白。涉及面板：资金流分布、财报/宏观日历、新闻。

## 3. IBKR provider 实现（@kansoku/broker-ibkr）

对接本地 Client Portal Gateway：`https://localhost:5000/v1/api`，自签证书，本地请求跳过证书校验。

### 会话生命周期

- 使用前查 `/iserver/auth/status`；未登录 → `not_logged_in`；网关进程没跑 → `gateway_offline`。
- 连接期间每 60s 打 `/tickle` 保活；会话中途失效时推送连接状态变化，UI 亮「需要重新登录」。

### 符号体系

IBKR 内部用数字 `conid` 而非 ticker。包内做 `symbol ↔ conid` 解析（`/iserver/secdef/search`）并持久缓存。core 与消费方只见 `AAPL.US` 现有格式，conid 是纯包内细节。

### 能力映射

| 能力 | IBKR 端点 | 声明 |
|---|---|---|
| 报价 | `/iserver/marketdata/snapshot` + WS 推送 | ✅ |
| K 线 | `/iserver/marketdata/history` | ✅ |
| 持仓 / 账户总览 | `/portfolio/{acct}/positions`、`/portfolio/{acct}/summary` | ✅ |
| 自选股 | `/iserver/watchlists` | ✅ |
| 实时流 | `wss://localhost:5000/v1/api/ws`（按 conid 订阅） | ✅ |
| 资金流大中小单 / 财报日历 / 宏观日历 | 无对等物 | ❌ 不声明 |
| 新闻 | 无稳定公开端点 | ❌ 不声明 |

- 分钟 K 线推送：IBKR WS 只推报价不推 bar，复用 core 已有的 `candleAggregator` 从逐笔报价聚合（长桥 stream 现行做法相同）。

### 已知限制（写进设置页引导）

- 未订阅 IBKR 行情包的账户拿到延迟 15 分钟数据；snapshot 的延迟标记透传到报价时间戳字段，UI 如实展示。
- 盘前/盘后/夜盘报价字段 IBKR 只有部分，`RawQuote` 的 `pre_market` / `post_market` / `overnight` 按可得字段尽力填，缺则空。

## 4. AI agent 去 CLI 化

- **系统提示词**（`ai/prompts.ts` / `ai/assistantChat.ts`）删除「用 bash 跑 `longbridge` CLI」的教学，改为指向内核工具。bash 工具保留：跑 `.claude/skills` 下与券商无关的 Python 脚本（fred / sec-edgar / gdelt 等）和读仓库文件。
- **补齐内核工具**：新增 `fetch_quote`（任意标的实时报价，含盘前盘后）、`fetch_positions`（持仓快照）。与现有 `read_data_pack` / `fetch_kline` / `fetch_news` 同走 provider 层。
- **工具注册按当前 broker 能力集过滤**：不支持的能力对应的工具不注册、提示词不提，不给 AI「调了才发现不支持」的坑。
- **报错 hint 清理**：`intraday.ts` / `indicators.ts` 中 `longbridge kline ...` 命令文案改为中性表述（如「用 fetch_kline 工具补拉」）。

## 5. 设置页与未配置状态

### 券商选择

- 设置页新增「券商」区块：全局单选（长桥 / IBKR），存现有 settings 存储。
- env 变量保留为高级覆盖（优先级高于设置页），不做界面。

### 连接状态

- 每家券商一张状态卡：`ok / not_logged_in / gateway_offline / not_configured`，来自 `credentials.check()`；复用 `settings.testConnection` 通道加「测试连接」按钮。
- 状态非 ok 时渲染该 broker 的 `setupGuide`：
  - 长桥：装 CLI → `longbridge login`。
  - IBKR：下载 Client Portal Gateway → 启动 → 浏览器登录。
- 凭据不经 app 之手（长桥 token 在 CLI 侧，IBKR 登录在网关网页），app 只读状态。

### 未配置启动

- server / desktop 启动不崩；数据类 API 统一返回 `BROKER_NOT_CONFIGURED` 错误码。
- web 首屏检测到该错误码 → 全屏引导页「选择并连接你的券商」，直通设置页券商区块，配置完成后自动恢复。
- 已存档 chart JSON 此时不展示（不做降级浏览）。

## 6. 测试

- **接口契约测试**（core 内）：对 `BrokerDescriptor` 的通用用例——报价字段完整性、K 线排序、能力声明与实际方法一致性。两个 broker 包各跑同一套，防止实现间行为漂移。
- **broker-ibkr 单测**：HTTP 层走录制的 Gateway 响应 fixture（认证状态机、conid 解析与缓存、snapshot 字段映射、WS 报文解析），不依赖真网关。
- **broker-longbridge**：沿用现有测试（`LongbridgeRunner` 可注入）。
- **手动 smoke 验收清单**（真网关）：登录 → 报价 → K 线 → 持仓 → 实时推送 → 会话失效重登。

## 7. 迁移收尾

- 包名重命名波及并一并更新：根目录 pnpm scripts、CI、desktop 发版流水线里的 `--filter @trade/*`、`CLAUDE.md` 等文档中的 `@trade/core` 表述。
- **不动**：Electron 产品名、Sparkle 更新签名与更新通道（keychain `tradecharts-sparkle`）。只改 npm 包名。
- `promptPolicy.ts` 读 trading-discipline 的机制不受影响。

## 8. 验收标准

1. 只配 IBKR（无长桥 CLI、无长桥 token）的环境：app 可启动、可看实时报价与 K 线、可读持仓与账户总览、in-app agent 可正常取数分析。
2. 只配长桥的环境：行为与现状一致，无回归。
3. 两家都不配：app 启动，首屏出现券商配置引导，配置完成后无需重启即可用。
4. IBKR 环境下依赖缺失能力的面板显示「当前券商不支持」，不空白、不报错。
5. `grep -r "longbridge" app/packages/core/src` 零命中（接口、提示词、报错 hint 全部中性化；长桥字样只存在于 `broker-longbridge` 包内）。
