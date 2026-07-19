import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProModule } from '@kansoku/pro-api';
import { getActiveBundleKey } from '../license/licenseState.js';
import { loadEncryptedModule } from './encLoader.js';
import { registerProModule, setEncBundlePresent } from './registry.js';

// Relative filesystem path to the gitignored slot rather than a bare package
// specifier: nothing declares @kansoku/pro as a dependency (public code must
// not), so pnpm never links it into node_modules and a bare import would not
// resolve. Built from variables so bundlers cannot statically resolve it;
// when apps/pro is absent the import throws and we fall back to free mode.
//
// The default (no `appDir`) resolves relative to this module's own URL, which
// only lines up with the real apps/pro/src/index.js when this file still runs
// from its source location (true for the server host, which runs TS directly
// via vite-node). Once a host bundles this module into a single file at a
// different directory depth (the Electron main process, via tsdown), that
// relative arithmetic breaks — such hosts must pass their own app root as
// `appDir` (e.g. Electron's `app.getAppPath()`) instead.
function proEntryUrl(appDir?: string, entryFile = 'src/index.js'): string {
  if (isAbsolute(entryFile)) {
    return pathToFileURL(entryFile).href;
  }
  if (appDir) {
    return pathToFileURL([appDir, '..', 'pro', entryFile].join('/')).href;
  }
  return ['..', '..', '..', '..', 'apps', 'pro', entryFile].join('/');
}

// Node's ERR_MODULE_NOT_FOUND message is "Cannot find module '<missing>' imported
// from <importer>" — the quoted path is what actually failed to resolve. Only
// treat this as "pro slot absent" when that path is the entry itself; if pro/src
// exists but one of its own imports fails to resolve, the quoted path names that
// inner module instead, and this must surface as a real error, not silent absence.
function isProEntryNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') return false;
  const missing = /Cannot find module '([^']+)'/.exec(error.message)?.[1];
  return missing !== undefined && /\/pro\/(src|dist)\/index\.m?[jt]s$/.test(missing);
}

// Packaged desktop stages pro.enc at <appDir>/pro/pro.enc (see
// desktop/scripts/stagePro.mjs); the virtual root sits beside it under the same
// real <appDir>/pro directory so bare deps resolve through the real
// node_modules. Source hosts (no appDir) never carry an enc payload.
function proEncLayout(appDir?: string): { encPath: string; virtualDir: string } | undefined {
  if (!appDir) return undefined;
  return { encPath: join(appDir, 'pro', 'pro.enc'), virtualDir: join(appDir, 'pro', '__enc__') };
}

export async function loadPro(appDir?: string, entryFile?: string): Promise<boolean> {
  const enc = proEncLayout(appDir);
  const encPresent = enc != null && existsSync(enc.encPath);
  setEncBundlePresent(encPresent);
  if (enc && encPresent) {
    const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY;
    if (keyHex) {
      try {
        const { namespace } = await loadEncryptedModule({
          encPath: enc.encPath,
          keyHex,
          virtualDir: enc.virtualDir,
        });
        const proModule = (namespace.default ?? namespace) as ProModule;
        registerProModule(proModule);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`pro slot: encrypted pro failed to load, running in free mode: ${message}`);
        return false;
      }
    }
    console.info('pro slot: encrypted pro present but no bundle key, running in free mode');
  }

  const entryUrl = proEntryUrl(appDir, entryFile);
  try {
    const mod = (await import(entryUrl)) as { default?: ProModule } & Partial<ProModule>;
    const proModule = mod.default ?? (mod as ProModule);
    registerProModule(proModule);
    return true;
  } catch (error) {
    if (isProEntryNotFound(error)) {
      console.info('pro slot: @kansoku/pro not found, running in free mode');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`pro slot: @kansoku/pro failed to load, running in free mode: ${message}`);
    }
    return false;
  }
}
