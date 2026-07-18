"use strict";

const { unlinkSync } = require("node:fs");

// Belt-and-braces: dmg/zip writeUpdateInfo:false (zip via app-builder-lib patch)
// already skips generation. Delete any leftover .blockmap if a future
// electron-builder upgrade ignores the knob.
module.exports = async function afterAllArtifactBuild(result) {
  for (const artifact of result.artifactPaths.filter((p) => p.endsWith(".blockmap"))) {
    unlinkSync(artifact);
  }
  return [];
};
