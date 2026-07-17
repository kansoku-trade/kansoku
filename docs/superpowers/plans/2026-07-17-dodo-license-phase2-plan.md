# Dodo 授权接入第二阶段实现计划

Spec:`docs/superpowers/specs/2026-07-17-subscription-open-core-design.md` 第 2–4 节
前置:第一阶段插槽架构已合入 main(pro-slot);`app/pro` 私有仓库 `Innei/kansoku-pro` 已建。
分支:公开仓库 `feat/dodo-license`;pro 仓库直接在 main 上做(单人私有仓库)。
范围:license key 激活/验证/降级闭环。**不含**:发行版打包带 pro(仍是独立的二期遗留)、托管服务、试用机制。

## 用户手动前置(不阻塞开发,上线前完成)

- Dodo Payments 开户,建订阅 product,开 license key 开关,activation limit 设 3。
- 拿到 checkout 链接,填进设置(见 Task 3 的 subscribeUrl)。
- 开发期用 Dodo test 环境(`https://test.dodopayments.com`)+ mock 测试,不依赖真账号。

## 全局约束

- **授权逻辑全部住在 pro(闭源)**:Dodo HTTP 客户端、加密存储、状态机、复验调度、AI 路由的 licensed 闸门。公开侧只认识 capabilities 的 `licensed` 布尔值和 license 路由的类型(pro-api)。公开代码里不得出现任何授权判断逻辑。
- Dodo 端点(均免鉴权,client 直连):`POST /licenses/activate` {license_key, name} → 201 instance {id(lki_…), …};`POST /licenses/validate` {license_key, license_key_instance_id?} → {valid: boolean};`POST /licenses/deactivate` {license_key, license_key_instance_id} → 200。base URL live `https://live.dodopayments.com`,test `https://test.dodopayments.com`,由 pro 内配置切换(env `KANSOKU_DODO_TEST=1` 走 test)。
- **licensed 状态机**(pro 内实现,单一真源):无 key → `unlicensed`;validate 成功 → `licensed`(记 lastValidatedAt,加密存储);validate 网络失败且 lastValidatedAt ≤ 14 天 → `grace`(对外仍算 licensed=true,capabilities 附带 graceUntil);超 14 天 → `expired`(licensed=false);validate 返回 valid:false → `invalid`(licensed=false,立即,含 plan_changed/退订场景)。
- 复验时机:pro initRuntime 后异步一次 + 每 24h 一次;激活/停用动作后立即刷新。验证失败绝不崩溃启动。
- 存储:license key + instance id + deviceName + lastValidatedAt 经既有加密设施(core `services/secretCrypto` / desktop secretBox 路径,沿用 phase 1 现状)落盘,不明文。
- capabilities 形状扩展(pro-api):`{ pro, licensed, license?: { state: "unlicensed"|"licensed"|"grace"|"expired"|"invalid", graceUntil?: string, deviceName?: string, maskedKey?: string } }`。免费构建仍是 `{pro:false, licensed:false}`。
- 降级语义:licensed=false 且 pro=true 时,AI 路由在 **pro 的 handler 内**拒绝(403,typed error code `LICENSE_REQUIRED`);web 把 AI 入口渲染为上锁态 + 订阅引导(与 pro:false 的"隐藏"不同)。图表/journal/watched-markets 不受影响。
- 注释零容忍;文档中文白话;测试对 Dodo 一律 mock HTTP(单测不打真网络);两仓库各自提交,不自动 push。

## Task 1: pro 内 license 核心(Dodo client + 存储 + 状态机 + 复验)

- `app/pro/src/license/dodoClient.ts`:三端点薄封装,fetch 超时(10s)与网络错误归一化;base URL 按 env 切换。
- `app/pro/src/license/licenseStore.ts`:加密读写 {key, instanceId, deviceName, lastValidatedAt}。
- `app/pro/src/license/licenseState.ts`:状态机(全局约束里的五态)+ `getLicenseSnapshot()`(给 capabilities 用)+ `activate(key)` / `deactivate()` / `revalidate()` 动作;deviceName 默认 `os.hostname()`。
- 复验调度:initRuntime 后异步首验 + 24h 定时器(复用 pro 现有 scheduler 基建或独立 setInterval,以简单为准)。
- 单测(mock fetch):五态迁移全覆盖、网络失败进 grace、14 天界限、valid:false 即时失效、activate 成功写存储、deactivate 清存储。
- 验收:pro 包 typecheck + 测试绿(在 app/pro 仓库提交)。

