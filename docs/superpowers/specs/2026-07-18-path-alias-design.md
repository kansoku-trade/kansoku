# import 路径整理（path alias）设计

日期：2026-07-18
状态：已确认待实施

## 背景与问题

跨包引用今天全部是相对路径钻进源码目录：apps/* → `packages/core/src` 66 处、apps/pro → core 143 处、web → core contract 22 处、core → shared 71 处。唯一按包名引的是 `@kansoku/pro-api`（几乎纯类型）。`packages/shared` 甚至不是一个包——没有 package.json，靠各 tsconfig 的 include glob 拉进来。import 链一长（`../../../../packages/core/src/...`）就难读、难移动文件、难 review。

约束：全仓没有编译产物，五套引擎直接执行 TS 源码——vite-node（server，含生产）、vite（web）、tsdown（desktop main、pro 构建）、tsx（desktop dev 加载 pro 源码）、vitest + tsgo（测试与 typecheck）。任何方案必须五套引擎同时认。

## 需求结论（已确认）

1. 跨包（package 维度）：真包名 + package.json exports 指向 TS 源码，不做 alias 表。
2. app 内部（app 维度）：`@web/` `@server/` `@desktop/` 短前缀；core/pro-api/shared 包内用真包名自引用（node self-reference，零配置）；apps/pro 内部维持相对路径。
3. 子路径不带 `.js` 后缀（exports 映射补 `.ts`）。

## 设计

### 1. 目标形态

```ts
import { setSymbolFollowing } from "@kansoku/core/ai/follows";
import { FEATURES } from "@kansoku/pro-api/features";
import type { ChartMeta } from "@kansoku/shared/types";

import { useFeature } from "@web/useFeature";
import { symbolsIpc } from "@desktop/ipc/symbolsIpc";
```

- 同目录/近距离的 `./x`、`../x` 相对导入保留，不强制改；只消灭跨包 reach-in 和 app 内跨目录长链（`../../..` 及以上）。
- apps/pro 内部维持相对（其源码被 tsx / vite-node 跨引擎加载，内部 alias 会把配置扩散到所有消费方）；pro 对 core/shared 的引用改包名。

### 2. 包侧改造（exports 是唯一声明点）

- `packages/core/package.json` 新增：
  ```json
  "exports": { "./*": { "types": "./src/*.ts", "default": "./src/*.ts" } }
  ```
- `packages/shared` 升级为真包 `@kansoku/shared`：新增 package.json（name、private、type: module、typecheck 脚本可选），exports wildcard 指向根目录散文件：
  ```json
  "exports": { "./*": { "types": "./*.ts", "default": "./*.ts" } }
  ```
  各成员 tsconfig 里的 `../shared/**` / `../../packages/shared/**` include glob 全部删除。
- `packages/pro-api/package.json`：现有 exports 补 `default` 条件（`.` 与 `./features` 两个子路径都补），根治 vitest 下 `@kansoku/pro-api/features` 解析失败的问题；core 里相对引 pro-api 的几处回归包名。
- 消费方 package.json 补依赖声明（`"@kansoku/core": "workspace:*"`、`"@kansoku/shared": "workspace:*"`、`"@kansoku/pro-api": "workspace:*"` 按需），pnpm 建符号链接。
- pro-api 此前「仓库内一律相对引 catalog」的临时决定随本次废除——default 条件补上后按包名引用。

### 3. app 短前缀配置

每个 app 三处对齐（typecheck / 运行构建 / 测试）：

| app | tsconfig paths | 运行/构建 | 测试 |
|---|---|---|---|
| web | `"@web/*": ["./src/*"]` | vite `resolve.alias` | vitest 复用 vite 配置 |
| server | `"@server/*": ["./src/*"]` | vite-node 读 server 的 vite config alias | 同一份配置 |
| desktop | `"@desktop/*": ["./src/*"]` | tsdown alias（main/preload） | vitest alias |

core / pro-api / shared / bench 无任何新配置——包名自引用走标准 node 解析。

### 4. apps/pro 与打包语义（不能破的东西）

- `apps/pro/tsdown.config.ts` 的 `alwaysBundle` 加入 `@kansoku/core`、`@kansoku/shared`：保持「core 整体内联进 pro bundle、双拷贝单例隔离」的既有设计，内联触发从相对路径变为裸包名命中名单。
- `@tsuki-hono/*`、`better-sqlite3`、`electron` 维持 external（单实例约束）。
- `packages/core/src/pro/loader.ts` 的文件路径动态 `import()` 不动；`@kansoku/pro` 依旧不被任何人声明为依赖、不可静态解析。
- desktop 的 tsdown 构建确认 `@kansoku/core` / `@kansoku/shared` 内联（不落 external）。

### 5. 迁移步骤（两个 commit）

1. **跨包包名化**：包侧 exports + 依赖声明 + codemod（脚本化，正则按前缀重写 import specifier）把所有跨包相对 reach-in 改为包名；pro 的 tsdown 名单同步。全仓 typecheck + test 全绿后提交。
2. **app 短前缀**：三个 app 的 tsconfig/vite/tsdown/vitest 配置 + codemod 把 app 内跨目录长链改为短前缀。全绿后提交。

### 6. 验收

- `pnpm -r typecheck`、`pnpm -r test` 全绿（含 apps/pro 自己的 vitest）。
- 冒烟：`pnpm dev`（web+server 起、图表页可开）；`pnpm dev:desktop`（tsx 加载 pro 源码路径生效）；`pnpm --filter @kansoku/pro build` 产物可被 server 加载；desktop 打包流程 `stagePro` 跑通。
- 防回退（可选）：lint 禁止新的 `../../packages/` 形态 import——视现有 lint 工具链是否方便挂接。

### 7. 风险与回退

- 主要风险集中在「引擎 × exports/paths」矩阵：wildcard exports 指向 `.ts` 已知在 vite/vite-node/vitest/tsx/tsdown 可行（pro-api 先例），tsgo NodeNext 按 types 条件解析；任何一处不认，第 1 步 typecheck/test 就会暴露，改动是纯机械替换，`git revert` 即回退。
- pro 双拷贝语义由 tsdown 名单保证，冒烟里专门验证 server 与 desktop 两条加载路径。
