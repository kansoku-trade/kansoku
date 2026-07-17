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

## 2. 购买与激活流程(实际,phase 2 落地校订)

Dodo 的 activate / validate / deactivate 是公开端点,客户端直连,不需要自己的 license 服务器。全部实现在 `app/pro/src/license/`(闭源),公开侧只认识 `capabilities` 里的 `licensed` 布尔值和 license 路由的类型。

1. 用户经官网或 app 内跳转进入 Dodo checkout 订阅;Dodo 自动生成 license key 并邮件送达。app 内的跳转链接由环境变量 `KANSOKU_SUBSCRIBE_URL` 提供(未配置则设置页不渲染跳转,只留 key 输入框)。
2. App 设置页输入 key → `POST /api/license/activate` `{key}` → 内部调 Dodo `POST /licenses/activate`(携带设备名 = hostname)→ 拿到 `license_key_instance_id`,与 key、`lastValidatedAt`、`lastOutcome:"success"` 一起经既有加密设施(`secretBox`)落盘,不明文。
3. **实际**:base URL 只有 live/test 两态切换(`resolveDodoBaseUrl`,由 `KANSOKU_DODO_TEST=1` 选 test),没有做成通用可覆盖的 `baseUrl` 环境变量——单测靠注入 `fetch`/`DodoClient` 依赖绕开真网络,不是靠指向本地 mock server。
4. **实际**:复验时机是 pro `initRuntime` 后异步跑一次 + 每 24h 一次(`licenseSchedule.ts`,`setInterval` 且 `unref()`,不阻塞进程退出);激活/停用动作后立即在各自的 handler 内刷新一次。任何一次复验失败(网络异常、抛错)只落 `lastOutcome:"network_fail"`,绝不让启动流程崩溃。
5. `POST /api/license/deactivate` → 尝试调 Dodo `deactivate` 释放这台设备的名额(**实际**:即使 Dodo 侧调用失败也不阻塞——本地记录照样清空,换机/本机重装不能被网络问题卡住),再清空本地加密记录 → 状态回落 `unlicensed`。
6. `subscription.plan_changed` / 退订等场景由 Dodo `validate` 返回 `valid:false` 承接,归入下面第 3 节的 `invalid` 态,不是单独流程。

## 3. 五态状态机与降级语义(实际)

**唯一真源在 `app/pro/src/license/licenseState.ts`(`LicenseManager`),公开侧不复制任何一条判断逻辑。**

| 状态 | 触发条件 | `capabilities.licensed` | 说明 |
|---|---|---|---|
| `unlicensed` | 本地无 license 记录 | `false` | 从未激活,或已 `deactivate` |
| `licensed` | 上次 `validate`/`activate` 成功(`lastOutcome:"success"`) | `true` | 正常订阅中 |
| `grace` | 上次成功验证距今 ≤ **14 天**,但期间的复验因网络原因失败(`lastOutcome:"network_fail"`) | `true`(**对外等同已订阅**,附带 `graceUntil`) | 离线宽限,不因断网误判为过期 |
| `expired` | 距上次成功验证 > 14 天仍未验证成功 | `false` | 宽限期耗尽;**只要之后一次 `validate` 成功,自动回到 `licensed`——无需重新输入 key、无需人工干预**(状态由 `lastOutcome`/时间戳纯函数派生,不是一次性状态迁移) |
| `invalid` | `validate` 返回 `valid:false`(key 被作废、`plan_changed`、退订等) | `false` | 立即生效;需要用户重新输入新 key 走 `activate` 才能恢复 |

`snapshotFromRecord()` 是纯函数,每次读时用 `now()` 和 `lastValidatedAt` 现算 `grace`/`expired` 边界,不持久化这两个态本身——这正是"expired 自动恢复"的实现方式:下一次 revalidate 成功写回 `lastOutcome:"success"`,下一次读快照就直接落回 `licensed`。

**降级语义(pro 内实现,公开代码零判断)**:
- AI 相关 HTTP 路由(`assistant`/`chat`/`research`/`lobehub` 等 controller)统一挂 `@UseGuards(LicensedGuard)`;`reassess`、`deep-dive`、`aiSettings` 的 9 个委托方法在方法体最上方手动 `requireLicensed()`。未通过一律 **403**,响应体固定为 `{ok:false, error:"AI features require an active license", code:"LICENSE_REQUIRED"}`。
- IPC 没有 guard 原语,改用 `gateLicensedIpc()` 在模块注册时整体包一层每个 IPC service 的原型方法,未通过时返回同构的 `{ok:false, code:"LICENSE_REQUIRED", status:403}` 信封,不必逐个 handler 里插判断。
- `GET /overview/usage` 未授权直接 403;但 `GET /overview/recap` 会把 usage 折进一个必须成功返回的聚合响应里,所以未授权时**不抛错**,usage 字段降级为免费模式同款的全零形状(`{runs:0, calls:0, total_tokens:0, cost_total:0, by_layer:{}}`),其余字段(settlements/alerts)正常返回。
- AI 定时任务(scheduler tick、`resumeFollow`)在每次触发前先查 `isLicensed()`,未授权直接跳过整轮工作,只在状态**切换时**打一条日志(不是每 tick 都打);scheduler 本身仍然无条件启动,这样一旦运行中途激活成功,下一轮 tick 自动恢复,不需要重启进程。
- 图表、行情、journal、关注市场配置完全不受 license 状态影响,不属于降级范围。

## 4. 环境变量与开发时逃生舱(实际)

- `KANSOKU_DODO_TEST=1`:Dodo client base URL 切到 `https://test.dodopayments.com`(默认 `https://live.dodopayments.com`)。
- `KANSOKU_LICENSE_BYPASS=1`:开发/测试逃生舱,`isLicensed()` 直接短路返回 `true`,不touch 本地 license 记录(`capabilities.license.state` 仍照实反映底层状态,只有 `licensed` 布尔被强制拉高)。**只在非打包环境生效**:判定逻辑先看 Electron 的 `app.isPackaged`(仅在打包的桌面壳里可用),为 `true` 时直接判定 bypass 失效;`isPackaged` 拿不到信号(server 宿主没有 Electron)才退回看 `NODE_ENV!=="production"`。两条路径都堵死了"打包产物里这个变量被误设仍然生效"的可能。pro 测试套件默认在 `test/setup.ts` 里置 `1`,门禁类测试(`licenseGate.test.ts` 等)会显式设回 `0` 走真实 403 路径。
- `KANSOKU_SUBSCRIBE_URL`:设置页"订阅"跳转链接,未配置时该入口不渲染(见 `settings.service.ts` 的 `getSubscribeUrl`)。

## 5. 授权状态模块(演进伏笔,原设计保留)

客户端将"授权状态"收敛为单一模块(`LicenseManager`),pro 功能只消费该状态,不直接感知 Dodo。

未来上托管服务(开发者出 AI 额度、云同步)时:新增自有薄后端,经 Dodo webhook 同步订阅状态到自有账户体系,客户端把该模块实现从"直连 Dodo validate"替换为"向自有后端换取短期签名令牌(Ed25519)",消费方零改动。

## 非目标(本期不做)

- 自建 license 服务器、账户体系、签名令牌
- 托管 AI 额度、云同步
- 试用期机制(免费版即体验入口;如需 pro 试用,后续用 Dodo 订阅 trial 配置,不改客户端架构)
- 对历史开源版本的任何追溯处理

## 参考

- Dodo license keys 文档:https://docs.dodopayments.com/features/license-keys
- 桌面应用收款指南:https://dodopayments.com/blogs/accept-payments-desktop-app
