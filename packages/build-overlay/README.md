# Pro 文件 Overlay POC

日常怎么加/改一个 overlay、命令速查、依赖方向红线、CI 闸门，见 `docs/pro-overlay.md`。本文档只讲这个包本身覆盖的三类验证场景。

这个包验证同目录 `foo.ts` / `foo.pro.ts` 的构建期选择机制，覆盖三类场景：

- **替换型**：`edition.ts` / `edition.pro.ts` 经共享基类 `edition/base.ts` 分别实现 OSS / Pro 版本，两者同名并存，Pro 优先。
- **Pro 专属模块**：`proFeature.pro.ts` 在公开仓库没有默认实现，登记在 `apps/pro/overlay.private-only.json` 里由 `scripts/sync.mjs` 校验。
- **别名 + 嵌套 index**：`entry.ts` 经路径别名 `@poc/widgets/index.js` 引入 `widgets/index.ts`；Pro 模式下同一别名解析到 `widgets/index.pro.ts`。

- `foo.ts` 是公开仓库中的 OSS 实现。
- `foo.pro.ts` 是本地软链接，真实文件位于 `apps/pro/overlays`。
- Vite 与 tsdown 共用 `proOverlayPlugin`，Pro 模式优先解析软链接；别名场景走插件里 `this.resolve` 的宿主优先分支。
- TypeScript 的 Pro 配置使用 `moduleSuffixes: [".pro", ""]`，并配合 `paths` 完成别名映射。
- `scripts/sync.mjs` 根据 Pro 仓库中的镜像路径创建和校验软链接。

完整验证由 Pro 仓库执行：

```bash
pnpm --filter @kansoku/pro poc:overlay
```

该命令分别构建 OSS 和 Pro 图，检查 OOP 子类选择结果与别名 + 嵌套 index 的覆盖结果，然后把 Pro 的单文件构建产物封装成一个 `pro.enc` 并解密回读验证。

> **尚未验证的边界**：浏览器 / Electron Renderer 对解密后 UI module graph 的真实加载，本 POC 未覆盖，是正式迁移前需要单独验收的一道门（Renderer 门）。
