# @kansoku/license-worker

Cloudflare Worker，全代理客户端到 Dodo 的三个 license 端点（`/activate` `/validate` `/deactivate`），验证通过时下发解密 `pro.enc` 用的 `bundleKey` / `keyId`。设计见仓库根 `.superpowers/sdd/spec.md`「Cloudflare Worker（全代理）」一节。

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

1. **写入 secret**（一次性；`production` 环境需要 `--env production`）：
   ```bash
   cd apps/license-worker
   wrangler secret put BUNDLE_KEY --env production      # 64 位 hex，和打包时用的 KANSOKU_BUNDLE_KEY 是同一把 key
   wrangler secret put BUNDLE_KEY_ID --env production   # 和打包时的 KANSOKU_BUNDLE_KEY_ID 一致
   ```
   **默认（test）环境绝不能写入真 key。** test 环境转发到 `test.dodopayments.com`，任何人用公开测试卡 4242 都能在测试付款页买到一个能通过验证的 license；如果 test worker 发的是真 key，就等于免费解密 `pro.enc`。确实要部署 test worker 联调时，给它单独生成一把随机 key，配一个只在本地打包时用的 `pro.enc`。
   `DODO_BASE_URL` 不是 secret，已写在 `wrangler.jsonc` 的 `vars` / `env.production.vars` 里，不需要额外配置。
2. **部署**：
   ```bash
   pnpm exec wrangler deploy --env production                 # 生产环境（live.dodopayments.com）
   ```
   默认环境（test.dodopayments.com）平时不部署，只用 `pnpm --filter @kansoku/license-worker dev` 在本地跑。
3. **绑定自定义域名**：客户端默认指向 `https://kansoku-portal.innei.dev`（`packages/core/src/license/dodoClient.ts` 的 `DEFAULT_LICENSE_API_URL`；开发态可用 `KANSOKU_LICENSE_API_URL` 覆盖，打包版忽略这个变量）。在 Cloudflare Dashboard 的 Worker 设置里给 `kansoku-license-worker`（生产环境）加一条 Custom Domain 指向 `kansoku-portal.innei.dev`，或者在 `wrangler.jsonc` 的 `env.production` 下加 `routes`/`custom_domain` 配置后重新 `deploy`。domain 生效前，客户端会打到 Worker 默认的 `*.workers.dev` 地址（`deploy` 命令输出里能看到），可以先拿它联调。
4. **key 泄漏后的换 key 流程**：生成新的 `BUNDLE_KEY` + 新的 `BUNDLE_KEY_ID`，`wrangler secret put` 覆盖两者并重新 `deploy`；下一次发版打包时用同一对新值（见 `apps/pro` README「发版：KANSOKU_BUNDLE_KEY 来源与 keyId 轮换」）。旧 key 加密的旧安装包会在这一刻起拿不到 key（`validate`/`activate` 返回的是新 key），相当于强制所有旧包升级。
