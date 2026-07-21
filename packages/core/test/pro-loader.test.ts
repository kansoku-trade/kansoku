import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { setLicenseManagerForTests, type LicenseManager } from '../src/license/licenseState.js';
import { loadPro } from '../src/pro/loader.js';
import { hasEncBundle } from '../src/pro/bundleState.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  setLicenseManagerForTests(null);
  delete process.env.KANSOKU_BUNDLE_KEY;
  delete process.env.KANSOKU_BUNDLE_KEY_ID;
});

function stageAppDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'kansoku-loader-'));
  roots.push(root);
  mkdirSync(join(root, 'pro'), { recursive: true });
  return root;
}

const ENV_KEY_HEX = '00'.repeat(32);

function packEnc(keyId: string, keyHex: string): Buffer {
  const manifest = {
    keyId,
    files: { 'web/entry.mjs': Buffer.from('export const marker = 1;\n').toString('base64') },
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(manifest)));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([Buffer.from('KPRO1', 'utf8'), iv, cipher.getAuthTag(), ct]);
}

function fakeLicenseManager(keyHex: string, keyId?: string): LicenseManager {
  return {
    getLicenseSnapshot: () => ({ state: 'licensed' }),
    getBundleKey: () => keyHex,
    getBundleKeyId: () => keyId,
    activate: async () => ({ activated: true }),
    deactivate: async () => {},
    revalidate: async () => {},
  };
}

describe('loadPro', () => {
  it('returns null when pro.enc is absent', async () => {
    await expect(loadPro(stageAppDir())).resolves.toBeNull();
  });

  it('returns null when pro.enc is present but no key is available', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1'));
    await expect(loadPro(root)).resolves.toBeNull();
  });

  it('returns null on a tampered blob rather than throwing', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1garbage'));
    process.env.KANSOKU_BUNDLE_KEY = '00'.repeat(32);
    try {
      await expect(loadPro(root)).resolves.toBeNull();
    } finally {
      delete process.env.KANSOKU_BUNDLE_KEY;
    }
  });

  it('resets hasEncBundle to false when called without an appDir, even if a previous call left it true', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), Buffer.from('KPRO1'));
    await loadPro(root);
    expect(hasEncBundle()).toBe(true);

    await loadPro();
    expect(hasEncBundle()).toBe(false);
  });

  it('loads a bundle whose keyId matches KANSOKU_BUNDLE_KEY_ID', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc('key-1', ENV_KEY_HEX));
    process.env.KANSOKU_BUNDLE_KEY = ENV_KEY_HEX;
    process.env.KANSOKU_BUNDLE_KEY_ID = 'key-1';

    const payload = await loadPro(root);

    expect(payload?.webFiles.get('entry.mjs')?.toString('utf8')).toBe('export const marker = 1;\n');
  });

  it('runs free when the env keyId does not match the bundle keyId', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc('key-2', ENV_KEY_HEX));
    process.env.KANSOKU_BUNDLE_KEY = ENV_KEY_HEX;
    process.env.KANSOKU_BUNDLE_KEY_ID = 'key-1';

    await expect(loadPro(root)).resolves.toBeNull();
  });

  it('runs free when the license-record keyId does not match the bundle keyId', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc('key-2', ENV_KEY_HEX));
    setLicenseManagerForTests(fakeLicenseManager(ENV_KEY_HEX, 'key-1'));

    await expect(loadPro(root)).resolves.toBeNull();
  });

  it('loads via the license-record key when its keyId matches the bundle', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc('key-1', ENV_KEY_HEX));
    setLicenseManagerForTests(fakeLicenseManager(ENV_KEY_HEX, 'key-1'));

    const payload = await loadPro(root);

    expect(payload?.webFiles.get('entry.mjs')?.toString('utf8')).toBe('export const marker = 1;\n');
  });

  it('still loads a legacy license record without a keyId (no mismatch to check)', async () => {
    const root = stageAppDir();
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc('key-1', ENV_KEY_HEX));
    setLicenseManagerForTests(fakeLicenseManager(ENV_KEY_HEX, undefined));

    const payload = await loadPro(root);

    expect(payload).not.toBeNull();
  });
});
