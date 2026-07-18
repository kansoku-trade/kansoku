# Pro 7 天免费试用设计

日期：2026-07-18
状态：设计已确认，待实施
前置：`2026-07-17-subscription-open-core-design.md`（授权体系）、`2026-07-18-monetization-roadmap.md`（收费路线图）

## 目标

给 kansoku pro（$9.9/月 Dodo 订阅）加 7 天免费试用，降低首次订阅门槛。

## 方案：Dodo 卡前置试用（opt-out 模式）

四个候选里选定的一个：试用完全由 Dodo 承载，用户在结账页留支付方式但当天不扣款，第 7 天自动首扣，不取消就转正。落选方案与理由：

- 本地免卡试用：摩擦最低，但需要新增试用状态机、时钟回拨防护，且删应用数据即可无限重置。
- 邮箱换试用码（$0 商品 + 限时授权码）：需要验证 Dodo 对 $0 商品签发限时 key 的支持，滥用门槛只有换邮箱。
- 本地签名 token：需要从零建一套签发与验签设施，与现架构（key 无载荷、本地无验签）完全不符。

卡前置的取舍：试用人数会少于免卡方案，但转化率最高、零滥用、代码改动几乎为零。

## 机制（零架构改动）

1. Dodo 后台给现有 $9.9/月商品把 Trial Period Days 设为 7。live 与 test 两个商品都要配（`pdt_0NjOBmGHl9IgFNR2f1Zod` / `pdt_0NjNvPDN6npGvZ1oScS9w`，硬编码在 `apps/pro/src/license/subscription.ts`）。
2. 新订阅流程：结账页留支付方式（$0 到账）→ 授权码立刻邮件送达 → 回 App 粘贴激活 → 试用期内订阅状态就是 `active`（Dodo 无独立 trialing 态），`/licenses/validate` 照常返回 `valid:true` → 第 7 天 Dodo 自动首扣。
3. 试用期内取消：订阅转 `cancelled` → Dodo 把授权码标记失效 → App 的 24 小时重验证（`licenseSchedule.ts`）拿到 `valid:false` → 本地态翻 `invalid` → 锁定并弹付费墙。感知延迟最长 24 小时，走现有 `invalid` 路径。
4. 激活、验证、宽限、失效、403 兜底全部复用现有链路。`apps/pro` 与 `packages/core` 的逻辑代码零改动。

## App 侧改动

- 试用天数的事实源放在 `apps/pro/src/license/subscription.ts`（`TRIAL_DAYS = 7`，与商品 ID、价格标签同文件，共同镜像 Dodo 后台配置），经 `settings.getSubscribeUrl` 契约新增的 `trialDays` 字段流到 web。web 不硬编码试用文案，`trialDays` 为空时自动回落到原「前往订阅」话术——免费构建（无 pro slot）不受影响。
- `apps/web/src/LicenseModal.tsx`（付费墙）：有 `trialDays` 时主按钮为「免费试用 7 天 · 之后 $9.9 / 月，随时取消」，提示行补「试用期内不会扣款」。
- `apps/web/src/pages/settings/LicensePanel.tsx`：订阅入口变「还没有授权码？免费试用 7 天」。
- 「订阅解锁」类守卫入口（`LockedAiNotice.tsx`、`FollowAction.tsx`、`WatchBoard.tsx`）**保留原文案**：它们对「已付费但授权失效」的用户同样展示，提试用会误导；试用话术集中在付费墙与设置页，守卫点击后进的就是付费墙。
- 涉及两个 git 仓库：`apps/pro`（subscription.ts）单独提交，其余在主仓库。

## 明确不做

- App 内试用倒计时 / 试用状态展示。`/licenses/validate` 只返回 `valid`，App 无从区分试用中与已付费，也拿不到试用截止日（查订阅详情需要商户 API key，不能进客户端）。试用期提醒与账单通知由 Dodo（merchant of record）的邮件承担，App 内统一显示「已激活」。
- App 侧防滥用。留卡本身是最强门槛，换邮箱换卡的风控交给 Dodo。
- 存量订阅者迁移。trial 只在新订阅创建时生效，存量不受影响。
- 设备数调整。沿用现有 3 台激活上限。

## 实测结论（2026-07-18，test 环境全流程验证）

用测试卡（4242…）在 test 商品上走通了完整链路，两处文档空白均已证实：

1. **授权码在试用结账完成时立刻签发**——结账后 key 马上出现在后台（状态启用、到期「与订阅到期时间相同」），无需等首扣。
2. **试用期内验证通过**——试用订阅状态就是 `active`（Dodo 无 trialing 态），激活后 App 报 `licensed`，付费路由放行。
3. **取消订阅的两种生效方式**：Dodo 取消弹窗提供「在下次计费日取消」（试用场景=试用结束才失效）和「立即取消」。立即取消后 key 状态翻「已过期」，App 重启验证（或 ≤24h 定时验证）后状态翻 `invalid`、付费路由 403、设置页出现失效提示——全部走现有链路，零新代码。
4. **不续订 = 不能用**：key 有效性完全绑定订阅状态；续费失败会进 `on_hold`（key 临时失效，付款恢复后自动复活）。深度模拟可用失败卡 `4000 0000 0000 0341` + PATCH `next_billing_date`（见 Dodo Testing Process 文档）。

未决小项：Dodo 是否在试用到期前发提醒邮件未观察到（要等到第 7 天）——不影响方案，只影响结账文案措辞。

## 验收

- test 环境完整走通：结账（$0）→ 收 key → 激活 → capabilities 报 `licensed:true` → 后台取消订阅 → 触发重验证 → App 锁定弹付费墙。
- 付费墙与设置页文案更新，无残留旧话术。
- live 商品的 Trial Period Days 配置与 test 一致。
