# kansoku 切换到 electron-sparkle-updater 库(阶段三)实施计划

背景:Sparkle 更新方案已抽成独立开源库 `electron-sparkle-updater@0.1.0`(https://github.com/Innei/electron-sparkle-updater ,本地克隆 `~/git/innei-repo/electron-sparkle-updater`,spec 见其 `docs/specs/2026-07-18-electron-sparkle-updater-design.md`)。本计划把 `apps/desktop` 从本地实现切到该库,删除重复代码,发版 CI 换用库的 composite Action。

## 全局约束

- 分支 `sparkle-lib-migration`,在本仓库(trade-skills)操作;库仓库只在 Task 4 打 `v1` tag,不改代码。
- 库的能力边界:运行时 `loadSparkleBridgeForApp`(非 darwin / 加载失败返回 null)、`./fallback`(弱检查纯逻辑 + `createElectronFallbackDeps`)、`./builder`(`sparkleBuilderConfig` + `adHocSignAfterPack`)、CLI(`rebuild` / `inject-public-key` / `fix-appcast` / `generate-appcast`)、`action/action.yml`。**app 特有的东西留在 app**:状态机(status.ts)、标题栏角标的静默检查节奏、对话框文案、SPARKLE_APPCAST_URL 等配置值。
- 打包路径契约:库的 loader 期望 addon 在 `app.asar.unpacked/node_modules/electron-sparkle-updater/native/build/Release/sparkle_bridge.node`。**本仓库用 pnpm(symlink node_modules),这是库终审记录的未验证风险(M5)**——Task 3 必须实测打包产物,若 electron-builder 打出的路径不符,用 loader 的 `addonPath` 逃生口修正,并把结论回写到库的 memory/issue。
- 桥 addon 的构建时机:老的 `build:native`(cd native/sparkle-bridge && npm ci && npm run build)换成 `npx electron-sparkle-updater rebuild --electron-version 43.1.0 --arch arm64`;`ensureDevNative.mjs` 里如有 sparkle 构建也同步替换(先读该文件确认)。
- 测试口径:凡是测"库里逻辑"的用例(版本比较、节流、parseLatestRelease、addon 路径解析)删除——库自己有 119 项测试;凡是测"app 胶水"的(status store、checkNow/installNow 分支、angular 角标行为)保留并改 import。
- 注释规则照旧:零注释,除非搬运的代码本身带 load-bearing 注释。文档一律中文白话。

## Task 1: 运行时切换(依赖 + updater 模块重写)

- `apps/desktop/package.json` dependencies 加 `electron-sparkle-updater: ^0.1.0`,repo 根 `pnpm install`。
- 删 `apps/desktop/src/updater/sparkle.ts`;`updater.ts` 改为:
  - `loadSparkleBridgeForApp`、`SparkleBridge`、`SparkleInitOptions` 从 `electron-sparkle-updater` import。
  - 弱检查逻辑(isNewerVersion / shouldCheck / parseLatestRelease / checkForUpdate / fetchJsonWithTimeout / ReleaseInfo / CheckForUpdateResult / UpdaterDeps)从 `electron-sparkle-updater/fallback` import,本地实现删除。注意库的 `checkForUpdate` 多了 `releasesUrl`(必填)、`tagPrefix`、`throttleMs` 参数——kansoku 传 `githubLatestReleaseUrl("Innei/kansoku")`、`tagPrefix: "desktop-v"`。
  - `createWeakCheckDeps` 可改用库的 `createElectronFallbackDeps`(通知标题保留现文案),或保留本地实现但内部全部引库函数——选改动小的那条,报告里说明。
  - `startUpdater` / `createUpdaterHandle` / `initUpdater` / status store 接线保持行为不变(SPARKLE_APPCAST_URL、占位符常量留在 app;占位符字符串可改从 `electron-sparkle-updater/builder` import `SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER`)。
- 测试:删 `test/updater/sparkle.test.ts`;`updater.test.ts` 删库逻辑用例、保留胶水用例并修 import;`status.test.ts` 不动。
- 验证:`pnpm --filter @kansoku/desktop test`、`typecheck` 过。提交。

## Task 2: 构建与打包接线

- `apps/desktop/package.json`:`build:native` 改 `npx electron-sparkle-updater rebuild --electron-version 43.1.0 --arch arm64`;`package` 脚本里的 `pnpm build:native` 保持调用点不变。
- 读 `scripts/ensureDevNative.mjs`,把其中 sparkle-bridge 相关构建替换为同一条 rebuild 命令(better-sqlite3 部分不动)。
- 删除 `apps/desktop/native/` 整个目录(sparkle-bridge 是唯一内容)。
- `electron-builder.yml`:
  - `files` 里删 `native/sparkle-bridge/build/Release/sparkle_bridge.node`,加 `"!**/node_modules/electron-sparkle-updater/native/vendor/**"`。
  - `asarUnpack` 的 sparkle 条目改 `"**/node_modules/electron-sparkle-updater/native/build/Release/*.node"`。
  - `extraFiles` 的 Sparkle.framework `from` 改 `node_modules/electron-sparkle-updater/native/vendor/Sparkle.framework`(pnpm symlink 是否被 electron-builder 解引用,Task 3 实测)。
  - `extendInfo` / dmg / zip 配置值不动(与库 `sparkleBuilderConfig` 的默认一致,yml 消费者按 README 手抄口径)。
- `scripts/afterPack.cjs` 改为薄包装:darwin 下动态 import `electron-sparkle-updater/builder` 调 `adHocSignAfterPack(context)`(注意 .cjs require ESM 需 Node ≥20.19,CI 用 node 24,本机也满足;库 README 有现成写法)。
- `release-dry-run.sh` 里 grep `native/sparkle-bridge` 引用并同步修正。
- 验证:`pnpm --filter @kansoku/desktop test`、`typecheck`;`npx electron-sparkle-updater rebuild --electron-version 43.1.0 --arch arm64` 真跑一次成功(addon 落在库包内)。提交。

## Task 3: 打包实测(pnpm 布局风险验证)

- 跑 `pnpm --filter @kansoku/desktop package`(完整 electron-builder 打包,含 web build;耗时可接受)。
- 对产物断言(写进报告,含命令输出):
  1. `release/mac-arm64/*.app/Contents/Resources/app.asar.unpacked/node_modules/electron-sparkle-updater/native/build/Release/sparkle_bridge.node` 存在(pnpm symlink 若导致路径不同,记录实际路径并在 `initUpdater` 用 `addonPath` 显式传入修正,再重打包验证)。
  2. `Contents/Frameworks/Sparkle.framework` 存在且非 symlink 碎片。
  3. `codesign --verify --deep --strict` 对 .app 通过(afterPack 包装生效)。
  4. asar 里没有 `native/vendor`(vendor 排除生效):`npx asar list ... | grep vendor` 为空。
- 任何一条不过:修正(电builder 配置或 addonPath)后重验,全过才提交。把 pnpm 布局的实测结论写进报告。

## Task 4: 发版 CI 切换 + 库侧收尾

- 库仓库(`~/git/innei-repo/electron-sparkle-updater`)打 annotated tag `v1` 指向 v0.1.0 同一 commit 并 push(README 示例用的 `action@v1` 从此有效)。
- `.github/workflows/desktop-release.yml`:
  - 保留:版本一致性检查、secrets 断言、release notes 提取、pnpm/node 安装、pro slot、测试门、native 缓存清理、web build、`pnpm package`、签名校验、archive dir 准备(zip + 同名 .md)。
  - "inject SUPublicEDKey" 步改:`npx electron-sparkle-updater inject-public-key --file apps/desktop/electron-builder.yml`(env `SPARKLE_ED_PUBLIC_KEY`;工作目录注意 npx 解析——desktop 依赖装在 workspace,repo 根 npx 可解析 workspace 包则用之,否则 `pnpm --filter @kansoku/desktop exec`)。
  - "fetch Sparkle tools"、"fetch existing appcast + delta"、"sign + generate appcast"、"repoint"、"publish" 五步删除,换成一步 `uses: Innei/electron-sparkle-updater/action@v1`,inputs:`tag`、`archive-dir`、`ed-private-key: ${{ secrets.SPARKLE_ED_PRIVATE_KEY }}`、`tag-prefix: desktop-v`、`publish: "true"`、`dmg-path`、`notes-file`。顶部 env 的 SPARKLE_VERSION/SHA 删除(Action 自带默认)。
  - 删 `.github/scripts/fix-appcast-enclosure-urls.mjs`(先 grep 确认无他处引用)。
- `docs/desktop-release.md` 同步更新叙述(grep `generate_appcast`、`sparkle-bridge`、`fix-appcast` 相关段落)。
- 验证:`actionlint`(若装了)或 YAML parse;全仓 `rg "sparkle-bridge"` 确认除 journal/历史 spec 外无活引用;`pnpm --filter @kansoku/desktop test` 仍绿。提交。
