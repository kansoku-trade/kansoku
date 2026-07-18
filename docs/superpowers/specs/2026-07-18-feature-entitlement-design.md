# 功能授权目录（feature entitlement）设计

日期：2026-07-18
状态：已确认待实施

## 背景与问题

付费功能的门禁散落在四套机制里，全是二元判断（有没有 pro / 有没有授权），没有「功能 → 计划」的映射：

- Web：`useCapabilities`（`{pro, licensed}`）+ `useFeatureGuard`（笼统的 `locked`），各组件自行判断；
- Server：controller 手工撒 `requirePro()`；
- Electron main：IPC 层手工撒 `requirePro()`；
- Core：`requireProLicensed()`（service 层）；
- Pro 内部：`licenseGate.requireLicensed()`。

后果：每加一个付费功能要在 3~5 处手工加判断，漏一处就是一个洞（实例：AI 跟进曾在无授权时默认开启且无法关闭）。付费功能未来会变多，也会有功能从付费下放为免费，需要一份统一的清单和一套从清单派生的强制机制。

## 需求结论（已确认）

1. 档位模型：free/pro 两档，不做多计划、不做按模块订阅。
2. 清单源头：`packages/pro-api` 里的静态表，随版本发布；不做远端下发。
3. 拦截形态：契约（`defineRoutes`）声明 feature key，service 层统一拦截；非路由入口手动兜底。
4. UI 呈现：维持现状三态——无 pro 模块完全隐藏（absent）、有 pro 未授权显示锁并引导订阅（locked）、已授权正常（active）。

## 设计

### 1. 功能清单（唯一源头）

新文件 `packages/pro-api/src/features.ts`：

```ts
export const FEATURES = {
  "symbol-follow":  { tier: "pro" },
  "deep-dive":      { tier: "pro" },
  "research-ai":    { tier: "pro" },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type FeatureTier = "free" | "pro";
export type FeatureState = "active" | "locked" | "absent";
```

规则：

- 只有「现在收费」或「曾收费后下放」的功能进表；从未收费的功能不建 key。
- key 用稳定 kebab-case，发布后不改名（会出现在错误提示与测试里）。
- 下放 = 把该 key 的 `tier` 改为 `"free"`，随版本发布，全链路自动放行，不动调用点。
- 首批 key 以实际盘点为准：现有付费面为个股自动跟踪（symbol-follow）、深度研究（deep-dive）、研究库 AI（research-ai）；实施时逐一核对现有 `requirePro` / `useFeatureGuard` 调用点后定稿。

### 2. core 解析器（同构强制层）

新文件 `packages/core/src/pro/features.ts`，替代 `requirePro` / `requireProLicensed` 双轨：

```ts
featureState(key: FeatureKey): Promise<FeatureState>
// tier=free            → active
// tier=pro, 无 pro 模块 → absent
// tier=pro, 未授权      → locked
// tier=pro, 已授权      → active（授权状态经 getPro().license.isLicensed()）

isFeatureActive(key: FeatureKey): Promise<boolean>

requireFeature(key: FeatureKey): Promise<void>
// absent → ClientError 404 "AI features are not available in this build"
// locked → ClientError 403, code "LICENSE_REQUIRED", hint 含 feature key
```

- 跑在 kernel 里，apps/server 与 apps/desktop 共享同一份实现，天然同构。
- 已知边界：apps/pro 自带一份 core 拷贝、单例不共享，pro 内部（scheduler、pro 自有路由）继续用自己的 `licenseGate` 二元判断；本机制只管开源 core 中的付费触点。
- 旧的 `requirePro()` / `requireProLicensed()` 迁移后删除。

### 3. 契约声明 + service 统一拦截

`defineRoutes` 的路由项增加可选字段 `feature?: FeatureKey`：

```ts
export const symbolsRoutes = defineRoutes<SymbolsApi>("symbols", {
  startFollow: { method: "POST", path: "/:sym/follow", feature: "symbol-follow" },
  stopFollow:  { method: "POST", path: "/:sym/unfollow" },
});
```

