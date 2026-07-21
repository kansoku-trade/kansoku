# @kansoku/license-worker

Cloudflare Worker，全代理客户端到 Dodo 的三个 license 端点（`/activate` `/validate` `/deactivate`），验证通过时下发解密 `pro.enc` 用的 `bundleKey` / `keyId`。设计见仓库根 `.superpowers/sdd/spec.md`「Cloudflare Worker（全代理）」一节。

## 设备绑定（device-bound bundleKey）

客户端激活时生成一对 ECDH P-256 设备密钥对，随请求上传 `device_public_key`（`activate` 和 `validate` 都会带）。Worker 转发给 Dodo 前会**剥掉**这个字段（Dodo 看不到它）；下发 `bundleKey` 时，如果请求带了合法的设备公钥，就用「临时 ECDH → HKDF-SHA256 → AES-256-GCM」把 key 包裹后再发（响应里多一个 `bundleKeyWrap: { alg, eph, iv }`，`bundleKey` 字段是密文）。客户端用设备私钥解包——私钥只存在本机 safeStorage 加密的 license 记录里，所以把记录/key 拷到别的机器上也解不开，分享 key 必须连设备私钥一起给。没带设备公钥的旧客户端走明文 `bundleKey` 老路径，保持兼容。两侧实现：`src/bundleKeyWrap.ts`（WebCrypto）与 `packages/core/src/license/bundleKeyWrap.ts`（node:crypto），靠同一个 alg 标识和 HKDF info 字符串保持字节兼容。

## 环境变量

- `DODO_BASE_URL`：转发目标（`wrangler.jsonc` 里 live/test 环境各配一份，非 secret）。
- `BUNDLE_KEY` / `BUNDLE_KEY_ID`：`wrangler secret put` 写入，绝不入 git、不出现在 `wrangler.jsonc`。

## 节流的局限

节流状态存在 Worker isolate 的内存里（`src/throttle.ts`），不是全局一致的计数——同一 license 的请求分散到不同 isolate（不同地区 PoP、isolate 重启后）各算各的，是 best-effort 的粗粒度防刷，不是精确的速率限制。真要精确节流需要 Durable Object 或 KV，目前认为没必要。

## 本地开发 / 部署

```bash
pnpm --filter @kansoku/license-worker dev      # wrangler dev
pnpm --filter @kansoku/license-worker deploy   # wrangler deploy
pnpm --filter @kansoku/license-worker test
```

## 首次部署步骤

1. **写入 secret**（一次性，两个环境各写一份；`production` 环境需要 `--env production`）：
   ```bash
   cd apps/license-worker
   wrangler secret put BUNDLE_KEY               # 64 位 hex，和打包时用的 KANSOKU_BUNDLE_KEY 是同一把 key
   wrangler secret put BUNDLE_KEY_ID             # 和打包时的 KANSOKU_BUNDLE_KEY_ID 一致
   wrangler secret put BUNDLE_KEY --env production
   wrangler secret put BUNDLE_KEY_ID --env production
   ```
   `DODO_BASE_URL` 不是 secret，已写在 `wrangler.jsonc` 的 `vars` / `env.production.vars` 里，不需要额外配置。
2. **部署**：
   ```bash
   pnpm --filter @kansoku/license-worker deploy               # 默认环境（test.dodopayments.com）
   pnpm exec wrangler deploy --env production                 # 生产环境（live.dodopayments.com）
   ```
3. **绑定自定义域名**：客户端默认指向 `https://kansoku-portal.innei.dev`（`packages/core/src/license/dodoClient.ts` 的 `DEFAULT_LICENSE_API_URL`，可用 `KANSOKU_LICENSE_API_URL` 覆盖）。在 Cloudflare Dashboard 的 Worker 设置里给 `kansoku-license-worker`（生产环境）加一条 Custom Domain 指向 `kansoku-portal.innei.dev`，或者在 `wrangler.jsonc` 的 `env.production` 下加 `routes`/`custom_domain` 配置后重新 `deploy`。domain 生效前，客户端会打到 Worker 默认的 `*.workers.dev` 地址（`deploy` 命令输出里能看到），可以先拿它联调。
4. **key 轮换**：分两种——
   - **每版自动轮换（默认）**：`desktop-release` workflow 在打包前跑 `scripts/rotateBundleKey.mjs --key-id <release-tag>` 生成新 key（只生成不推送），打包成功后、发布前再 `--push` 把新 `BUNDLE_KEY` + `BUNDLE_KEY_ID` `wrangler secret put` 到 Worker。需要 repo secret `CLOUDFLARE_API_TOKEN`（对本 Worker 有 Workers Scripts 编辑权限）；未配置时回退到静态 `KANSOKU_BUNDLE_KEY` / `KANSOKU_BUNDLE_KEY_ID` repo secrets（老行为，不轮换）。推送故意放在打包成功后：构建失败时 Worker 继续发旧 key，已安装的旧包不受影响。
   - **泄漏后的手动换 key**：生成新的 `BUNDLE_KEY` + 新的 `BUNDLE_KEY_ID`，`wrangler secret put` 覆盖两者；下一次发版用同一对新值打包。旧 key 加密的旧安装包从这一刻起拿不到能用的 key（`validate`/`activate` 返回的是新 key，客户端 keyId 校验也会让旧 bundle 停在免费模式），相当于强制所有旧包升级。
