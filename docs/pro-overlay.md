# Pro Overlay 架构

这份文档讲的是「单图 overlay」架构：公开仓（`kansoku`）与私有仓（`kansoku-pro`，以 `apps/pro` 链接工作树的形式挂在公开仓下）在**同一次 vite 构建**里编译进**同一张模块图**，pro 代码靠 chunk 路由被隔离进 `__pro__/` 目录，打包时整体加密成一个 `pro.enc`，运行时按需解密、以内存虚拟模块的方式接回原图。产物永远只有一个：免费直接能用，输对 key 就地解锁 pro 功能，没有版本化的运行时 Edition ABI，也没有独立的 pro 构建产物。

设计动机与取舍见 `docs/superpowers/specs/2026-07-20-single-graph-overlay-design.md`；本文档只讲现在这套机制实际怎么运作、日常怎么用。

## 1. Overlay 命名约定与投影同步

- 公开仓某个文件的默认实现是 `foo.ts`；私有仓要覆盖它时，在 `apps/pro/overlays/<跟公开仓一致的镜像路径>/foo.pro.ts` 放真实文件。例如公开仓的 `apps/desktop/src/edition/pro.ts` 对应私有仓的 `apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts`。
- `pnpm overlay:sync`（内部调 `packages/build-overlay/scripts/sync.mjs` / `overlaySync.mjs`）会在公开仓里每个 overlay 文件对应的位置建一个同名软链接（`foo.pro.ts`，与默认文件 `foo.ts` 并排），指回私有仓的真实文件。这些软链接由 `.gitignore` 排除，不进公开仓的 git 历史；已建立的链接记在 `.kansoku-overlay-links.json`（同样 gitignore）。`pnpm overlay:check` 只读校验，不写盘。
- 没有默认兄弟文件的「私有专属」overlay（公开仓没有对应 `foo.ts`）必须登记进 `apps/pro/overlay.private-only.json` 的 `files` 数组，否则同步会报错。反过来，有默认兄弟却被登记成私有专属也会报错——两边必须精确对应。
- 五条 ESLint 规则（`packages/build-overlay/eslint/plugin.mjs`，插件名 `@kansoku/build-overlay-eslint`）把约定钉死：
  - `no-explicit-pro-import`：任何文件都不准显式 `import './foo.pro'` 或 `'*.pro.*'`。
  - `no-apps-pro-import`：默认文件不准 import `apps/pro` 下的任何路径。
  - `no-pro-only-resolution`：默认文件的相对 import 不准「只解析得到 `.pro` 版本、没有默认版本」。
  - `no-self-default-import`：一个 `.pro.ts` 文件不准 import 它自己对应的默认文件。
  - `overlay-manifest-consistency`：`.pro.ts` 文件本身是否登记进 `overlay.private-only.json`，要跟它是否存在默认兄弟保持一致（即上一条同步校验的 lint 版）。
  - 另有 `no-escaping-import`：禁止绝对路径 import，禁止相对 import 逃出 workspace 根。

这套机制因为软链接是普通文件系统对象，`apps/desktop`、`apps/web` 各自的 `tsconfig.json`（`include: ["src", ...]`）会自然把落在 `src/` 下的 `.pro.ts` 软链接一起纳入 typecheck——不需要额外的 `moduleSuffixes` 配置或单独的 pro typecheck 目标；`pnpm typecheck:desktop` / `pnpm --filter @kansoku/web typecheck` 本身就覆盖了已同步的 overlay 文件。

## 2. 组合点与唯一的动态 import 边界

宿主里需要接入 pro 的每个位置各有一个**组合点模块**，例如：

- `apps/desktop/src/edition/pro.ts`
- `apps/web/src/edition/pro.ts`
- `apps/server/src/edition/pro.ts`

默认文件（无覆盖时的行为）：

```ts
export async function loadProComposition(): Promise<DesktopProComposition | null> {
  return null;
}
```

覆盖文件 `pro.pro.ts`（真实实现在 `apps/pro/overlays/.../pro.pro.ts`）直接 `import` pro 侧的注册器（IPC services、realtime channels、AI extension、hooks），返回一份真实组合对象——普通同仓 TypeScript 调用，不经过任何 host 对象或协议层传递。

宿主侧只在一个地方接触这个组合点，并且必须是**带 catch 的动态 `import()`**（见 `apps/desktop/src/boot/kernel.ts`）：

```ts
const proComposition = await import('../edition/pro.js')
  .then((m) => m.loadProComposition())
  .catch((error) => {
    console.warn('[desktop] pro composition unavailable, running free', error);
    return null;
  });
```

chunk 缺失、解密失败、key 错误——全部会在这一个 `catch` 里落地成 `null`，免费路径全程走公开代码、静态可达。这是公开代码到 pro 代码唯一的运行时边界。

