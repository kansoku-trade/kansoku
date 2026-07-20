# @kansoku/build-overlay

日常怎么加/改一个 overlay、命令速查、依赖方向红线、CI 闸门，见 `docs/pro-overlay.md`。本文档只讲这个包本身提供的机制。

Pro 私有代码走同目录 `foo.ts` / `foo.pro.ts` 两文件约定并入宿主自己的 vite module graph：

- `foo.ts` 是公开仓库中的默认（OSS）实现。
- `foo.pro.ts` 是本地软链接，真实文件位于 `apps/pro/overlays`，由 `scripts/sync.mjs` 从 Pro 仓库镜像路径创建和校验。
- `src/index.ts` 导出的 `proOverlayPlugin` 是 vite/rolldown 插件：`resolveId` 在 `overlayRoot` 下存在同名 `.pro.<ext>` 文件时优先解析到它。
- `src/chunkGuard.ts` 导出 `isProModule` / `proLeakGuard`：构建期的两条硬性边界检查——Pro 模块不得落到 `__pro__/` 加密目录之外的 chunk，公开 chunk 不得静态 import 加密 chunk（动态 import 是唯一合法的组合点）。
- `eslint/plugin.mjs` 提供依赖方向的静态检查规则：`no-explicit-pro-import`、`no-apps-pro-import`、`no-pro-only-resolution`、`no-self-default-import`、`overlay-manifest-consistency`、`no-escaping-import`。

```bash
pnpm --filter @kansoku/build-overlay sync    # 创建/更新/清理投影软链接
pnpm --filter @kansoku/build-overlay check   # 只读校验，漂移时非零退出
pnpm --filter @kansoku/build-overlay test
pnpm --filter @kansoku/build-overlay typecheck
```
