# Longbridge CLI 与最小实时协议设计

## 目标

桌面 App 最终完全删除 `longbridge` Node SDK 和约 106 MB 的 `longbridge-darwin-arm64` 原生模块。除实时数据外，所有 Longbridge 查询统一调用用户本机安装的 `longbridge` CLI；实时报价和实时 K 线由 App 主进程实现官方公开的 WebSocket 二进制协议。

本次改造完成后：

- Electron 安装包不再包含 `longbridge.darwin-arm64.node`。
- onboarding 必须确认 CLI 已安装、已登录且 Token 可读取，才能进入 App。
- 普通查询统一使用 `longbridge ... --format json`。
- App 自己维护 Quote 报价推送和 Trade 逐笔成交推送。
- App 根据报价和成交在本地合成 `5m`、`15m`、`60m` 实时 K 线。
- 深度研究现有的 CLI 工作流保持不变。

## 非目标

- 不重新实现完整 Longbridge OpenAPI SDK。
- 不实现交易下单、订单推送、盘口深度、经纪席位等实时能力。
- 不支持港股、中国内地股票或新加坡股票的市场级实时处理。
- 不保证兼容 CLI 未公开且未来任意变化的 Token 格式；无法识别时必须明确阻止进入。
- 第一阶段只支持当前 Electron 发布目标 macOS arm64，不提前抽象其他操作系统的机器标识读取。

## 当前问题

当前 App 同时依赖两套 Longbridge 入口：

```text
┌──────────────────────────────┐
│          Kansoku         │
├──────────────────────────────┤
│ Node SDK                     │
│ 行情、K 线、持仓、资产、登录 │
├──────────────────────────────┤
│ 系统 longbridge CLI          │
│ 深度研究及部分查询           │
└──────────────────────────────┘
```

Node SDK 只是 Rust 核心 SDK 的 N-API 包装。macOS arm64 原生模块约 106 MB，而且 Electron 必须通过 `asarUnpack` 将其完整放入安装包。与此同时，深度研究已经要求系统存在 CLI，所以继续同时分发原生 SDK 会增加安装包体积和两套运行时边界。

## 目标架构

```text
┌──────────────────────────────────────────────┐
│                Electron 主进程               │
│                                              │
│  ┌─────────────────┐   ┌──────────────────┐  │
│  │ CLI 查询适配层  │   │ 实时行情协议层   │  │
│  │ quote / kline   │   │ WebSocket        │  │
│  │ positions 等    │   │ Protobuf         │  │
│  └────────┬────────┘   └────────┬─────────┘  │
│           │                     │            │
│           ▼                     ▼            │
│  系统 longbridge CLI   Longbridge Quote WS   │
│           │                     │            │
│           └──────────┬──────────┘            │
│                      ▼                       │
│          现有 provider / realtime 接口       │
└──────────────────────────────────────────────┘
```

核心原则是保持上层接口稳定：图表、报价面板、持仓面板和 SSE 消费者不直接感知底层由 SDK 改成 CLI 与自建 WebSocket。

## CLI 定位与运行

### 定位顺序

桌面 App 从 Finder 启动时通常拿不到交互式 Shell 的完整 PATH，因此不能只执行 `execFile("longbridge")`。定位顺序固定为：

1. `LONGBRIDGE_CLI_PATH` 指定的绝对路径。
2. 当前进程 PATH。
3. 登录 Shell 返回的 PATH。
4. `/opt/homebrew/bin/longbridge`。
5. `/usr/local/bin/longbridge`。

候选文件必须满足：

- 是普通文件。
- 当前用户具有执行权限。
- `longbridge --version` 能在超时时间内成功退出。

定位结果只缓存在当前进程内；设置页允许重新检测。

### 统一执行器

所有查询通过一个统一执行器调用：

```text
runLongbridge(args, options)
  ├── 固定追加 --format json
  ├── 使用 execFile，不经过 Shell
  ├── 设置超时与最大输出
  ├── 解析 JSON
  ├── 统一错误分类
  └── 不记录命令输出中的敏感字段
```

业务代码不得直接创建 `child_process`，避免不同模块出现不同的 PATH、超时、错误处理和 JSON 解析规则。

## onboarding 门禁

onboarding 不再提供 App 内 OAuth 或手动 API 凭证表单，改成两段门禁。

```text
◆ CLI 是否可用？
├── 否：显示安装说明和官方下载入口，阻止进入
└── 是
     │
     ▼
◆ longbridge auth status 是否有效？
├── 否：显示 longbridge auth login 引导，阻止进入
└── 是：刷新并读取 Token，建立实时连接，进入 App
```

