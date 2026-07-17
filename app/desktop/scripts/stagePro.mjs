import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const proDir = join(desktopDir, "..", "pro");
const destDir = join(desktopDir, "pro");

rmSync(destDir, { recursive: true, force: true });

if (!existsSync(join(proDir, "package.json"))) {
  console.log("stagePro: app/pro absent — packaging the free build");
  process.exit(0);
}

const build = spawnSync("pnpm", ["--filter", "@kansoku/pro", "build"], {
  cwd: join(desktopDir, ".."),
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Staged under desktop/ so electron-builder's `files` puts it INSIDE app.asar.
// extraResources would land it outside the asar, where pro's external bare
// imports (@tsuki-hono/*) could not resolve into app.asar/node_modules and
// would therefore load a second module instance — which breaks Tsuki's
// symbol-keyed decorator metadata and silently maps zero pro routes.
cpSync(join(proDir, "dist"), join(destDir, "dist"), { recursive: true });
console.log("stagePro: staged pro/dist into the asar payload");
