import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 每次发版轮换 bundle key,两种用法(desktop-release workflow 里成对出现):
//
//   生成(打包前): node scripts/rotateBundleKey.mjs --key-id desktop-vX.Y.Z
//     只生成 key + keyId 并打印 key=/keyId= 两行,不碰 Worker —— 打包
//     (packEnc)用这把 key 加密 pro.enc。
//   推送(打包成功后、发布前): KANSOKU_BUNDLE_KEY=.. node scripts/rotateBundleKey.mjs --push
//     key 从环境变量 KANSOKU_BUNDLE_KEY / KANSOKU_BUNDLE_KEY_ID 读(--key-id
//     可覆盖后者),wrangler secret put 到 license Worker。故意不在打包前推:
//     构建失败时 Worker 还在发旧 key,已安装的旧包不受影响;推送失败则
//     workflow 在发布前挂掉,不会发出一把 Worker 不认识的 key。
//
// 推送需要 CLOUDFLARE_API_TOKEN(对 kansoku-license-worker 有 Workers
// Scripts 编辑权限)。旧安装包在下一次 revalidate 领到新 key,配合客户端的
// keyId 校验,等于强制旧包升级;某版 key 泄漏的影响限于那一版。

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const workerDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workerEnv = argValue("--env") ?? "production";
const push = process.argv.includes("--push");
const key = process.env.KANSOKU_BUNDLE_KEY ?? randomBytes(32).toString("hex");
const keyId = argValue("--key-id") ?? process.env.KANSOKU_BUNDLE_KEY_ID;

if (!keyId) {
  console.error("rotateBundleKey: --key-id <id> is required (release workflow 传 desktop-vX.Y.Z)");
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(key)) {
  console.error("rotateBundleKey: key must be a 64-character hex string (32 bytes)");
  process.exit(1);
}

if (push) {
  if (!process.env.KANSOKU_BUNDLE_KEY) {
    console.error("rotateBundleKey: --push 模式需要 KANSOKU_BUNDLE_KEY 环境变量(避免 key 落在命令行参数里)");
    process.exit(1);
  }
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error("rotateBundleKey: CLOUDFLARE_API_TOKEN 未设置,无法 wrangler secret put");
    process.exit(1);
  }
  for (const [name, value] of [
    ["BUNDLE_KEY", key],
    ["BUNDLE_KEY_ID", keyId],
  ]) {
    // wrangler 从 stdin 读 secret 值,不回显;key 不落在命令行参数里
    execFileSync("pnpm", ["exec", "wrangler", "secret", "put", name, "--env", workerEnv], {
      cwd: workerDir,
      input: `${value}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }
  console.error(`rotateBundleKey: 已推送 BUNDLE_KEY + BUNDLE_KEY_ID=${keyId} 到 ${workerEnv} 环境`);
}

console.log(`key=${key}`);
console.log(`keyId=${keyId}`);
