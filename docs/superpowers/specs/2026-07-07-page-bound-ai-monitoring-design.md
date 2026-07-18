# AI 监测绑定页面生命周期 + 通知迁移到浏览器 — 设计

日期：2026-07-07
状态：已确认

## 背景与问题

当前 AI 监测循环完全在服务端运行，与浏览器无关：

- scheduler 在服务器启动时开跑（`apps/server/src/index.ts:35`），每 60 秒一个循环，进程活着就一直跑。
- 监测目标 = 当天（美东日期）创建过 intraday 分析图的所有股票（`apps/server/src/ai/scheduler.ts` 的 `discoverIntradayTargets`）。用户关掉页面、切去看别的股票，原股票依然被监测、依然发通知，直到美东日期翻天。
- 通知由 Node 端通过 `osascript` 发 macOS 系统通知（`apps/server/src/ai/notify.ts`），三个触发点：alert 级点评落库（`comments.ts`）、分析员完成重估（`analyst.ts`）、deep dive 完成或失败（`deepDive.ts`）。唯一开关是 `AI_NOTIFY` 环境变量，网页上没有任何通知入口。
- 前端 WebSocket（`/api/ws`，`apps/web/src/wsHub.ts`）只是"收听"已生成的点评，连接断开只清理监听者，不影响服务端监测。另外 `wsHub.ts` 在 tab 不可见时会主动断开 WS、可见时重连。

两个问题是同一根源的两面：服务器不知道"用户现在在看什么"。

## 已确认的取舍

1. **监测严格绑定页面**：页面开着才监测，关了就停（宽限期后）。不保留"关页面后的后台监测"能力。
2. **tab 开着但不可见也算"在看"**：页面存在就监测、保持连接、正常收通知。去掉"tab 隐藏就断线"的行为。
3. **盘后日结保留服务器自跑**：post tick 的一天一次日结不绑定页面，维持现状。

## 设计

### 1. 监测租约（核心机制）

服务端新增进程内租约表：`Map<symbol, { count: number; expiresAt: number | null }>`。

- 网页打开某个股票页、WS 订阅它的 comments 频道时，服务器为该 symbol 记一次租约；同一股票多个 tab 计数累加。
- WS 断开或退订时计数减一；减到零不立即失效，进入 **90 秒宽限期**（`expiresAt = now + 90s`）。宽限期内重新订阅则恢复计数、清除过期时间。刷新页面、网络抖动、切 tab 重连都不会打断监测和 AI 会话。
- 宽限期过后租约失效，symbol 掉出监测目标集。
- scheduler 每次循环的目标集改为交集：**当天建过 intraday 图 ∧ 当前持有有效租约**。图仍是前提（没做过分析的股票不监测），租约决定它此刻跑不跑。盘前（pre tick）监测同样受租约约束。
- 租约失效后不清除该股票的 commentator 会话——会话本来就有日期变更、错误、40 次运行 / 120k 字符的回收机制。重新打开页面能接着复用，保住 prompt 缓存。

### 2. 前端：保持连接

`apps/web/src/wsHub.ts` 去掉 `visibilitychange` 的"隐藏即断线、可见即重连"逻辑。tab 只要开着（无论前后台）就保持 WS 连接，租约随之持续有效。

### 3. 通知迁移到浏览器

服务端：

- 删除 `notify.ts` 的 osascript 路径与 `AI_NOTIFY` 环境变量（README 相应更新）。
- alert 级点评本来就走 comments 频道推给前端，无需新增。
- 分析员完成重估、deep dive 完成/失败改为新增一种轻量 WS 消息类型（按 symbol 频道推送），替代原来的三处 `notifyUser` 调用。

前端：

- 首次进入股票页时请求 Notification API 授权。
- 收到 alert 级点评或分析完成/失败事件时：tab 前台可见则不弹系统通知（人正在看，弹了是打扰），tab 不可见才弹；点击通知聚焦回对应页面。
- 页面已关闭则收不到（租约模型下监测本身也已停止，行为自洽）。

### 4. 边界情况

- **服务器重启**：租约表在内存，重启后为空；已开着的页面 WS 自动重连、重新订阅，租约随之重建，最多丢一两个循环。
- **没有任何页面开着**：scheduler 照常空转（目标集为空直接返回），成本可忽略，不停 interval。
- **手动触发的重估 / deep dive**：不受租约限制——用户主动发起的任务跑完为止；结果通知需要页面还开着才能收到，页面关了只落库不弹。
- **盘后日结（post tick）**：维持服务器自跑，与页面无关。

### 5. 测试

- 租约表单元测试：计数增减、多 tab 累加、宽限期恢复、过期清理。
- scheduler 目标集测试：有图无租约不跑、有租约无图不跑、两者都有才跑。
- WS 层测试：订阅建租约、断开减计数、断开后宽限期内重连不丢租约。
- 新增 WS 通知消息的格式与推送测试。
- 前端 Notification 弹出逻辑（前台不弹、后台弹）手动验证。

## 涉及文件（预期）

- `apps/server/src/ai/scheduler.ts` — 目标集与租约求交
- `apps/server/src/ai/` 新增租约模块（如 `leases.ts`）
- `apps/server/src/routes/ws.ts` — 订阅/退订/断开时增减租约；新增通知消息类型下发
- `apps/server/src/ai/notify.ts` — 删除 osascript，改为经 WS 推送（或整体移除、由调用点直接推）
- `apps/server/src/ai/comments.ts`、`analyst.ts`、`deepDive.ts` — 替换 `notifyUser` 调用
- `apps/web/src/wsHub.ts` — 去掉 visibilitychange 断线逻辑
- `apps/web/src/` — Notification 授权与弹出逻辑（股票页层面）
- `apps/README.md` — 通知说明更新
