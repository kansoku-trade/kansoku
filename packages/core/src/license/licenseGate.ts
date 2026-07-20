import type { LicenseSnapshot } from './licenseState.js';
import { ClientError } from '../platform/errors.js';
import { getLicenseManager } from './licenseState.js';

// electron-only signal: core must stay importable from the Tsuki server host
// (plain node, no electron), so this is detected lazily and degrades to null
// there. The module id is read from a variable (not a string literal) so tsc
// does not try to resolve electron's type declarations — core has no
// dependency on @types/electron.
const ELECTRON_MODULE_ID = 'electron';
let electronIsPackaged: boolean | null = null;
try {
  const electron = (await import(ELECTRON_MODULE_ID)) as { app?: { isPackaged?: boolean } };
  electronIsPackaged = electron.app?.isPackaged ?? null;
} catch {
  electronIsPackaged = null;
}

// NODE_ENV is unset in a packaged Electron build, so it cannot gate the
// bypass there — app.isPackaged is the only reliable signal in that host.
// Outside Electron (the Tsuki server host has no such signal at all), fall
// back to NODE_ENV!=="production".
export function isLicenseBypassActive(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged: boolean | null = electronIsPackaged,
): boolean {
  if (env.KANSOKU_LICENSE_BYPASS !== '1') return false;
  if (isPackaged === true) return false;
  if (isPackaged === null && env.NODE_ENV === 'production') return false;
  return true;
}

// Same gating logic as the license bypass: KANSOKU_BUNDLE_KEY is a dev/pack
// escape hatch for decrypting pro.enc. A packaged build must never honor it —
// otherwise one leaked bundle key downgrades every paid install to "set an
// env var", no license check involved.
export function isBundleKeyEnvAllowed(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged: boolean | null = electronIsPackaged,
): boolean {
  if (isPackaged === true) return false;
  if (isPackaged === null && env.NODE_ENV === 'production') return false;
  return true;
}

export function currentSnapshotSafe(): LicenseSnapshot {
  try {
    return getLicenseManager().getLicenseSnapshot();
  } catch {
    return { state: 'unlicensed' };
  }
}

let devUnlicensedOverride = false;

export function setDevUnlicensedOverride(value: boolean): void {
  if (electronIsPackaged === true) return;
  devUnlicensedOverride = value;
}

export function isDevUnlicensedOverride(): boolean {
  return devUnlicensedOverride;
}

export function isLicensed(): boolean {
  if (devUnlicensedOverride) return false;
  if (isLicenseBypassActive()) return true;
  const snapshot = currentSnapshotSafe();
  return snapshot.state === 'licensed' || snapshot.state === 'grace';
}

export function requireLicensed(): void {
  if (isLicensed()) return;
  throw new ClientError(
    'AI features require an active license',
    undefined,
    403,
    'LICENSE_REQUIRED',
  );
}
