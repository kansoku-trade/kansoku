# Desktop 发版流程（GitHub CI 完整闭环）设计

日期：2026-07-12
状态：已批准

## 目标

把 desktop 应用的发版做成完整闭环：`/release` skill 发起 → 升版本 PR（CI 检查）→ 合并后自动打 tag → 自动构建签名 → 自动发布 GitHub Release（带中文更新说明）→ 用户 app 内通过 Sparkle 收到更新。同时补齐日常 push/PR 的 CI 检查。

## 现状

- 已有 `.github/workflows/desktop-release.yml`：推 `desktop-v*` tag 触发，跑测试 → 打包 macOS dmg+zip → Sparkle EdDSA 签名 + appcast + 增量包 → 建**草稿** Release。发布要手动点。
- 版本号、tag 全手动，没有 changelog。
- 平时 push/PR 没有任何 CI。
- 应用端 Sparkle 订阅 `https://github.com/Innei/trade-skills/releases/latest/download/appcast.xml`——Release 一发布用户立刻可见（repo 已改名 kansoku，现在靠 GitHub 重定向在撑）。

## 关键技术约束

CI 默认令牌（`GITHUB_TOKEN`）打的 tag **不会触发其他 workflow**（GitHub 防递归机制）。因此"合并 → 打 tag → 构建"这条链中间不能靠 tag 事件衔接，改为打完 tag 后用 `gh workflow run` 直接调起构建流程。不引入 PAT，零维护。

## 组件

### 一、`release` skill（`.claude/skills/release/SKILL.md`）

发版入口。用户在 Claude Code 里发 `/release`（可带参数 `patch|minor|major` 跳过建议环节）。只有 SKILL.md，无脚本——git/gh 操作由 Claude 直接执行。

流程：

1. 前置检查：工作区干净、在 main 上、与远端同步。任一不满足即停并说明。
2. 找最近的 `desktop-v*` tag，收集其后所有涉及 `apps/` 与 `packages/` 的提交（`git log <tag>..HEAD -- apps/ packages/`）。没有相关提交则停：无可发版内容。
3. 建议升级幅度：含 feat → minor，纯 fix/chore/refactor → patch，破坏性变更 → major。用户带参数则直接用参数。向用户确认版本号后继续。
4. 用中文白话写一段**面向用户**的更新说明（讲用户能感知的变化，不是提交清单），插入 `apps/desktop/CHANGELOG.md` 顶部，格式：

   ```markdown
   ## X.Y.Z — YYYY-MM-DD

   - 更新点……
   ```

5. 更新 `apps/desktop/package.json` 的 `version`。
6. 开分支 `release/desktop-vX.Y.Z`，提交（`release(desktop): vX.Y.Z`），推送，`gh pr create`——PR 标题 `release(desktop): vX.Y.Z`，正文附更新说明。
7. 输出 PR 链接。之后的链路交给 CI。

### 二、`.github/workflows/ci.yml`（新，日常检查）

- 触发：`pull_request` 与 `push`（main），路径过滤 `apps/**`、`packages/**` 与 `.github/**`。
- `ubuntu-latest`，单 job：
  1. pnpm + node 24（配置与 desktop-release.yml 保持一致，只缓存 pnpm store）
  2. `pnpm install --frozen-lockfile`
  3. `pnpm -r typecheck`
  4. `pnpm --filter @trade/web test`、`pnpm --filter @trade/desktop test`
  5. server 测试走已知失败白名单门：`pnpm test --reporter=json --outputFile=test-results.json || true` → `node .github/scripts/assert-known-test-failures.mjs`
- 发版 PR 同样被它把关。
- concurrency：同分支旧跑取消（`cancel-in-progress: true`）。

### 三、`.github/workflows/desktop-tag.yml`（新，合并后打 tag）

- 触发：`push` 到 main，路径过滤 `apps/desktop/package.json`。
- 步骤：
  1. 读 `apps/desktop/package.json` 的 version，得目标 tag `desktop-vX.Y.Z`。
  2. tag 已存在 → 正常退出（幂等，防重复触发和非版本改动误发）。
  3. 打 annotated tag 指向当前 commit，推送。
  4. `gh workflow run desktop-release.yml -f tag=desktop-vX.Y.Z`。
- 权限：`contents: write` + `actions: write`。

### 四、`desktop-release.yml`（改造现有）

- 触发加 `workflow_dispatch`（输入 `tag`），与现有 tag 推送触发并存（手动打 tag 的老路仍通）。
- dispatch 场景下 checkout 对应 tag；版本一致性检查改为对 `tag` 输入/`GITHUB_REF` 二取一后统一校验。
- 测试步骤**保留**（macOS 与 ubuntu 环境不同，better-sqlite3 等 native 模块只在这里被真正验证）。
- Release 说明：从 `apps/desktop/CHANGELOG.md` 提取对应版本段落作为 body（`--notes-file`），替换 `--generate-notes`；段落缺失 → 构建失败并报错，强制说明先行。
- `--draft` 去掉，直接发布。发布即生效：`releases/latest/download/appcast.xml` 立刻指向新版。
- `REPO_SLUG` 更新为 `Innei/kansoku`；`apps/desktop` 源码与 `electron-builder.yml` 里两处 appcast/releases URL 同步改。

## 完整链路

```
/release → 升版本 PR（ci.yml 绿）→ 合并进 main
  → desktop-tag.yml 打 desktop-vX.Y.Z 并 dispatch
  → desktop-release.yml 构建、签名、appcast、发布 Release（带 CHANGELOG 段落）
  → 用户 app 内 Sparkle 收到更新
```

## 错误处理

| 情形                           | 行为                           |
| ------------------------------ | ------------------------------ |
| tag 已存在                     | desktop-tag.yml 静默跳过       |
| CHANGELOG 缺对应版本段落       | desktop-release.yml 报错失败   |
| tag 与 package.json 版本不一致 | 现有一致性检查报错失败（保留） |
| 发版 PR 上 CI 红               | 不合并即不发版，链路天然中断   |
| skill 前置检查不过             | 停止并向用户说明               |

## 测试

- ci.yml / desktop-tag.yml：推一个改动 `apps/` 的测试 PR 验证触发与路径过滤。
- desktop-release.yml 改造：先用 `workflow_dispatch` 对既有 tag 试跑（或发 0.1.x 测试版）验证 notes 提取与直接发布。
- skill：跑一次 `/release patch` 完整走到 PR，检查 CHANGELOG、版本号、PR 内容。

## 不做的事

- 不引入 PAT。
- 不做 Windows/Linux 打包。
- 不给 `.claude/skills/` 的 Python 脚本加 CI（要外网 API 和 secrets，意义不大）。
- 不改 Sparkle 签名/appcast/增量包既有逻辑。