门禁状态必须区分：

| 状态                | 用户提示                     | 是否允许进入           |
| ------------------- | ---------------------------- | ---------------------- |
| CLI 不存在          | 安装 CLI                     | 否                     |
| CLI 无法执行        | 修复 CLI 权限或安装          | 否                     |
| 未登录              | 执行 `longbridge auth login` | 否                     |
| Access Token 可刷新 | CLI 自动刷新后重试           | 否，刷新完成后自动复检 |
| Refresh Token 过期  | 重新登录                     | 否                     |
| Token 格式不支持    | 升级 App 或使用兼容 CLI      | 否                     |
| 实时连接鉴权失败    | 重新登录并重试               | 否                     |
| 全部通过            | 进入 App                     | 是                     |

设置页保留“重新检测”和“打开安装说明”，但不再保存 Longbridge 凭证。

## Token 读取

### 支持格式

兼容两种已确认格式：

1. 旧版明文 JSON：`~/.longbridge/openapi/tokens/<clientId>`。
2. 新版加密文件：`~/.longbridge/openapi/cli-auth`。

旧版字段：

- `client_id`
- `access_token`
- `refresh_token`
- `expires_at`

新版文件格式：

```text
MAGIC[3] || NONCE[12] || CIPHERTEXT_AND_TAG
MAGIC = 0x4c 0x42 0x01
```

密钥派生和解密与官方 CLI 保持一致：

- 机器标识作为 HKDF 输入。
- HKDF-SHA256。
- `info = "longbridge-token-v1"`。
- 输出 32 字节密钥。
- AES-256-GCM 解密。

macOS 机器标识读取必须封装在独立模块中，并使用脱敏 fixture 验证。Token 只保留在 Electron 主进程内存中，不发送到 Renderer，不写入 App 数据库，不进入日志。

### Token 刷新责任

App 不自己实现 OAuth Refresh Token 请求。建立实时连接前先执行 `longbridge auth status --format json`，让 CLI 初始化自己的 OpenAPI Context 并按官方逻辑刷新 Token。命令完成后，App 再读取 Token 文件。

若 CLI 返回 `refresh_pending`，App 应再次执行一个只读、低成本的 CLI 查询触发刷新，然后重新检查状态。连续失败后进入“重新登录”状态，不自行猜测 Token 是否可用。

### 文件安全

- 读取前检查文件属于当前用户。
- 新版 CLI 文件应为 `0600`；旧版文件权限过宽时显示安全警告，但允许当前兼容阶段继续使用。
- 错误信息不得包含文件内容、Access Token 或 Refresh Token。
- 测试只使用人工生成的假 Token。

## WebSocket 二进制协议

### 连接

Quote WebSocket 地址使用官方区域规则，默认：

```text
wss://openapi-quote.longbridge.com/v2?version=1&codec=1&platform=9
```

中国内地网络区域可切换 `.cn` 地址。地址选择优先读取 CLI 登录 Token 的数据中心标识，并允许通过现有 Longbridge 环境变量覆盖。

### 数据包

只实现官方协议的三类数据包：

- Request：命令码、请求序号、超时和 Protobuf body。
- Response：命令码、请求序号、状态和 Protobuf body。
- Push：命令码和 Protobuf body。

必须支持响应 body 的 gzip 解压。请求序号单调递增，待处理请求按序号保存，并在超时、连接关闭时统一拒绝。

### 必要命令

| 命令        |   命令码 | 用途                     |
| ----------- | -------: | ------------------------ |
| Auth        | 控制命令 | 使用 Access Token 鉴权   |
| Reconnect   | 控制命令 | session 未过期时恢复连接 |
| Subscribe   |        6 | 订阅 Quote、Trade        |
| Unsubscribe |        7 | 取消订阅                 |
| Push Quote  |      101 | 实时报价                 |
| Push Trade  |      104 | 逐笔成交                 |

只引入这些命令所需的最小 Protobuf 定义。协议文件必须保留官方来源、版本和 MIT/Apache-2.0 许可证说明，不能复制整个 SDK 生成物。

### 心跳与重连

- 维护最后一次收到服务端消息的时间。
- 超过官方心跳窗口后主动关闭连接。
- 以指数退避重新连接，上限 60 秒。
- session 有效时优先 Reconnect。
- session 无效或 Reconnect 失败时使用最新 Token 重新 Auth。
- 重连成功后根据本地引用计数重建全部 Quote 和 Trade 订阅。
- App 退出或没有订阅者时主动关闭连接和计时器。

