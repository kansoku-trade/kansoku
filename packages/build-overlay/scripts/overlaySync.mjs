import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const { dirname, isAbsolute, join, relative, resolve, sep } = path;

const overlayPattern = /\.pro\.(?:[cm]?ts|tsx)$/;

function within(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function pathExists(target) {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) walk(entryPath, files);
    else if (entry.isFile() && overlayPattern.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function linkTarget(target) {
  return resolve(dirname(target), readlinkSync(target));
}

export function runOverlaySync(options) {
  const { publicRoot, overlayRoot, manifestPath, statePath, checkOnly = false } = options;
  const errors = [];
  const proRoot = join(publicRoot, 'apps', 'pro');
  const manifestRelative = relative(publicRoot, manifestPath);

  function readState() {
    if (!existsSync(statePath)) return [];
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      return Array.isArray(state.links) ? state.links : [];
    } catch (error) {
      throw new Error(`invalid overlay state ${statePath}: ${error.message}`, { cause: error });
    }
  }

  function readPrivateOnlyManifest() {
    if (!existsSync(manifestPath)) return [];
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(`invalid private-only manifest ${manifestRelative}: ${error.message}`);
      return [];
    }
    if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
      errors.push(`private-only manifest ${manifestRelative} must have a "files" array`);
      return [];
    }
    return manifest.files;
  }

  const overlayFiles = existsSync(overlayRoot) ? walk(overlayRoot) : [];

  const mappings = overlayFiles
    .map((source) => {
      const sourceRelative = relative(overlayRoot, source);
      const destination = resolve(publicRoot, sourceRelative);
      if (!within(publicRoot, destination) || within(proRoot, destination)) {
        errors.push(`unsafe overlay destination: ${sourceRelative}`);
        return null;
      }
      const base = destination.replace(/\.pro(\.(?:[cm]?ts|tsx))$/, '$1');
      return { destination, hasBase: existsSync(base), source, sourceRelative };
    })
    .filter((mapping) => mapping !== null);

  const overlayRelativePaths = new Set(
    mappings.map(({ sourceRelative }) => sourceRelative.split(sep).join('/')),
  );
  const privateOnlyFiles = readPrivateOnlyManifest();
  const privateOnlySet = new Set(privateOnlyFiles);

  for (const mapping of mappings) {
    const relPath = mapping.sourceRelative.split(sep).join('/');
    const isPrivateOnly = privateOnlySet.has(relPath);
    if (!mapping.hasBase && !isPrivateOnly) {
      errors.push(`overlay has no OSS base and is not registered in ${manifestRelative}: ${relPath}`);
    }
    if (mapping.hasBase && isPrivateOnly) {
      errors.push(
        `overlay is registered as private-only in ${manifestRelative} but has an OSS base: ${relPath}`,
      );
    }
  }

  for (const entry of new Set(privateOnlyFiles)) {
    if (!overlayRelativePaths.has(entry)) {
      errors.push(`private-only manifest ${manifestRelative} has a stale entry: ${entry}`);
    }
  }

  if (errors.length > 0) {
    return { errors, mappings, summary: [] };
  }

  const currentDestinations = new Set(mappings.map(({ destination }) => destination));
  for (const old of readState()) {
    const destination = resolve(publicRoot, old.destination);
    if (!within(publicRoot, destination) || within(proRoot, destination)) {
      errors.push(`unsafe destination in overlay state: ${old.destination}`);
      continue;
    }
    if (currentDestinations.has(destination) || !pathExists(destination)) continue;
    const stat = lstatSync(destination);
    if (!stat.isSymbolicLink() || !within(overlayRoot, linkTarget(destination))) {
      errors.push(`refusing to remove unmanaged path: ${old.destination}`);
      continue;
    }
    if (checkOnly) errors.push(`stale overlay projection: ${old.destination}`);
    else unlinkSync(destination);
  }

  if (!checkOnly && errors.length > 0) {
    return { errors, mappings, summary: [] };
  }

  for (const { destination, source } of mappings) {
    const destinationRelative = relative(publicRoot, destination);
    if (pathExists(destination)) {
      const stat = lstatSync(destination);
      if (!stat.isSymbolicLink()) {
        errors.push(`overlay destination is not a symlink: ${destinationRelative}`);
        continue;
      }
      if (linkTarget(destination) === source) continue;
      if (checkOnly) {
        errors.push(`overlay projection points to the wrong source: ${destinationRelative}`);
        continue;
      }
      if (!within(overlayRoot, linkTarget(destination))) {
        errors.push(`refusing to repair unmanaged projection: ${destinationRelative}`);
        continue;
      }
      unlinkSync(destination);
    } else if (checkOnly) {
      errors.push(`missing overlay projection: ${destinationRelative}`);
      continue;
    }

    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(relative(dirname(destination), source), destination);
  }

  if (errors.length > 0) {
    return { errors, mappings, summary: [] };
  }

  if (!checkOnly) {
    const state = {
      links: mappings.map(({ destination, sourceRelative }) => ({
        destination: relative(publicRoot, destination),
        source: sourceRelative,
      })),
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  const summary = mappings.map(
    ({ destination, source }) =>
      `${relative(publicRoot, source)} -> ${relative(publicRoot, destination)}`,
  );

  return { errors, mappings, summary };
}
