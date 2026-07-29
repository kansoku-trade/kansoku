'use strict';

const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const { listPackage } = require('@electron/asar');

// Second leak gate after vite.main.config.ts's / vite.config.ts's build-time
// chunk assertion (proLeakGuard). pro/src embeds this marker (see pro
// src/index.ts), pro.enc stores it only under AES-GCM + gzip, so the marker
// appearing anywhere in the raw asar bytes means plaintext pro code got
// packaged. Joined from parts so this script can never trip the scan on
// itself. Kept as a byte-level backstop alongside the structural scan below —
// the structural scan is what actually enumerates every packaged entry;
// this only proves the one module that carries the marker didn't leak.
const PRO_CANARY = ['KANSOKU', 'PRO', 'CANARY', '9d4f2b7e1c'].join('-');

// Both dist-main's chunks (asar-packaged) and apps/web's chunks (copied
// verbatim into Resources/web-dist by extraResources) route pro output
// through a directory segment carrying this name — see PRO_CHUNK_DIR in
// vite.main.config.ts and vite.config.ts. stagePro.mjs deletes both
// directories before packaging; this scan is what proves that actually held,
// across BOTH shipped locations, not just the one the byte-grep above covers.
const PRO_DIR_SEGMENT = '__pro__';

function containsProSegment(entryPath) {
  return entryPath.split(/[\\/]/).includes(PRO_DIR_SEGMENT);
}

function listDirRecursive(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? listDirRecursive(root, full) : [relative(root, full)];
  });
}

function verifyNoPlaintextPro(context) {
  const appResourcesDir = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
  const asarPath = join(appResourcesDir, 'app.asar');
  const webDistDir = join(appResourcesDir, 'web-dist');

  const asarLeaks = listPackage(asarPath).filter(containsProSegment);
  if (asarLeaks.length > 0) {
    throw new Error(
      `plaintext pro entries found in app.asar — leaked into the package:\n${asarLeaks
        .map((p) => `  - ${p}`)
        .join('\n')}`,
    );
  }

  if (existsSync(webDistDir)) {
    const webDistLeaks = listDirRecursive(webDistDir).filter(containsProSegment);
    if (webDistLeaks.length > 0) {
      throw new Error(
        `plaintext pro entries found in Resources/web-dist — leaked into the package:\n${webDistLeaks
          .map((p) => `  - ${p}`)
          .join('\n')}`,
      );
    }
  }

  if (readFileSync(asarPath).includes(PRO_CANARY)) {
    throw new Error('pro canary found in app.asar — plaintext pro code leaked into the package');
  }
}

const EXPECTED_BETTER_SQLITE3_FILES = ['build/Release/better_sqlite3.node'];

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
}

function verifyBetterSqlite3Payload(context) {
  const resourcesDir = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
  const unpackedModuleDir = join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
  );
  const files = listFiles(unpackedModuleDir).sort();

  if (files.join('\n') !== EXPECTED_BETTER_SQLITE3_FILES.join('\n')) {
    throw new Error(
      `Unexpected better-sqlite3 unpacked payload:\n${files.map((file) => `- ${file}`).join('\n')}`,
    );
  }

  const nativeBinary = join(unpackedModuleDir, EXPECTED_BETTER_SQLITE3_FILES[0]);
  if (statSync(nativeBinary).size === 0) {
    throw new Error('Packaged better_sqlite3.node is empty');
  }
}

module.exports = async function afterPack(context) {
  verifyBetterSqlite3Payload(context);
  verifyNoPlaintextPro(context);
  // CSC_LINK present + `identity: null` dropped from electron-builder.yml
  // (the CI signing step does both together) means electron-builder will
  // Developer-ID-sign right after this hook (notarization + stapling run as
  // explicit CI steps after packaging) — an ad-hoc --deep sign here would
  // only be thrown away by that re-sign. Both conditions are required: a
  // stray local CSC_LINK with identity still null must keep the ad-hoc path,
  // or the app ships with no signature at all.
  if (process.env.CSC_LINK && context.packager.platformSpecificBuildOptions.identity !== null) {
    return;
  }
  const { adHocSignAfterPack } = await import('electron-sparkle-updater/builder');
  return adHocSignAfterPack(context);
};
