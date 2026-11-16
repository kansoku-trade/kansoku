// electron-only signal: core must stay importable from the Tsuki server host
// (plain node, no electron), so this is detected lazily and degrades to null
// there. The module id is read from a variable (not a string literal) so tsc
// does not try to resolve electron's type declarations — core has no
// dependency on @types/electron.
const ELECTRON_MODULE_ID = 'electron';
let detected: boolean | null = null;
try {
  const electron = (await import(ELECTRON_MODULE_ID)) as { app?: { isPackaged?: boolean } };
  detected = electron.app?.isPackaged ?? null;
} catch {
  detected = null;
}

export const electronIsPackaged: boolean | null = detected;

// NODE_ENV is unset in a packaged Electron build, so it cannot gate dev
// escape hatches there — app.isPackaged is the only reliable signal in that
// host. Outside Electron (the Tsuki server host has no such signal at all),
// fall back to NODE_ENV!=="production".
export function isDevEnvOverrideAllowed(
  env: NodeJS.ProcessEnv = process.env,
  isPackaged: boolean | null = electronIsPackaged,
): boolean {
  if (isPackaged === true) return false;
  if (isPackaged === null && env.NODE_ENV === 'production') return false;
  return true;
}
