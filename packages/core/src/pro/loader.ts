import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getActiveBundleKey } from '../license/licenseState.js';
import { setEncBundlePresent } from './bundleState.js';
import { decryptProBlob, registerVirtualModules } from './encLoader.js';

export interface ProPayload {
  webFiles: Map<string, Buffer>;
}

const NODE_PREFIX = 'node/';
const WEB_PREFIX = 'web/';

export async function loadPro(appDir?: string): Promise<ProPayload | null> {
  if (!appDir) {
    setEncBundlePresent(false);
    return null;
  }
  const encPath = join(appDir, 'pro', 'pro.enc');
  const present = existsSync(encPath);
  setEncBundlePresent(present);
  if (!present) return null;

  const keyHex = getActiveBundleKey() ?? process.env.KANSOKU_BUNDLE_KEY;
  if (!keyHex) {
    console.info('pro slot: encrypted bundle present but no key, running free');
    return null;
  }

  try {
    const manifest = decryptProBlob(readFileSync(encPath), keyHex);
    const nodeFiles = new Map<string, string>();
    const webFiles = new Map<string, Buffer>();
    for (const [rel, base64] of Object.entries(manifest.files)) {
      const buffer = Buffer.from(base64, 'base64');
      if (rel.startsWith(NODE_PREFIX)) {
        // Virtual path is the plaintext chunk's ORIGINAL location, so its
        // relative imports of shared chunks land on the real dist files.
        nodeFiles.set(
          join(appDir, 'dist-main', '__pro__', rel.slice(NODE_PREFIX.length)),
          buffer.toString('utf8'),
        );
      } else if (rel.startsWith(WEB_PREFIX)) {
        webFiles.set(rel.slice(WEB_PREFIX.length), buffer);
      }
    }
    registerVirtualModules(nodeFiles);
    return { webFiles };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`pro slot: bundle failed to load, running free: ${message}`);
    return null;
  }
}
