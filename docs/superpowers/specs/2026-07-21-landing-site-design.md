# kansoku.trade 官网（landing site）设计

日期：2026-07-21
状态：已确认

## 目标

为新域名 kansoku.trade 建一个小官网：landing + 定价 + changelog，docs 先占位。全站纯中文，受众是长桥用户。

## 范围

- 新增 `apps/site`（Astro 5，纯静态输出），放在 kansoku 公开仓库的 pnpm workspace 里。
- 不含：英文版 i18n、独立亮色主题、完整文档站。

## 页面结构

```
/            landing：hero（banner + 一句话卖点）→ 功能分块（盘中点评 /
             追问分析 / 研究库 / 本地优先隐私）配 README 现成截图 →
             free vs pro 对比 → 下载 CTA（GitHub Releases 最新 dmg 直链）
/pricing     免费版 vs Pro 对比表 + $9.9/月、$99/年（省 17%）、7 天试用，
             CTA 直挂 Dodo live checkout
/changelog   构建时经 GitHub API 拉全部 desktop-v* releases，按版本时间线渲染
/docs        占位一页：「文档建设中」+ 指回 README 与应用内引导
```

- 下载按钮在构建时解析最新 `desktop-v*` tag，直链 dmg；旁注 Apple Silicon only 与需安装 longbridge CLI 的前置说明。

## 视觉方向

- 深色为主，首版只做深色；以现有 banner 与应用截图为主视觉，不另造插画。
- 排版走「工具感 + 信任感」：大标题 + 等宽数字点缀，参考 Linear / Raycast 一类开发者工具站的密度，不做营销风大渐变。
- 三个差异点重点表达：本地优先（数据不出机器）、自带 key（无平台锁定）、AI 盯盘（截图即证据）。

## 技术接线

- **定价单一事实源**：构建时从 `packages/core/src/license/subscription.ts` 的 `resolveSubscription(process.env, true)` 取 live checkout 链接与价签。若整包 import 链太重，退路是按文件路径只引 `subscription.ts` 单文件。价签变更后重新 build 即同步。
- **changelog / 下载链接**：构建时匿名调 GitHub API 列 `desktop-v*` releases，取最新 dmg asset 直链。网络失败则构建失败，不降级为假数据。
- **部署**：Cloudflare Pages，绑定 kansoku.trade；发布手动触发。发版后 changelog 更新同样靠手动重新发布（后续可在 desktop release workflow 末尾追加自动触发）。
- **SEO**：每页 title / description / OG image，sitemap + robots.txt（Astro 自带能力）。

## 错误处理

- 构建期外部依赖只有 GitHub API：失败即构建失败，宁可不发布也不出假内容。
- 运行期无服务端、无外部请求，静态页面无运行时错误面。

## 测试

- `pnpm --filter @kansoku/site build` 通过即为主要验证；构建产物包含四个路由页面。
- changelog 与下载链接的构建脚本配最小单测（解析 release 列表 → 取最新 dmg 的纯函数部分）。
