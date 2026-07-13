import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(desktopDir, "dist-main");
const entries = await readdir(distDir);

let runtimeChunk;
for (const entry of entries) {
  if (!entry.endsWith(".mjs")) continue;
  const filePath = join(distDir, entry);
  const source = await readFile(filePath, "utf8");
  if (source.includes("function initModelsRuntime(")) {
    runtimeChunk = filePath;
    break;
  }
}

if (!runtimeChunk) {
  throw new Error("桌面构建产物中找不到 modelsRuntime");
}

const runtimeModule = await import(pathToFileURL(runtimeChunk).href);
const initModelsRuntime = Object.values(runtimeModule).find(
  (value) => typeof value === "function" && value.name === "initModelsRuntime",
);

if (typeof initModelsRuntime !== "function") {
  throw new Error("桌面构建产物没有导出 initModelsRuntime");
}

const accessToken = "bundled-codex-auth-smoke-token";
const credentials = {
  async read(provider) {
    if (provider !== "openai-codex") return undefined;
    return {
      type: "oauth",
      access: accessToken,
      refresh: "bundled-codex-auth-smoke-refresh",
      expires: Date.now() + 60_000,
    };
  },
  async modify() {
    return undefined;
  },
  async delete() {},
};

const models = initModelsRuntime(credentials);
const model = models.getModels("openai-codex")[0];
if (!model) {
  throw new Error("桌面构建产物中没有 OpenAI Codex 模型");
}

const auth = await models.getAuth(model);
if (auth?.auth.apiKey !== accessToken) {
  throw new Error("桌面构建产物无法从 Codex OAuth 凭据生成请求认证");
}

console.log("桌面构建产物的 Codex OAuth 验证通过");
