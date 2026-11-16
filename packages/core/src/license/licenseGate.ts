import type { LicenseSnapshot } from './licenseState.js';
import { ClientError } from '../platform/errors.js';
import { getLicenseManager } from './licenseState.js';
import { electronIsPackaged, isDevEnvOverrideAllowed } from './hostPackaging.js';

export function isLicenseBypassActive(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged: boolean | null = electronIsPackaged,
): boolean {
  if (env.KANSOKU_LICENSE_BYPASS !== '1') return false;
  return isDevEnvOverrideAllowed(env, isPackaged);
}

// Same gating logic as the license bypass: KANSOKU_BUNDLE_KEY is a dev/pack
// escape hatch for decrypting pro.enc. A packaged build must never honor it —
// otherwise one leaked bundle key downgrades every paid install to "set an
// env var", no license check involved.
export function isBundleKeyEnvAllowed(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged: boolean | null = electronIsPackaged,
): boolean {
  return isDevEnvOverrideAllowed(env, isPackaged);
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
