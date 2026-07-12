"use strict";

const { unlinkSync } = require("node:fs");

// Updates ship via Sparkle appcast deltas, not electron-updater differential
// downloads, so blockmaps are dead weight. dmg's is disabled via
// dmg.writeUpdateInfo in electron-builder.yml, but the mac zip blockmap is
// hardcoded on (macPackager createTargets passes isWriteUpdateInfo=true with
// no config knob) — deleting it here is the only way off.
module.exports = async function afterAllArtifactBuild(result) {
  for (const artifact of result.artifactPaths.filter((p) => p.endsWith(".blockmap"))) {
    unlinkSync(artifact);
  }
  return [];
};
