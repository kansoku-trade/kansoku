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

> **本节已按 phase 1(2026-07-17 落地)的实际实现校订** —— 下面标了「实际」的地方是落地时对原设计的修正,其余条目和原设计一致。

**硬性约束:社区开发者只用公开仓库必须能构建出完整可用的免费版。** 公开代码对 pro 只有软依赖,任何一行公开代码不得硬 import 私有包。

- **公开仓库(kansoku)**:图表内核、web、desktop 壳、realtime、数据导入。免费版可从源码完整构建。
- **私有仓库 `@kansoku/pro`**:现 `packages/core/src/ai/` 整个目录迁入(agents、prompts、promptPolicy、conversationEngine、scheduler、recap、usage 等)。trading-discipline 注入链路随之进入私有包。**实际**:AI 相关的历史 db 表与迁移文件(`0000`–`0007`)已随早期版本发布、不可拆分,**继续留在公开 core 的 drizzle 目录**,闲置表对免费模式无害;今后新增的 AI 表迁移才放进 pro 包,`@kansoku/pro-api` 为此预留了 `migrations?: string` 字段(迁移目录路径),本阶段尚未实现读取该字段的第二迁移执行器。可选用 bytenode 将私有包编译为 V8 字节码再打包(尚未做,留作后续加固)。
- 已发布的历史版本(≤ v0.16.0)是全功能开源的,拆分不可追溯,接受这一事实。

插槽分三层:

1. **契约层 `@kansoku/pro-api`(公开,纯类型包)**:`ProModule` 接口定义 pro 模块提供什么——`tsukiModules`(server 路由模块)、`ipcServiceClasses`(desktop IPC)、`channels`(realtime 频道注册)、`hooks`(非 AI 代码需要反查的宏观事件过滤/跟进状态/点评列表等)、`startScheduler`、`initRuntime`,以及**实际新增的** `aiSettings`(设置页 AI 分节的委托对象,免费模式下 `getPro()?.aiSettings` 取不到就返回未配置态,不是原设计里笼统的"contract 路由处理器")。`ProHooks` 每一项在 `packages/core/src/pro/registry.ts` 都有免费模式默认实现(宏观过滤直通、跟进/点评列表空、scheduler 空转),调用方不用到处判空。
2. **装载层(公开)**:`app/pro/` 为 gitignored 插槽目录,release 脚本(`app/scripts/fetch-pro.sh`,读 `KANSOKU_PRO_REPO_URL`)发版时将私有仓库 clone 至此;pnpm workspace glob 写成可选匹配(目录缺失时照常解析)。core 启动时(`packages/core/src/pro/loader.ts`)动态 import + try/catch:成功则注册 pro 模块,失败则静默进入免费模式(单行 info 日志)。import specifier 用变量拼接而非字面量,打包器无法静态解析,避免 desktop 打包工具把不存在的路径打进产物。不用 git submodule(公开仓库挂私有 submodule 会让社区 `git clone --recursive` 报错)。
3. **能力广播层**:contract 增加 `capabilities` 查询(HTTP 与 IPC 双 transport),返回 `{ pro, licensed }`。web 前端据此渲染:`pro: false`(社区构建)隐藏 AI 入口;`pro: true, licensed: false` 显示上锁态 + 订阅引导;双 true 全功能。前端不感知 license 细节。**实际**:phase 1 里 pro 加载成功即 `{pro: true, licensed: true}`,`licensed` 的真实语义(区分"包已装"和"已订阅")等 Dodo Payments 接入(phase 2)才生效。

**实际(未在原设计出现,phase 1 顺带完成的公开侧调整)**:`watchedMarketsStore`(TD-LANG-03 的关注市场配置)本身不属于 AI 功能,留在公开 core,不随 AI 迁入 pro。

CI 分两条:公开 CI 无密钥、纯免费构建(持续验证"社区能跑"——`ci.yml` 的 checkout 天然就是 pro 缺失状态,等于每次跑都在验证这件事);release CI 用 deploy key 拉取私有仓库(**实际**:`desktop-release.yml` 已经挂了 `fetch-pro` 步骤,但门槛是 `KANSOKU_PRO_REPO_URL`——这个变量 phase 1 结束时还没配置,所以桌面发行版目前仍是社区构建;私有仓库尚未创建,打包 pro 产物、`extraResources`、原生依赖处理是明确的 phase 2 范围,不在本阶段完成)。

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
