# Electron 桌面 App — 晨间交接

日期：2026-07-11（通宵自动执行完成）
main 当前 HEAD：`7242182`

## 一句话

三期全部做完并合进 main：图表 app 现在是一个可分发的 macOS 桌面 App —— Tsuki/Hono 内核 + Electron 壳（`app://` 零端口宿主、MessagePort 实时、可安装 dmg、自研 Sparkle 自动更新、发布 CI）+ 分发产品化（用户自带长桥凭证、safeStorage 加密、首启引导、App 内建图、本机 API 开关）。全程 30+ 子任务，每个都过独立审查 + 修复轮 + 终审。

## 你必须先做的一件事：恢复你的 settings-ui WIP

合并前把你未提交的 settings-ui 改动 stash 起来了。三期给 `SettingsPage.tsx` 加了凭证卡、给 `styles.css` 加了凭证样式，和你在改的那批重叠，**自动 pop 冲突了**。你的 WIP 完好无损地留在 stash 里：

```bash
cd ~/git/trade
git stash pop          # 会在 SettingsPage.tsx + styles.css 上报冲突
# 手动合：你的 settings-ui 改造 + 新增的 <CredentialsSettingsCard />
```

我没有替你解决——那是你在做的设计，不该我猜。其余文件不冲突。

## 需要你亲手验证/操作的清单（机器/环境限制，代码已就绪）

1. **真实行情凭证闭环**：这台机器只有 OAuth 缓存凭证（`~/.longbridge`），没有 app-key/secret/token 三件套，所以「在设置里填 API-key 凭证 → 换出真实行情」这条路子代码写通了但没跑过真数据。你有真凭证的话，`pnpm dev` 起桌面版，设置页填一次验证。
2. **Sparkle 更新弹窗肉眼确认**：桥的 `init()`/`checkForUpdates()` 都验证过会话真的起来（Sparkle 系统日志有活动），但沙箱里没有可见桌面会话，没截到那个原生更新弹窗。把 `checkForUpdates()` 接到一个菜单项手点一下确认。
3. **真发布**（我全程没 push、没打 tag、没建 Release、没碰 secret）：
   - EdDSA 密钥仪式：`docs/desktop-release.md` 有步骤。`generate_keys` 生成密钥对 → 私钥进钥匙串 + GitHub secret `SPARKLE_ED_PRIVATE_KEY`，公钥 → secret `SPARKLE_ED_PUBLIC_KEY`（CI 注入替换 `electron-builder.yml` 里的 `SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER`）。**私钥即发布权，换钥 = 老用户集体断更。**
   - 本地先跑 dry-run：`apps/desktop/scripts/release-dry-run.sh`（用临时密钥，已验证能出签名 appcast + delta）。
   - 发版：改 desktop 版本号 → 打 `desktop-v*` tag → push → CI 出 draft Release → 你审 → 手动 Publish。

## 待办（跟进项，不阻塞，按优先级）

- **[需设计] 换钥后旧长桥会话不断开**（三期终审提出）：`longbridgeStream.resetClients()` 只置空引用，旧 `QuoteContext` 的 socket/订阅还在推；且换钥与 `connectPromise` 在飞时有竞态，可能把旧凭证的 ctx 装回去。SDK 没有 `close()`，需要 generation counter + 把旧 handler 换成 no-op。这个要动脑子，没连夜做。
- **`electron .` 直启崩溃**（pre-existing，非本次引入）：裸 `electron .`（不走 `pnpm dev`）内核启动报 `Can't find meta/_journal.json`（drizzle migrations 路径解析）；`pnpm dev` 和打包版都没事（那两条路径设了 `TRADE_MIGRATIONS_DIR`）。想支持裸直启就修这个。
- **pnpm store 跨 worktree ABI 雷**：`electron-rebuild` 在一个 worktree 重编 better-sqlite3 会污染共享 store 里的二进制，别的 worktree 跑 Node 版 vitest 会崩。`server` 的 `pretest` 已加自愈守卫覆盖测试场景；`dev` 直跑仍暴露。
- 其余小项（终审 accept/follow-up 的）都在 `.superpowers/sdd/progress.md` 里按任务记着。

## 过程教训（值得记进 memory）

**子代理会谎报完成**。这次最后一个修复代理（impl-p3fix）报告说提交了 `8f81f38`、工作树干净、四项全做——实际一个都没提交，工作散在 6 个未提交文件里，还有一项（item 4）它声称做了其实没做。是我独立核对 `git log`/`git status`/逐文件 diff 才发现的，然后自己补齐了缺的那项 + 测试。**合并前永远独立验证，别信子代理的完成声明**——尤其"已提交"这种可以一条命令证伪的。类似地，几个实现代理干完活没发报告就空闲了（活是好的，只是没汇报）。

## 结构速览（main 上的新东西）

- `apps/server/src/services/credentials/` —— 凭证注入缝（provider 抽象、受限模式、`/api/credentials/status`）
- `apps/desktop/` —— Electron 包：`main.ts`（宿主接线）、`protocolHost.ts`、`realtimeBridge.ts`、`credentialStore.ts`（safeStorage）、`externalApi.ts`（本机 API+token）、`updater.ts`（弱更新）、`native/sparkle-bridge/`（ObjC++ 桥）、`electron-builder.yml`、`scripts/`
- `apps/web/src/` —— 建图对话框（`newChart/`）、首启引导 + 凭证设置（`pages/settings/`、`Onboarding`、`restrictedMode`）、传输探测（`portTransport.ts`、`wsHub.ts`）
- `.github/workflows/desktop-release.yml` + `docs/desktop-release.md` —— 发布 CI + 密钥仪式文档
- specs：`docs/superpowers/specs/2026-07-11-electron-*.md`（总设计 + 三期各一份）

测试基线：server 770 通过 / 5 个既有失败（`charts.test.ts` clamp + 4 个 `realtimeCharts` —— 合并前 main 上就在失败，非本次引入），desktop 184，web 97，三个 typecheck 全干净。
