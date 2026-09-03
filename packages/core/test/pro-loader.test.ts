import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPro } from '../src/pro/loader.js';
import { hasEncBundle } from '../src/pro/bundleState.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function stageAppDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'kansoku-loader-'));
  roots.push(root);
  mkdirSync(join(root, 'pro'), { recursive: true });
  return root;
}

function packEnc(files: Record<string, string>, keyHex: string): Buffer {
  const manifest = {
    keyId: 'test',
    files: Object.fromEntries(
      Object.entries(files).map(([rel, src]) => [rel, Buffer.from(src).toString('base64')]),
    ),
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(manifest)));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([Buffer.from('KPRO1', 'utf8'), iv, cipher.getAuthTag(), ct]);
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

  it('prefers pro/bundle-key.local over the env key', async () => {
    const root = stageAppDir();
    const localKey = randomBytes(32).toString('hex');
    writeFileSync(join(root, 'pro', 'pro.enc'), packEnc({ 'web/a.js': 'a' }, localKey));
    writeFileSync(join(root, 'pro', 'bundle-key.local'), `${localKey}\n`);
    process.env.KANSOKU_BUNDLE_KEY = '00'.repeat(32);
    try {
      const payload = await loadPro(root);
      expect([...(payload?.webFiles.keys() ?? [])]).toEqual(['a.js']);
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
});