## Task 2: 契约与闸门(license 路由 + capabilities 扩展 + requireLicensed)

- pro-api:capabilities 形状扩展(向后兼容);license 管理 API 类型(status/activate/deactivate 的请求响应)进 `ProModule`(参照 aiSettings 委托对象的既有模式,新增 `license` 委托对象)。
- contract(公开):新增 `license` 组 —— `GET /license/status`、`POST /license/activate` {key}、`POST /license/deactivate`;handlers 由 pro 的 tsukiModules/ipcServiceClasses 提供(HTTP 与 IPC 双 transport),pro 缺席时 404(既有 requirePro 模式)。
- capabilities service:licensed 与 license 快照改从 pro 的 `getLicenseSnapshot()` 取(pro 缺席仍 `{pro:false, licensed:false}`)。
- pro 的全部 AI 路由 handler 挂 licensed 闸门:licensed=false → 403 `LICENSE_REQUIRED`(HTTP 与 IPC 一致);grace 算通过。
- 测试:license 路由测试(mock 状态机);AI 路由 unlicensed → 403 的用例;capabilities 三态(免费/未授权/已授权)断言。routeParity(pro 套件内)同步。
- 验收:公开侧 + pro 侧 typecheck/test 双绿;pro 缺席态回归(公开测试不新增对 pro 的依赖)。

## Task 3: web 授权 UI(设置分节 + 上锁态)

- capabilitiesStore 扩展 license 快照;沿用三态(null/false/true)语义不变。
- 设置页新增「订阅与授权」分节(pro:true 才显示):未授权 → key 输入框 + 激活按钮 + 订阅链接(subscribeUrl 从新增的公开设置项读,空则不显示链接);已授权 → 状态行(licensed/grace 含 graceUntil 倒计时、maskedKey、deviceName)+「停用本机」按钮;invalid → 提示 key 已失效(退订或换档)+ 重新输入引导。
- AI 入口上锁态:pro:true && licensed=false 时 QuickBar/ChatDock/AI 路由页显示锁定样式 + 「订阅解锁」引导(跳设置分节),不再走 pro:false 的隐藏分支。403 `LICENSE_REQUIRED` 的响应在 AI 页面统一兜底为上锁提示。
- 文案中文白话。测试:store 扩展单测 + 关键渲染分支(unlicensed 锁态 / licensed 正常)组件级断言(沿用仓库现有 web 测试风格)。
- 验收:web typecheck/test 绿;pro:false 渲染回归不变。

## Task 4: 三态验收 + init-dev 脚本 + 文档收尾

- `app/scripts/init-dev.sh`(用户新增需求):一条命令初始化开发环境。检查 node/pnpm → 尝试把 pro 仓库 clone 进 `app/pro`(默认 `git@github.com:Innei/kansoku-pro.git`,`KANSOKU_PRO_REPO_URL` 可覆盖;有 `app/pro/.git` 则 pull;无权限则单行提示"进入免费模式"并继续,不中断)→ `cd app && pnpm install` → typecheck 冒烟 → 打印下一步提示(`pnpm dev`、`.env` 说明)。幂等,可重复跑;README 的上手章节改为指向它。

- 三态端到端(本地):(a) pro 缺席 → 与 phase 1 一致;(b) pro 在场无 key → capabilities licensed:false + AI 路由 403 + UI 锁态;(c) mock/test 环境激活 → licensed:true + AI 可用;deactivate → 回 (b)。用 `KANSOKU_DODO_TEST` + 本地 mock server(或 vitest 层面)完成,不要求真 Dodo 账号。
- 全仓 sweep(公开 + pro):typecheck + 全测试。
- 文档:spec 第 2–4 节按 as-built 校订(端点、状态机五态、403 语义);app/README.md 订阅小节;`app/pro` README 补 license 模块说明(私有仓库内)。
- 验收:双仓库各自提交齐整;ledger 收尾。
