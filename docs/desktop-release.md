# 桌面版发布流程（Sparkle 自动更新）

Kansoku 桌面版走 Sparkle 2 做自动更新。发布靠 `.github/workflows/desktop-release.yml`：打
`desktop-vX.Y.Z` 标签会触发 CI 打包 dmg/zip，签名、appcast 生成、增量包 delta 计算和
最终发布这几步，都委托给开源库 [`electron-sparkle-updater`](https://github.com/Innei/electron-sparkle-updater)
的 composite Action（`Innei/electron-sparkle-updater/action@v1`）来做，本仓库的
workflow 里只保留一步调用。CI 跑完就是**正式发布**（没有草稿确认环节）——appcast 一旦
上传，装了旧版的用户下次检查更新就会看到；打 tag 前务必确认改动和版本号都对。

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

1. **仓库 secret** `SPARKLE_ED_PUBLIC_KEY`——CI 打包时会用
   `electron-sparkle-updater inject-public-key` 这个 CLI 命令把它写进
   `apps/desktop/electron-builder.yml` 的 `extendInfo.SUPublicEDKey` 占位符
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

1. 确认要发布的改动都在 `main` 上,且 `apps/desktop/package.json` 的 `version` 字段
   已经是这次要发的号（例如 `0.2.0`）。
2. 打 tag 并推送：
   ```bash
   git tag desktop-v0.2.0
   git push origin desktop-v0.2.0
   ```
3. CI 自动跑：装依赖 → typecheck → 测试（server 套件允许已知的 5 个失败,见下方
   "已知失败清单"，出现新的失败会直接 fail）→ 强制重建原生模块 → 打 web/desktop
   （electron-builder 的 `afterPack` 钩子在打包时就把 `.app` ad-hoc 签好,dmg 和
   zip 两个产物天然都带有效签名,CI 只做 `codesign --verify --deep --strict` 校验,
   不用再补签）→ 调用 `electron-sparkle-updater` 库的 composite Action：下载上
   一个版本的 appcast/zip 作为增量包 delta 基准 → 生成签名过的 appcast.xml + delta
   → 直接发布 GitHub Release（`publish: "true"`,没有草稿环节）。
4. 发布完去 `https://github.com/Innei/kansoku/releases` 确认一下:
   - 下载 dmg 装一遍,确认能打开（不是"应用已损坏"提示）。
   - 检查 Release 里的 assets：`.dmg`、`.zip`、`appcast.xml`、（如果有上一个版本）
     `.delta`。
   - 一发布,`https://github.com/Innei/kansoku/releases/latest/download/appcast.xml`
     这个固定地址就会指向这次的 appcast,所有装了旧版的用户会在下次检查更新时看到——
     **CI 跑完就是线上生效,打 tag 前务必确认没问题。**

### 首次发布（还没有任何 Release）

第一次跑这条流水线时,仓库里还没有任何已发布的 Release,CI 会检测到"没有上一个
版本",直接生成一份不带 delta 的全新 appcast.xml——这是预期行为,不是 bug。第二
次发布起才会开始出现 delta（增量更新包,用户不用重新下载完整 200MB+ 的 app,只需
下载几十 KB 到几 MB 的差分包)。

## 三、本地 dry-run（验证流水线本身有没有问题)

`apps/desktop/scripts/release-dry-run.sh` 会在本地完整跑一遍"打包 → 签名 → 生成
appcast → 校验"的链路,用的是一次性生成、跑完即删的临时密钥对,不碰真实 secret,
不推 tag,不建真实 Release。改了 workflow 逻辑之后,想验证有没有搞坏,先跑这个：

```bash
./apps/desktop/scripts/release-dry-run.sh
```

`KEEP_WORK_DIR=1 ./apps/desktop/scripts/release-dry-run.sh` 会保留临时目录方便
事后翻看产物（appcast.xml、delta 文件等），默认跑完会自动清掉。

## 四、已知失败清单（server 测试门禁）

`apps/server` 测试套件若有已知失败,CI 的
`.github/scripts/assert-known-test-failures.mjs` 只允许名单内失败；出现名单
之外的新失败会直接 fail。名单里的用例若已修好,也必须从 `KNOWN_FAILURES`
删掉,否则清单过时同样会 fail。

当前名单为空（无已知失败）。

## 五、SUFeedURL 的隐含约束(必读)

`electron-builder.yml` 里 `SUFeedURL` 指向的是
`https://github.com/Innei/kansoku/releases/latest/download/appcast.xml`——
这个 `releases/latest` 是 GitHub 在**整个仓库范围**内取"最近发布的、非草稿、非
预发布的 Release",跟 tag 前缀无关。也就是说：**如果 `Innei/trade-skills` 这个
仓库将来发了任何一个跟桌面版无关的 Release（哪怕只是给某个 skill 打个版本
tag),只要它比最新一次 `desktop-v*` Release 新,`releases/latest` 就会指向那个
无关的 Release,appcast.xml 请求就会 404,所有装了桌面版的用户都会拿不到更新
检查结果。** 目前的应对方式是纯约定 + 文档：这个仓库里发布 Release 时,不管是
不是桌面版,都要留意会不会踩到这条线;真出现非桌面 Release,必须在它之前或
同时补发一个新的 `desktop-v*` Release 把 `latest` 指针抢回来。CI 内部拉取 delta
基准包的 `gh release list/view` 调用已经过滤成只看 `desktop-v*` 前缀的 tag,不
受这个问题影响——受影响的只有客户端侧固定写死的 `SUFeedURL`。如果以后要根治,
思路是把 `SUFeedURL` 换成一个 CI 维护的固定 tag（例如 `desktop-appcast`,每次
发布后由 CI 把这个 tag 的 Release 更新指向最新 appcast),但那需要同步改
workflow、`electron-builder.yml` 的 `extendInfo.SUFeedURL`,以及 Sparkle 客户端
读取的地址三处,目前判断不算"顺手就能改",留给以后需要时再动。