## 实时报价

保持现有 `LongbridgeStream` 对上层的行为：

- `retain(symbols)` 增加引用计数。
- `release(symbols)` 减少引用计数。
- 首次引用触发 Quote 订阅。
- 引用归零触发取消订阅。
- `onUpdate()` 接收标准化 `QuoteCell`。
- `getSnapshot()` 和 `getSnapshots()` 返回内存快照。

订阅前通过 CLI 批量执行 `longbridge quote`，填充上一收盘价、日盘价、盘前、盘后和夜盘基准。之后 Quote Push 只更新变化字段。

Renderer 仍通过现有 SSE 接口接收 250ms 合并后的报价，不直接连接 Longbridge WebSocket。

## 实时 K 线

### 实际数据来源

Longbridge 服务端不直接推送 App 所需的完整 K 线。官方 Rust SDK也是通过 Quote 与 Trade Push 在本地合并 K 线。因此自建实现必须复现这部分行为，但范围限定为：

- 美国市场。
- `5m`、`15m`、`60m`。
- 日盘、盘前、盘后和夜盘的现有展示需求。

### 初始化

首次订阅某个 `symbol + period` 时：

1. 通过 CLI 拉取最近 K 线。
2. 使用最后一根 K 线初始化当前时间桶。
3. 增加该 symbol 的 Quote 与 Trade 引用。
4. 后续 Push 合并到当前时间桶。

### 合并规则

- 时间桶以推送时间戳和交易时段计算，不能使用本机当前时间代替。
- 第一笔成交确定新桶的 open、high、low、close。
- 同桶成交更新 high、low、close、volume 和 turnover。
- 跨桶时确认上一根并创建新桶。
- Quote Push 更新最新价；当标的没有 Trade Push 时允许作为价格更新来源，但不得重复累计成交量。
- 乱序成交只允许更新仍在内存窗口内的对应桶，过旧数据丢弃并记录不含敏感信息的诊断。
- 重连后重新调用 CLI 拉取最后若干根 K 线，与内存尾部合并，修复断线期间缺口。

现有图表层的轮询仍作为安全网；只有实时 Push 在新鲜窗口内持续到达时，轮询才降频。

## 普通查询迁移

下列能力从 SDK 改为 CLI：

| Provider 能力  | CLI 命令               |
| -------------- | ---------------------- |
| 行情快照       | `quote`                |
| 历史 K 线      | `kline`                |
| 资金流         | `capital --flow`       |
| 资金分布       | `capital`              |
| 持仓           | `positions`            |
| 资产总览       | `portfolio` / `assets` |
| 关注列表       | `watchlist`            |
| 新闻           | `news`                 |
| 财报与经济日历 | `finance-calendar`     |

每个适配器负责把 CLI JSON 转成现有 `MarketDataProvider` 类型。迁移过程中优先保持上层响应结构不变，不将 CLI 原始字段泄漏到路由和 UI。

## 依赖与打包清理

完成替换后删除：

- `packages/core/package.json` 中的 `longbridge`。
- `apps/desktop/package.json` 中的 `longbridge`。
- `apps/desktop/package.json` 中的 `longbridge-darwin-arm64`。
- `electron-builder.yml` 中的 `**/node_modules/longbridge*/**` 解包规则。
- `pnpm-lock.yaml` 中仅由上述依赖引入的平台包。
- SDK 专用的 OAuth、Config、Context 和测试 mock。

打包验证必须直接检查 `.app` 和 `app.asar.unpacked`，不能只根据 `package.json` 推断原生模块已经消失。

## 模块划分

建议新增以下边界，具体文件名可在实施计划阶段按现有目录调整：

| 模块                  | 单一职责                             |
| --------------------- | ------------------------------------ |
| CLI locator           | 定位并验证系统 CLI                   |
| CLI runner            | 安全执行命令、解析 JSON、统一错误    |
| CLI provider          | 将查询结果转换为现有 provider 类型   |
| CLI auth status       | onboarding 状态判断与刷新触发        |
| Token reader          | 识别明文或加密格式并只返回内存 Token |
| Packet codec          | 二进制包头编码、解码、gzip           |
| Protobuf messages     | 最小必要消息类型                     |
| Quote socket          | 连接、鉴权、请求匹配、心跳和重连     |
| Subscription registry | Quote 与 Trade 引用计数及重订阅      |
| Candle aggregator     | `5m / 15m / 60m` K 线合并            |
| Stream facade         | 兼容现有 `LongbridgeStream` 消费接口 |

## 错误处理

