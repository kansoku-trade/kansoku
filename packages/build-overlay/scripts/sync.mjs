#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOverlaySync } from './overlaySync.mjs';

const { join } = path;

const checkOnly = process.argv.includes('--check');
const publicRoot = fileURLToPath(new URL('../../..', import.meta.url));
const overlayRoot = join(publicRoot, 'apps', 'pro', 'overlays');
const manifestPath = join(publicRoot, 'apps', 'pro', 'overlay.private-only.json');
const statePath = join(publicRoot, '.kansoku-overlay-links.json');

if (!existsSync(overlayRoot)) {
  console.log('overlay sync: apps/pro/overlays absent; OSS workspace unchanged');
  process.exit(0);
}

const { errors, summary } = runOverlaySync({
  publicRoot,
  overlayRoot,
  manifestPath,
  statePath,
  checkOnly,
});

if (errors.length > 0) {
  for (const error of errors) console.error(`overlay sync: ${error}`);
  process.exit(1);
}

const mode = checkOnly ? 'check' : 'sync';
for (const line of summary) console.log(`overlay ${mode}: ${line}`);
console.log(`overlay ${mode}: ${summary.length} projection(s) valid`);