core 新增包装器，在 service 定义处应用：

```ts
export const symbolsService = withFeatureGates(symbolsRoutes, { /* 实现 */ });
```

- `withFeatureGates` 遍历路由表，凡标了 `feature` 的方法自动前置 `await requireFeature(key)`。
- 两个宿主（Tsuki controller、electron IPC）都直接调用 service，契约写一次、两端生效。
- controller 与 IPC 里现存的手工 `requirePro()` 全部删除。
- 非路由入口（建图自动跟进、pro hooks 触发点等）用 `isFeatureActive(key)` / `requireFeature(key)` 手动兜底。
- 关闭/退出类操作（如 `stopFollow`）永远免费，不标 feature。

### 4. capabilities 下发 + web 消费

`GET /api/capabilities` 扩展，服务端算好三态下发，web 不自行推导 tier 逻辑：

```ts
interface CapabilitiesOut {
  pro: boolean;
  licensed: boolean;
  license?: LicenseSnapshot;
  features: Record<FeatureKey, FeatureState>;
}
```

web 侧：

```ts
const { state, guard } = useFeature("symbol-follow");
// state: "active" | "locked" | "absent"
// guard(action): active 执行；locked 弹 license modal；absent 不动
```

- 新组件 `<FeatureGate feature="..." locked={...}>` 收敛三态渲染：absent 隐藏、locked 渲染锁定态、active 正常。
- 替换 FollowAction、NoteTab、ResearchAssistant 等处各自手写的 `useCapabilities` / `useFeatureGuard` 判断；旧 `useFeatureGuard` 迁移后删除。
- locked 状态下的「关闭已开启的付费功能」永远放行（不经 guard）。
- 授权变化时沿用 capabilities 现有的刷新机制。

### 5. 错误处理

- 服务端统一 403 + code `LICENSE_REQUIRED`（与 apps/pro `licenseGate` 现有口径一致），hint 中带 feature key 便于定位。
- absent（无 pro 构建）统一 404，与现有 `requirePro` 口径一致。
- web 收到 403 `LICENSE_REQUIRED` 时按现有错误展示处理，不做全局自动弹 modal（弹窗只由用户点击触发，经 `guard`）。

### 6. 测试

- **契约 parity 测试**（core）：遍历所有 `defineRoutes` 表，凡标 `feature` 的路由，在「pro 已注册但未授权」状态下调用对应 service 方法，断言抛 403 `LICENSE_REQUIRED`。新付费路由只要在契约标 key 即自动获得覆盖。
- **catalog 快照测试**：`FEATURES` 表做 snapshot，任何 tier 变更在 diff 中显式出现。
- **解析器单测**：featureState 四分支（free / absent / locked / active）。
- **web 组件测试**：`FeatureGate` 三态渲染；`useFeature().guard` 在 locked 时弹 modal、active 时执行、locked 下关闭类操作放行。

### 7. 下放与上收流程

- **下放（pro → free）**：改 `FEATURES` 一行 tier，随版本发布。已产生的用户数据（如已开启的跟进记录）保留，功能直接可用。
- **上收（free → pro）**：除改 tier 外须评估存量用户——原则上只对新启用点生效，已开启的存量给宽限或保留；具体随该次变更单独设计，本机制不内置强制回收。

## 实施范围

1. `packages/pro-api`：features.ts 新表 + 导出。
2. `packages/core`：features.ts 解析器、`withFeatureGates`、`defineRoutes` 类型扩展、capabilities service 扩展、现有 service 迁移（symbols 等）、删除 requirePro/requireProLicensed。
3. `apps/server` / `apps/desktop`：删除手工 `requirePro()` 调用。
4. `apps/web`：`useFeature` / `FeatureGate`、替换现有判断点、删除旧 `useFeatureGuard`。
5. 测试：parity、snapshot、解析器、web 组件。
6. `apps/pro`：不在本次范围（内部继续用 licenseGate）；仅在 pro 需要感知 key 时 import `FEATURES` 保持命名一致。
