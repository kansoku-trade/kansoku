# 桌面版发布流程（Sparkle 自动更新）

TradeCharts 桌面版走 Sparkle 2 做自动更新。发布靠 `.github/workflows/desktop-release.yml`：打
`desktop-vX.Y.Z` 标签会触发 CI 打包 dmg/zip、用 EdDSA 私钥签名更新包、生成
`appcast.xml`（含增量更新包 delta）、开一个**草稿** GitHub Release，人工确认没问题
再手动发布。CI 本身绝不会自动把 Release 从草稿状态改成公开。

## 一、密钥仪式（只需做一次）

Sparkle 用 EdDSA（ed25519）签名更新包，客户端用内嵌在 app 里的公钥验签。这把私钥
**等同于对所有用户机器的发布权** —— 泄露了别人能推送任意"更新"到用户设备；换钥
意味着老版本用户全部失去自动更新能力（旧 app 内嵌的是旧公钥,验证不了新签名）。
按下面步骤在你自己的 Mac 上生成一次即可,不要重复生成。

```bash
cd /tmp && curl -sSL -o sparkle.tar.xz \
  https://github.com/sparkle-project/Sparkle/releases/download/2.9.4/Sparkle-2.9.4.tar.xz
tar -xf sparkle.tar.xz bin/
./bin/generate_keys
```

`generate_keys` 会把私钥存进你 Mac 的登录钥匙串（Keychain，条目名 "Private key for
signing Sparkle updates"），并把公钥打印出来，形如：

```
<key>SUPublicEDKey</key>
<string>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=</string>
```

这个公钥字符串要交给两个地方：

1. **仓库 secret** `SPARKLE_ED_PUBLIC_KEY`——CI 打包时会把它 sed 替换进
   `app/desktop/electron-builder.yml` 的 `extendInfo.SUPublicEDKey` 占位符
   (`SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER`),嵌进每次构建出的 app 的 Info.plist。

私钥则导出成仓库 secret `SPARKLE_ED_PRIVATE_KEY`：

```bash
./bin/generate_keys -x /tmp/sparkle_private_key.txt
cat /tmp/sparkle_private_key.txt   # 这一行就是要填进 secret 的值
```

设置两个 secret（需要仓库 admin 权限,命令供参考,实际值别贴进任何文档/issue/PR)：

```bash
gh secret set SPARKLE_ED_PUBLIC_KEY  --repo Innei/trade-skills --body "<公钥字符串>"
gh secret set SPARKLE_ED_PRIVATE_KEY --repo Innei/trade-skills --body "<私钥文件内容>"
```

设置完之后**立刻删除本地的私钥导出文件**（`rm -f /tmp/sparkle_private_key.txt`）,
私钥往后只应该存在于:你 Mac 的 Keychain（留作灾备/换机迁移用)、GitHub repo secret
（CI 用）。不要用别的方式存（聊天记录、云笔记、明文文件都不行）。

## 二、发布跑一次的步骤

1. 确认要发布的改动都在 `main` 上,且 `app/desktop/package.json` 的 `version` 字段
   已经是这次要发的号（例如 `0.2.0`）。
2. 打 tag 并推送：
   ```bash
   git tag desktop-v0.2.0
   git push origin desktop-v0.2.0
   ```
3. CI 自动跑：装依赖 → typecheck → 测试（server 套件允许已知的 5 个失败,见下方
   "已知失败清单"，出现新的失败会直接 fail）→ 强制重建原生模块 → 打 web/desktop
   → ad-hoc 重签名 → 生成签名过的 appcast.xml + delta → 开一个**草稿** Release。
4. 去 `https://github.com/Innei/trade-skills/releases` 看那个草稿：
   - 下载 dmg 装一遍,确认能打开（不是"应用已损坏"提示）。
   - 检查 Release 里的 assets：`.dmg`、`.zip`、`appcast.xml`、（如果有上一个版本）
     `.delta`。