## 3. Chunk 路由与两条构建期断言

`apps/desktop/vite.main.config.ts`（node 侧，产物 `dist-main/`）与 `apps/web/vite.config.ts`（web 侧，产物 `dist/`）各自跑一次独立的单图构建，都接入同一套 `@kansoku/build-overlay` 插件：

- **`proOverlayPlugin`**：resolve 阶段优先选中 `.pro.ts` 软链接（只有当它确实是软链接、且落在声明的 `overlayRoot` 里时才生效）。社区检出没有 `apps/pro`（或设了 `KANSOKU_FORCE_FREE=1`）时插件不启用，全部落回默认文件。
- **chunk 路由**：`chunkFileNamesFor` 判断一个 chunk 的模块 realpath 是否落在 `apps/pro/` 下（overlay 软链接经 vite 默认走 realpath 解析后即是），是则整个 chunk 输出到 `__pro__/`（node 侧 `dist-main/__pro__`，web 侧 `dist/assets/__pro__`）。
- **`proLeakGuard`**：两条 build-fatal 断言（`generateBundle` 阶段，出错直接让构建失败）：
  1. `__pro__` 之外的任何 chunk 都不准包含 pro 模块（否则明文泄漏）；
  2. `__pro__` 之外的任何 chunk 都不准**静态** import `__pro__` 内的 chunk（打包后明文会被删掉，静态边会让免费产物直接崩）。组合点的动态 `import()` 是唯一合法的跨边界引用。

node 侧构建还给 `ssr.noExternal: true`（只有 `electron`、`better-sqlite3`、`electron-sparkle-updater` 保持 external），保证宿主和 pro chunk 共享同一份依赖实例——tsuki 装饰器元数据、数据库单例等都天然共享，不会因为两份模块实例而失效。

## 4. `stagePro` / `packEnc` / 解密

打包命令 `pnpm package`（`apps/desktop/package.json`）依次跑 `pnpm build → stageSkills → stagePro → rebuild-native → build:native → electron-builder`。

- **`stagePro.mjs`**：
  - 若 `KANSOKU_FORCE_FREE=1` 或 `apps/pro/package.json` 不存在（社区构建），要求两个 `__pro__` 目录都不存在（陈旧构建的话直接报错退出），否则直接放行、不产出 `pro.enc`。
  - 否则要求 `dist-main/__pro__` 与 `dist/assets/__pro__` 都存在，调 `apps/pro/scripts/packEnc.mjs` 把两者打包加密成一个 `apps/desktop/pro/pro.enc`（放在 `desktop/` 下是因为 electron-builder 的 `files` 配置要把它打进 `app.asar`，解密路径也是照这个位置去找）。
  - 加密完成后**删除**两个明文 `__pro__` 目录——`pro.enc` 是唯一进入打包流程的 pro 产物。
- **`packEnc.mjs`**：把 node/web 两份 `__pro__` 文件收集成一个 manifest（`node/` / `web/` 前缀 + base64 内容），注入 `bundle.json`（`formatVersion`、`buildId`、`publicCommit`、`proCommit`，只做诊断用，不再有 ABI 版本字段），用 `KANSOKU_BUNDLE_KEY`（64 位十六进制、32 字节）+ `KANSOKU_BUNDLE_KEY_ID` 做 AES-256-GCM 加密，字节格式是 `MAGIC("KPRO1") + 12 字节 IV + 16 字节 authTag + gzip(JSON) 密文`——这个格式被公开仓的 golden fixture 钉死，改格式要重新生成 fixture。web 侧 chunk 还会被扫一遍，确认没有引用 `electron` 或 `node:` 内置模块（浏览器侧代码不能有 Node/Electron 专属引用）。
- **运行时解密**（`packages/core/src/pro/loader.ts` 的 `loadPro`）：
  - 找不到 `pro.enc` → 直接返回 `null`（免费）。
  - 找到但没 key（`getActiveBundleKey()` 拿不到，且非打包环境下 `process.env.KANSOKU_BUNDLE_KEY` 也拿不到）→ 打日志说明，返回 `null`（免费）。`KANSOKU_BUNDLE_KEY` 环境变量只在非打包构建里生效（`isBundleKeyEnvAllowed`，和 `KANSOKU_LICENSE_BYPASS` 同一套 `isPackaged` 判断）——打包版不认这个变量，堵住「设个环境变量就用泄漏 key」的后门。
  - 有 key 但解密/校验失败（错 key、被篡改、**manifest.keyId 与当前 key 的 keyId 不一致**）→ `catch` 住，打警告日志，返回 `null`（免费）。**永远不抛出去让宿主崩溃。** keyId 一致性是每版轮换 key 的 enforcement：旧 key 解不开新包，revalidate 领到新 key 后旧包也会因为 keyId 对不上而停在免费模式，直到 App 更新到配套版本。
  - 成功：node 侧文件被注册成虚拟模块，路径映射回它们在 `dist-main/__pro__` 下**原本的位置**（`packages/core/src/pro/encLoader.ts` 的 `registerVirtualModules`），所以 pro chunk 之间的相对 import（`../chunk-x.mjs`）能落到正确的虚拟文件上；web 侧文件保留在内存 `Map<string, Buffer>` 里，交给协议层。