| 错误               | 行为                                  |
| ------------------ | ------------------------------------- |
| CLI 不存在         | onboarding 阻止进入                   |
| CLI JSON 无法解析  | 返回明确版本不兼容错误                |
| Token 过期         | 触发 CLI 刷新并复检                   |
| Token 解密失败     | 阻止进入，引导重新登录或升级          |
| WebSocket 鉴权失败 | 清除内存 Token，重新检查 CLI 登录状态 |
| WebSocket 暂时断开 | 保留订阅引用并指数退避重连            |
| Protobuf 未知字段  | 忽略未知字段，保持向前兼容            |
| 未知命令码         | 记录诊断并忽略，不终止进程            |
| CLI 查询失败       | 沿用现有 `ClientError` 响应结构       |
| K 线重连缺口       | CLI 重拉尾部并合并                    |

## 测试策略

测试必须验证外部行为，不对静态命令码表做实现快照。

### 单元测试

- CLI 定位优先级、路径包含空格和无执行权限。
- CLI JSON 成功、超时、非零退出和非法输出。
- 明文 Token 读取。
- 新版加密 Token fixture 解密。
- Token 不出现在错误和日志中。
- Request/Response/Push 数据包往返。
- gzip 响应解压。
- Quote 与 Trade Protobuf fixture 解码。
- 引用计数、取消订阅和断线重订阅。
- `5m / 15m / 60m` 同桶、跨桶、乱序和交易时段边界。

### 集成测试

- 使用假 WebSocket 服务验证 Auth、Subscribe、Push、断线、Reconnect。
- 使用假 CLI 可执行文件验证 onboarding 和 provider 映射。
- 真实本机 CLI 只做显式 smoke test，不纳入默认测试，避免测试读取真实 Token 或访问真实账户。

### 运行验证

- 本机启动桌面 App，验证报价面板持续更新。
- 打开个股实时图表，验证三周期 K 线更新。
- 人工断网后恢复，确认订阅和图表自动恢复。
- 比较流式 K 线与 CLI 重新拉取的尾部数据。
- 未安装 CLI、未登录、Token 损坏分别验证 onboarding 门禁。
- 打包后搜索安装包，确认不存在 `longbridge.darwin-arm64.node`。

## 分阶段实施

### 阶段一：CLI 与门禁

- 建立 CLI locator、runner 和 auth status。
- onboarding 改为安装与登录门禁。
- 支持两种 Token 格式。

### 阶段二：普通查询

- 将 provider 的 SDK 查询逐项改为 CLI。
- 保持 API 与 UI 合同不变。

### 阶段三：最小实时协议

- 实现包头、Protobuf、鉴权、心跳和订阅。
- 接入 Quote 与 Trade Push。
- 保持现有实时报价接口。

### 阶段四：实时 K 线

- 实现三周期聚合。
- 接入图表安全轮询和断线补洞。

### 阶段五：删除 SDK 与打包验证

- 删除 SDK 代码和依赖。
- 清理锁文件与 `asarUnpack`。
- 完成真实运行和打包体积验证。

每个阶段都必须保持 App 可运行；在最小实时协议和 K 线验证完成前，不提前删除官方 SDK。

## 风险与缓解

| 风险                        | 缓解措施                                        |
| --------------------------- | ----------------------------------------------- |
| CLI Token 格式继续变化      | 魔数与版本检测；未知格式直接阻止进入            |
| 官方协议升级                | 固定协议版本；保留 fixture；未知字段忽略        |
| K 线与官方 SDK 合并规则不同 | 限定美国市场和三个周期；以 CLI 尾部数据持续校验 |
| Finder 启动找不到 CLI       | 多路径 locator 与设置页重新检测                 |
| Token 泄漏                  | 主进程内存隔离、日志脱敏、Renderer 不可访问     |
| 重连期间丢失行情            | 重订阅后 CLI 重拉快照和 K 线尾部                |
| 改造范围过大                | 分阶段替换，最后才删除 SDK                      |

## 完成标准

- 普通 App 与深度研究均只要求系统 `longbridge` CLI。
- onboarding 能准确区分安装、登录、Token 与实时连接错误。
- 实时报价和三个 K 线周期在正常连接及断线恢复后可持续更新。
- provider、路由和 UI 的现有数据合同保持兼容。
- 核心包、桌面端和 Web 端相关测试通过。
- Electron 打包成功。
- `.app`、`app.asar`、`app.asar.unpacked` 和依赖树中均不存在 `longbridge-darwin-arm64`。
- 安装包相较当前基线显著减少约 106 MB 的未压缩原生模块体积。
