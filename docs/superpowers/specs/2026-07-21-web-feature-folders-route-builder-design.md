# apps/web 目录领域化 + pages 约定式路由（vite-plugin-route-builder）设计

日期：2026-07-21
范围：`apps/web/src` 全量重组；路由层从自研 router 全迁 react-router v7；`pages/` 改为约定式路由目录。涉及 kansoku-pro overlay 路径镜像同步（跨 repo）。

## 背景与问题

- `src` 根目录散落约 60 个文件（wsHub、api、LicenseModal、FeatureGate、QuoteBar、各类 store 和 hook），没有领域边界。
- `pages/` 混装了页面壳、领域组件、hooks、纯逻辑和测试，路由与领域代码不分。
- 路由匹配是 `PageRouter.tsx` 手写 if/else，所有页面同步 import，没有 code splitting。

## 目标

1. `src` 根目录只留入口与全局文件：`main.tsx`、`App.tsx`、`AppSkeleton.tsx`、`styles.css`、`typeset.css`、`vite-env.d.ts`、`generated-routes.ts`。
2. 新建 `features/<domain>/`，所有领域代码按域归位；横切逻辑进 `lib/`，通用组件仍在 `ui/`。
3. `pages/` 变成纯约定式路由目录：每个文件对应一条路由，文件只做"薄壳"（解析参数、调 feature 组件），由 `vite-plugin-route-builder` 扫描生成路由表。
4. 路由运行时从自研 `router.ts` 全迁 react-router v7，desktop tab 与 pro overlay 两个机制行为不变。

## 非目标

- 不改任何页面的视觉与交互行为。
- 不改 pro composition 的对外契约（`WebProComposition.routes: Record<pathname, ComponentType>`）。
- 不动 `ui/` 内部结构。

## 目录结构设计

```
src/
  main.tsx  App.tsx  AppSkeleton.tsx  styles.css  typeset.css  vite-env.d.ts
  generated-routes.ts          # 插件产物，提交进 git

  pages/                       # 只允许路由段文件（薄壳），禁止其它任何文件
    index.tsx                  # /
    symbol/[sym].tsx           # /symbol/:sym
    popout/symbol/[sym].tsx    # /popout/symbol/:sym
    charts/[id].tsx            # /charts/:id（按 chart 数据二跳）
    research/index.tsx         # /research
    research/assistant.tsx     # /research/assistant（免费 stub，overlay 换实现）
    chat.tsx                   # /chat
    settings.tsx               # /settings
    about.tsx                  # /about
    logs.tsx                   # /logs
    [...fallback].tsx          # 兜底：渲染 Home（保持现行为），并承接 /overview、/charts 重定向

  features/
    home/          # 现 pages/home/* + pages/Home.tsx
    cockpit/       # 现 pages/cockpit/*（含 chat/ 子目录）+ pages/SymbolCockpit.tsx
                   # + pages/LockedAiNotice.tsx + analystRunsStore(.test)
    assistant/     # 现 pages/assistant/*
    research/      # 现 pages/research/*（含 ResearchAssistantPage 免费 stub）
    settings/      # 现 pages/settings/*
    about/         # 现 pages/about/*
    logs/          # 现 pages/logViewer/*
    onboarding/    # 现 onboarding/*
    charts/        # 现 charts/*（lw、drawings、intraday、sepa、simple、LayerPanel、NewsSection、SidebarTabs）
                   # + recentCharts.ts + pages/PopoutChartWindow(.test)
    desktop/       # 现 desktop/*
    edition/       # 现 edition/* + capabilitiesStore、FeatureGate、useFeature、
                   # LicenseModal、licenseModalStore、restrictedMode、
                   # licenseRequiredMode、RestrictedBanner（含各自测试）
    quotes/        # QuoteBar、useLiveQuote、useSymbolFollow
    notifications/ # GlobalNotifications(.test)
    palette/       # 现 palette/* + OpenSymbolDialog

  lib/
    router/        # react-router 封装层（见下）
    ws/            # wsHub、wsSnapshot、useWsChannel、useHubStatus（含测试）
    api.ts  apiHooks.ts(.test)  queryClient.ts(.test)  client/
    portTransport.ts(.test)  format.ts  theme.ts  useTitle.ts(.test)
    timeDisplayPreference.ts(.test)  appDeepLink.test.ts
    easternDate.ts  market.ts  notifications.ts  symbol.ts（原 lib/ 保留）

  ui/              # 原样保留
```

归类规则：被多个领域消费的纯逻辑进 `lib/`、纯组件进 `ui/`；只被一个领域消费的进 `features/<domain>/`。测试文件永远跟随被测文件。上表中 `OpenSymbolDialog`、`recentCharts`、`analystRunsStore` 等模糊件按初判归位，实施时用 grep 核实唯一消费方，与初判不符则按规则改归属（属实现细节，不回头改本设计）。

跨 feature import 允许（如 cockpit 用 charts），但方向必须无环；出现环则把公共部分下沉 `lib/` 或 `ui/`。

## 路由设计

### 依赖与生成

- 新增 `react-router` v7（单包）与 `vite-plugin-route-builder`（devDependency）。
- 插件配置（`vite.config.ts`）：
  - `pagePattern`: 匹配 `src/pages/**/*.tsx` 与 `*.sync.tsx`，**必须排除 `*.test.*` 与 `*.pro.*`**——pro overlay 以同名 `.pro.tsx` 文件投影进源码树，若被扫进公共路由清单会把 pro 模块静态引入公共 bundle，`proLeakGuard` 会拦截构建失败。
  - `outputPath`: `src/generated-routes.ts`，**提交进 git**（CI 与 vitest 不跑 vite dev server，需要产物在场）。
  - `enableInDev: true`，dev 下增删页面文件自动重生成。
