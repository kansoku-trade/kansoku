"use strict";

const { execFileSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const path = require("node:path");

// electron-builder.yml sets identity: null (no paid Developer ID cert), so
// the only signature the packed app carries is Electron's own ad-hoc one on
// the main executable — and copying in extraResources/extraFiles/asarUnpack
// after that invalidates the bundle's CodeDirectory. This hook fires once,
// after all files are staged into appOutDir but before electron-builder
// packages the dmg and zip targets, so re-signing ad-hoc here (no cert
// needed) covers both artifacts from a single signed .app instead of each
// target needing its own post-hoc re-sign. Sparkle's generate_appcast
// refuses any archive whose .app doesn't pass `codesign --verify --deep
// --strict`, which is why this is load-bearing for the release pipeline.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find((entry) => entry.endsWith(".app"));
  if (!appName) {
    throw new Error(`afterPack: no .app bundle found in ${context.appOutDir}`);
  }
  const appPath = path.join(context.appOutDir, appName);

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
};