- **泄漏闸门**：pro 入口链（`apps/pro/src/entries/canary.ts`）埋了一个 canary 常量；`apps/desktop/scripts/afterPack.cjs` 在打包后扫描 `app.asar` 原始字节找这个常量，命中就让打包失败——这是 `proLeakGuard` 之外的第二道独立防线，专门防明文 pro 代码混进最终产物。

## 5. `app://` 协议的内存态服务（仅 Electron）

Web 渲染进程走自定义 `app://` 协议（`apps/desktop/src/platform/protocol/protocol.ts`），不是普通的 `file://` 或 dev server：

- 请求先过 `decideRoute` / `guardStaticPath`（路径穿越、绝对路径、反斜杠一律拒绝），再决定去哪取内容。
- `setProAssets(webFiles)` 把解密出的 web 侧 `Map<string, Buffer>` 交给协议层的 `resolveAssetSource`：命中就直接从内存 `Buffer` 返回（`kind: 'memory'`），不落盘；没命中就走磁盘上的 `dist/` 静态文件（`kind: 'disk'`）。
- 因为都在同一个 `app://` 源下，pro chunk 对公共 chunk 的相对 import 天然能解析，不需要额外的协议或 importmap 技巧。pro 的路由表本身就在 pro chunk 里——组合没激活成功时，pro 页面在路由图里根本不存在，不是「存在但被隐藏」。
- 应用退出时 `setProAssets(null)` 清空这份内存态资源。

## 6. Dev 工作流

- **`pnpm dev:desktop`**：`apps/desktop/scripts/dev.mjs` 用 `vite build --watch` 跑 `vite.main.config.ts` / `vite.preload.config.ts`（`KANSOKU_DESKTOP_DEV=1`），输出明文 `__pro__` chunk 到 `dist-main/`；kernel 直接从磁盘加载这些明文 chunk，没有加密、没有走 `app://` 内存态协议。同时跑 `apps/web` 的 vite dev server。
- **`pnpm dev`**（纯浏览器，无 desktop）：走源码图 + overlay resolver，只要本机存在 `apps/pro`，pro 功能一样能用——这跟「生产浏览器部署没有 pro UI」不矛盾：那是**产物形态**的约束（standalone server 生产构建不带 pro），不是 dev 环境的限制。
- Overlay 投影本身要手动或经 CI 跑 `pnpm overlay:sync` 才会生效；改了 `apps/pro/overlays/` 下的文件后，dev watcher 靠 `addWatchFile(realpathSync(candidate))` 显式监听软链接的真实目标（because bundler 的默认 watcher 只跟踪软链接本身、不追踪到目标）来触发重建。

## 7. 四态验证矩阵

同一个产物必须在下面四种状态下都表现正确，验证脚本见 `apps/desktop/scripts/verifyFourStates.mjs`（对应 desktop kernel 里新增的 `[boot] proComposition=active|free` 结构化启动日志，和 `KANSOKU_EXIT_AFTER_BOOT=1` 让应用启动自检完就自己退出）：

| 状态 | 构建方式 | 运行时 | 期望 |
| --- | --- | --- | --- |
| 已激活 | pro 构建（`KANSOKU_BUNDLE_KEY` + `KANSOKU_BUNDLE_KEY_ID`） | 用打包时同一把 `KANSOKU_BUNDLE_KEY` 启动 | `proComposition=active`，正常退出 |
| 未激活（锁定） | 同一个 pro 构建产物 | 不传 `KANSOKU_BUNDLE_KEY` | `proComposition=free`，正常退出，不崩 |
| 错 key | 同一个 pro 构建产物 | 传一把错误的 `KANSOKU_BUNDLE_KEY` | `proComposition=free`，正常退出，不崩（解密失败必须安全降级） |
| 社区构建 | `KANSOKU_FORCE_FREE=1` | 任意 | `proComposition=free`；**且**打包产物的字节里完全找不到 pro canary 常量（`grep` 打包后的 `.app` 目录，`grep` 退出码应为 1） |

未激活、错 key、社区三态都必须落到「完整能用的免费版」，绝不能崩溃——这是这套架构最基本的安全底线：**免费模式就是失败兜底模式**。
