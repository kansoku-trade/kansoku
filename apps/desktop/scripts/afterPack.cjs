'use strict';

const { execFileSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} = require('node:fs');
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

  const asarEntries = listPackage(asarPath);
  if (
    process.env.KANSOKU_LOCAL_TEST_BUILD !== '1' &&
    asarEntries.some((entry) => entry.endsWith('bundle-key.local'))
  ) {
    throw new Error('pro/bundle-key.local found in app.asar — a local test key must never ship');
  }

  const asarLeaks = asarEntries.filter(containsProSegment);
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

// The npm tarball flattens Sparkle.framework's symlinks into real copies, so
// codesign --deep rejects it as "bundle format is ambiguous". Rebuild the
// canonical Versions/Current layout before anything signs it.
function restoreFrameworkSymlinks(frameworkDir) {
  const versionsDir = join(frameworkDir, 'Versions');
  const currentDir = join(versionsDir, 'Current');
  if (!existsSync(currentDir) || lstatSync(currentDir).isSymbolicLink()) return;
  const version = readdirSync(versionsDir).find((name) => name !== 'Current');
  if (!version) return;
  rmSync(currentDir, { recursive: true, force: true });
  symlinkSync(version, currentDir);
  for (const entry of readdirSync(join(versionsDir, version))) {
    if (entry === '_CodeSignature') continue;
    const top = join(frameworkDir, entry);
    rmSync(top, { recursive: true, force: true });
    symlinkSync(join('Versions', 'Current', entry), top);
  }
}

module.exports = async function afterPack(context) {
  verifyNoPlaintextPro(context);
  restoreFrameworkSymlinks(
    join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Frameworks',
      'Sparkle.framework',
    ),
  );
  const identity = context.packager.platformSpecificBuildOptions.identity;
  const signingRequested =
    identity !== null &&
    (Boolean(process.env.CSC_LINK) || (typeof identity === 'string' && identity.length > 0));
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const proNative = join(
    appPath,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'pro',
    'kansoku_icloud.node',
  );
  if (process.env.KANSOKU_PROVISIONING_PROFILE) {
    copyFileSync(
      process.env.KANSOKU_PROVISIONING_PROFILE,
      join(appPath, 'Contents', 'embedded.provisionprofile'),
    );
  } else if (existsSync(proNative) && signingRequested) {
    throw new Error(
      'signed Pro build requires KANSOKU_PROVISIONING_PROFILE with iCloud + CloudKit entitlements',
    );
  }
  // CI supplies CSC_LINK; local verification can name a Keychain identity.
  // In both cases electron-builder signs after this hook, so don't ad-hoc sign first.
  if (signingRequested) return;
  const localIdentity = process.env.KANSOKU_LOCAL_SIGN_IDENTITY;
  if (localIdentity) {
    const buildDir = join(process.cwd(), 'build');
    const sign = (entitlements, ...extra) =>
      execFileSync(
        'codesign',
        [
          '--force',
          ...extra,
          '--sign',
          localIdentity,
          '--options',
          'runtime',
          '--entitlements',
          entitlements,
          appPath,
        ],
        { stdio: 'inherit' },
      );
    // Restricted iCloud entitlements only belong on the outer bundle; a helper
    // carrying them without a profile is killed by AMFI on launch.
    sign(join(buildDir, 'entitlements.mac.inherit.plist'), '--deep');
    sign(join(buildDir, 'entitlements.mac.plist'));
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
    return;
  }
  const { adHocSignAfterPack } = await import('electron-sparkle-updater/builder');
  return adHocSignAfterPack(context);
};