5. 没问题的话手动点"Publish release"。**这一步永远是人工确认,CI 不会替你点。**
   一旦发布,`https://github.com/Innei/trade-skills/releases/latest/download/appcast.xml`
   这个固定地址就会指向这次的 appcast,所有装了旧版的用户会在下次检查更新时看到。

### 首次发布（还没有任何 Release）

第一次跑这条流水线时,仓库里还没有任何已发布的 Release,CI 会检测到"没有上一个
版本",直接生成一份不带 delta 的全新 appcast.xml——这是预期行为,不是 bug。第二
次发布起才会开始出现 delta（增量更新包,用户不用重新下载完整 200MB+ 的 app,只需
下载几十 KB 到几 MB 的差分包)。

## 三、本地 dry-run（验证流水线本身有没有问题)

`app/desktop/scripts/release-dry-run.sh` 会在本地完整跑一遍"打包 → 签名 → 生成
appcast → 校验"的链路,用的是一次性生成、跑完即删的临时密钥对,不碰真实 secret,
不推 tag,不建真实 Release。改了 workflow 逻辑之后,想验证有没有搞坏,先跑这个：

```bash
./app/desktop/scripts/release-dry-run.sh
```

`KEEP_WORK_DIR=1 ./app/desktop/scripts/release-dry-run.sh` 会保留临时目录方便
事后翻看产物（appcast.xml、delta 文件等），默认跑完会自动清掉。

## 四、已知失败清单（server 测试门禁）

`app/server` 测试套件里有 5 个测试是已知失败（跟这次发布流水线的改动无关，是既
有 bug）,CI 的 `.github/scripts/assert-known-test-failures.mjs` 只允许这 5 个
在允许名单里失败,出现名单之外的新失败会让 CI 直接 fail：

- `GET /:id/built clamps count to 1000`
- `subscribeChart candlestick-push wiring` 下面 4 条（都跟去抖动重建的时序有关)

这份清单需要跟着代码走——真的修好了某个已知失败,记得把它从
`assert-known-test-failures.mjs` 的 `KNOWN_FAILURES` 里删掉,不然清单会越攒越
不准。

## 五、已知缺口(交接给后续任务)

- **dmg 里的 app 签名目前是坏的。** `electron-builder.yml` 设了 `identity: null`
  （没有付费开发者证书),打包出来的 `.app` 会带着 Electron 自带的 ad-hoc 签名,
  但 electron-builder 往里塞 `extraResources`/`asarUnpack` 之后,这个签名的
  CodeDirectory 就跟实际内容对不上了（`codesign --verify --deep --strict` 会报
  错)。CI 和本地 dry-run 都会在打包后把 **zip 里的 app** 重新 ad-hoc 签一遍（不
  需要付费证书,`codesign --sign -`)再用 `ditto` 重新打包,这一步是 Sparkle 的
  `generate_appcast` 工具硬性要求的——它拒绝处理签名校验不过的 app。**但 dmg 里
  的 app 没有做这个重签**,直接从 electron-builder 拿到的原始产物上传,用户如果
  绕过 Sparkle 直接双击 dmg 里的 app 运行,大概率会看到"应用已损坏"的 Gatekeeper
  提示。正确修法是给 `electron-builder.yml` 加一个 `afterPack` 钩子,在 dmg 和
  zip 两个 target 都还没打包之前,对刚组装好的 `.app` 做一次 ad-hoc 签名——这样
  两个产物天然都是对的,不用事后各自补签。这个改动属于 `electron-builder.yml`
  的维护范围,不在这次 CI 任务里做（也不确定和 Sparkle bridge 那边的 `extraFiles`
  /`extendInfo` 改动会不会冲突,交给管这份配置的人接手比较稳)。
- **`pnpm` 版本目前是在 workflow 里硬编码的**（`pnpm/action-setup@v4` 的
  `version: "11.10.0"`),因为根 `package.json` 没有 `packageManager` 字段可供
  自动探测。以后升级本地 pnpm 记得同步改 workflow,或者干脆给根 `package.json`
  加上 `packageManager` 字段让 corepack 接管,workflow 就不用再硬编码了。