- 页面默认 lazy（`.tsx`），获得页面级 code splitting；首屏关键页（`index.tsx`）可视情况用 `.sync.tsx`。pro chunk 命名边界（`__pro__/`）不受影响，由现有 `chunkFileNamesFor` 继续判定。

### 运行时：browser 与 desktop tab 两种挂载

- 浏览器/单窗口：`createBrowserRouter(routes)` + `<RouterProvider>`，替换 `App.tsx` 里的 `<Router />`。
- desktop tab 模式：每个 tab 一个 `createMemoryRouter(routes, { initialEntries: [tab.route] })`。用 `router.subscribe()` 把路由变化同步回 tabsStore / desktop bridge（替代现 `createMemoryRouteStore` 的 `onChange`）。tab 切换即切换渲染哪个 `<RouterProvider router={tab.router} />`。
- 模块级保留一个 `activeRouter` 指针（等价现 `__setActiveRouteStore`），`TabsProvider` 在激活 tab 时更新它；非组件代码（命令、深链、desktop 全局调用）经它导航。

### 兼容 shim：`lib/router/`

保留三个同签名公开入口，内部改由 react-router 实现：

- `navigate(route, { replace? })` → `activeRouter.navigate()`
- `useRoute(): string` → `useLocation()` 拼 `pathname + search`
- `useQueryParam(name)` → `useSearchParams()`

全 src 只有 8 个文件直接 import 旧 router，其余页面代码经这三个 hook 消费，基本零改。`installRouter()` 的全局 `<a>` 点击劫持与 `parseAppDeepLink` 深链解析逻辑原样保留（`resolveAnchorRoute` 纯函数不动），落点改为 `activeRouter.navigate`。`createMemoryRouteStore` / `RouteStore` / `__setActiveRouteStore` 删除。

### pro 路由注入

契约不变。注入点从"PageRouter 最先查 pro 表"改为：**pro 路径对应的公共 route 文件自己查**。`pages/research/assistant.tsx` 加载 pro composition（沿用 `useProRoutes()` 的懒加载缓存），命中则渲染 pro 组件，否则渲染免费 stub。当前 pro 只有 `/research/assistant` 一条路由；今后 pro 每加一条路由，公共侧都需要一个对应的 stub 页面文件——这是本方案接受的约束，写进 `edition/` 内注释级文档。overlay 的同名 `.pro.tsx` 换文件机制照旧工作。

### redirect 与兜底

- `/overview`、`/charts`（精确匹配）→ redirect `/`。
- `/charts/:id`：保留 `ChartRedirect` 逻辑（查 chart 数据后跳 `chartTargetPath`，404 跳 `/?notice=chart-not-found`）。
- 未匹配路径：渲染 Home（现行为），由 `[...fallback].tsx` 承接。

## 跨 repo 影响（kansoku-pro）

overlay 按路径镜像投影（`overlays/apps/web/src/<镜像路径>`）。公共侧文件移动后，pro repo 里对应 overlay 文件必须同步移动，且 overlay 内部 import（`@web/...`、相对路径）要指向新位置。已知涉及：

- `overlays/apps/web/src/edition/pro.pro.ts` → `.../features/edition/pro.pro.ts`
- `overlays/apps/web/src/pages/research/ResearchAssistantPage.pro.tsx` → `.../features/research/ResearchAssistantPage.pro.tsx`
- pro overlay 自有的 `pages/` 目录内文件同步改到 features 镜像路径。

实施顺序：公共侧先动 → pro worktree（`repos/kansoku/apps/pro`）同步改 → `pnpm overlay:sync` → 免费/付费两种构建验证 → 按 pin-push 流程三 repo 提交并更新 gitlink。

## 测试与验证

- 现有测试随文件迁移改 import 路径；`router.test.ts` 改写为 `lib/router/` shim 测试；`PageRouter*.test.tsx`（含 license、pro-route 两个变体）改写为基于 `createMemoryRouter` + 生成路由表的路由级测试，断言不变：路径→页面映射、redirect、pro 注入、license 门控。
- `tabsController.test.tsx` 改写 memory router 接线部分，断言不变：per-tab 路由独立、路由变化回写 tabsStore。
- 验收命令（全部须过）：
  1. `pnpm --filter @kansoku/web test`
  2. `pnpm --filter @kansoku/web typecheck`
  3. `pnpm --filter @kansoku/web build`（付费：overlay 在场）
  4. `KANSOKU_FORCE_FREE=1 pnpm --filter @kansoku/web build`（免费，leak guard 把关）
  5. `pnpm dev:desktop` 手工冒烟：多 tab 独立路由、tab 内导航回写标题、`/research/assistant` 付费/免费两态、popout 窗口、深链。

## 风险与顺序

风险最高的两块：desktop tab 的 memory router 重做、pro overlay 路径镜像同步。实施分四步走，每步可独立验证：

1. **目录先行**：features/lib 大迁移（纯移动 + import 改写，行为零变化），`pages/` 清空为待建状态，旧 `PageRouter` 的 import 同步改到新路径。此步必须先做——插件按 glob 扫 `pages/`，目录里残留领域文件会被误生成为路由。
2. **接插件 + react-router（browser 模式）**：建 `pages/` 薄壳、生成路由表、`createBrowserRouter` 挂载，删除旧 `PageRouter`；desktop tab 暂时仍走旧 store（shim 兼容期）。
3. desktop tab 迁 `createMemoryRouter`，删旧 `RouteStore` 体系。
4. pro overlay 路径同步 + 双构建验证 + pin-push。

步骤间不并行；步骤 1 的 pro overlay 镜像移动可与步骤 4 合并在 pro 侧一次完成（期间付费构建允许暂红，以免费构建为每步基线）。
