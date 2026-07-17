# 订阅机制与 open-core 拆分设计

日期:2026-07-17
状态:已确认方向,待写实现计划

## 背景与目标

Kansoku 目前是纯本地应用:AI 调用用用户自己的 API key(BYOK),行情数据走用户自己的 Longbridge 账户,开发者侧没有任何服务端成本。代码全部开源(AGPL-3.0 + Commons Clause,单一版权人)。

目标:引入订阅制商业化。已确认的三个方向性决策:

1. **路线 C**:先做纯授权订阅(license gate),账户/授权体系按"将来会有托管服务"预留演进空间。
2. **功能切分 D**:图表 + 实时行情 + journal 免费;AI 功能(chat / deepDive / analyst / recap / commentator / scheduler)付费;未来托管功能进更高档位。
3. **开闭源边界 = 免费/付费边界**(open-core):付费功能的代码不出现在公开仓库,这是真正的防线;客户端 license 检查只是便民闸门,不追求密码学强度。

支付与授权基础设施:**Dodo Payments**(Merchant of Record,自带挂订阅的 license key 体系)。

## 1. 代码边界拆分(插槽架构)

**硬性约束:社区开发者只用公开仓库必须能构建出完整可用的免费版。** 公开代码对 pro 只有软依赖,任何一行公开代码不得硬 import 私有包。

- **公开仓库(kansoku)**:图表内核、web、desktop 壳、realtime、数据导入。免费版可从源码完整构建。
- **私有仓库 `@kansoku/pro`**:现 `packages/core/src/ai/` 整个目录迁入(agents、prompts、promptPolicy、conversationEngine、scheduler、recap、usage 等)。trading-discipline 注入链路随之进入私有包。AI 相关的 db 表与 migration 一并迁入,pro 注册时自带 migration。可选用 bytenode 将私有包编译为 V8 字节码再打包。
- 已发布的历史版本(≤ v0.16.0)是全功能开源的,拆分不可追溯,接受这一事实。

插槽分三层:

1. **契约层 `@kansoku/pro-api`(公开,纯类型包)**:定义 pro 模块提供什么(AI 服务、scheduler、contract 路由处理器)、core 递给它什么(db、settings、realtime hub、Longbridge 客户端)。contract 里 AI 路由的类型留在公开侧,处理器实现在 pro。
2. **装载层(公开)**:`app/pro/` 为 gitignored 插槽目录,release 脚本发版时将私有仓库 clone 至此;pnpm workspace glob 写成可选匹配(目录缺失时照常解析)。core 启动时动态 import + try/catch:成功则注册 pro 模块,失败则静默进入免费模式。不用 git submodule(公开仓库挂私有 submodule 会让社区 `git clone --recursive` 报错)。
3. **能力广播层**:contract 增加 `capabilities` 查询(HTTP 与 IPC 双 transport),返回 `{ pro, licensed }`。web 前端据此渲染:`pro: false`(社区构建)隐藏 AI 入口;`pro: true, licensed: false` 显示上锁态 + 订阅引导;双 true 全功能。前端不感知 license 细节。

CI 分两条:公开 CI 无密钥、纯免费构建(持续验证"社区能跑");release CI 用 deploy key 拉取私有仓库。

## 2. 购买与激活流程(零自建后端)

Dodo 的 activate / validate / deactivate 是公开端点,客户端直连,第一阶段不需要自己的 license 服务器。

1. 用户经官网或 app 内跳转进入 Dodo checkout 订阅;Dodo 自动生成 license key 并邮件送达。
2. App 设置页输入 key → 调 Dodo `activate`(携带设备名,如 hostname)→ 获得 `license_key_instance_id`,与 key 一起经 secretBox 加密存本地。
3. 每次启动 + 每 24h 调 `validate` 刷新授权状态。订阅取消/过期时 Dodo 自动使 key 失效。
4. 设备限额 3 台。app 内提供"停用本机"(调 `deactivate` 释放名额),换机自助,不走客服。
5. `subscription.plan_changed` 会作废旧 key 并签发新 key:客户端需处理"key 失效 → 引导重新输入新 key"的流程(为将来 Pro/Pro+ 分档预留)。

## 3. 离线宽限与降级

- `validate` 成功时记录时间戳(加密存储)。离线时上次成功在 **14 天内** → pro 功能照常;超期 → 降级并提示。
- 降级 = 仅禁用 AI 功能入口;图表、行情、journal、用户数据完全不受影响,不删除任何数据。
- Dodo validate 响应无签名,不防中间人伪造。接受:防线在"pro 代码闭源",不在客户端校验强度。

## 4. 授权状态模块(演进伏笔)

客户端将"授权状态"收敛为单一模块(输入:license key;输出:`{ tier, validUntil, offlineGraceUntil }` 一类的状态对象),pro 功能只消费该状态,不直接感知 Dodo。

未来上托管服务(开发者出 AI 额度、云同步)时:新增自有薄后端,经 Dodo webhook 同步订阅状态到自有账户体系,客户端把该模块实现从"直连 Dodo validate"替换为"向自有后端换取短期签名令牌(Ed25519)",消费方零改动。

## 非目标(本期不做)

- 自建 license 服务器、账户体系、签名令牌
- 托管 AI 额度、云同步
- 试用期机制(免费版即体验入口;如需 pro 试用,后续用 Dodo 订阅 trial 配置,不改客户端架构)
- 对历史开源版本的任何追溯处理

## 参考

- Dodo license keys 文档:https://docs.dodopayments.com/features/license-keys
- 桌面应用收款指南:https://dodopayments.com/blogs/accept-payments-desktop-app
