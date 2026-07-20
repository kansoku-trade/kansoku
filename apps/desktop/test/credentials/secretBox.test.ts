import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDesktopSecretBox } from '@desktop/data/credentials/secretBox.js';
import { SecretBoxError } from '@kansoku/core/platform/secretCrypto';
import type { SafeStorageLike } from '@desktop/data/credentials/store.js';

function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`wrapped:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf8');
      if (!s.startsWith('wrapped:')) throw new Error('bad wrapped key');
      return s.slice('wrapped:'.length);
    },
  };
}

describe('desktopSecretBox', () => {
  let dir: string;
  let wrappedKeyPath: string;
  let legacyKeyPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'desktop-secret-box-'));
    wrappedKeyPath = join(dir, 'master.wrapped.json');
    legacyKeyPath = join(dir, 'ai-secret.key');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('fresh path: generates a key, wraps it, and round-trips encrypt/decrypt', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    const envelope = box.encrypt('longbridge', 'secret-value');
    expect(box.decrypt('longbridge', envelope)).toBe('secret-value');
    expect(existsSync(wrappedKeyPath)).toBe(true);
  });

  it('fresh path: status is missing before first encrypt, ready after', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(box.status()).toBe('missing');
    box.encrypt('longbridge', 'x');
    expect(box.status()).toBe('ready');
  });

  it('legacy path: wraps a pre-existing plaintext keyfile and keeps the original', () => {
    const legacyKey = Buffer.alloc(32, 7);
    writeFileSync(legacyKeyPath, legacyKey, { mode: 0o600 });

    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    const envelope = box.encrypt('longbridge', 'secret-value');

    expect(existsSync(wrappedKeyPath)).toBe(true);
    expect(existsSync(legacyKeyPath)).toBe(true);
    expect(readFileSync(legacyKeyPath)).toEqual(legacyKey);
    expect(box.decrypt('longbridge', envelope)).toBe('secret-value');
  });

  it('legacy path: the wrapped key matches the legacy key material (decryptable across box instances)', () => {
    const legacyKey = Buffer.alloc(32, 9);
    writeFileSync(legacyKeyPath, legacyKey, { mode: 0o600 });

    const boxA = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    const envelope = boxA.encrypt('longbridge', 'secret-value');

    rmSync(legacyKeyPath);
    const boxB = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(boxB.decrypt('longbridge', envelope)).toBe('secret-value');
  });

  it('wrapped path: reuses the existing wrapped key across box instances without re-wrapping', () => {
    const boxA = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    const envelope = boxA.encrypt('longbridge', 'secret-value');
    const boxB = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(boxB.status()).toBe('ready');
    expect(boxB.decrypt('longbridge', envelope)).toBe('secret-value');
  });

  it('wraps the key file with chmod 0600', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    box.encrypt('longbridge', 'x');
    expect(statSync(wrappedKeyPath).mode & 0o777).toBe(0o600);
  });

  it('throws SecretBoxError instead of falling back to plaintext when encryption is unavailable', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(false),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(() => box.encrypt('longbridge', 'x')).toThrow(SecretBoxError);
    expect(existsSync(wrappedKeyPath)).toBe(false);
  });

  it('resetKey mints a new key and invalidates envelopes encrypted under the old one', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    const envelope = box.encrypt('longbridge', 'secret-value');
    box.resetKey();
    expect(() => box.decrypt('longbridge', envelope)).toThrow(SecretBoxError);
    const fresh = box.encrypt('longbridge', 'new-value');
    expect(box.decrypt('longbridge', fresh)).toBe('new-value');
  });

  it('resetKey throws instead of writing plaintext when encryption is unavailable', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(false),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(() => box.resetKey()).toThrow(SecretBoxError);
  });

  it('resetKey keeps an existing legacy keyfile in sync with the new wrapped key', () => {
    const legacyKey = Buffer.alloc(32, 3);
    writeFileSync(legacyKeyPath, legacyKey, { mode: 0o600 });
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });

    box.resetKey();

    const rewrittenLegacy = readFileSync(legacyKeyPath);
    expect(rewrittenLegacy).not.toEqual(legacyKey);
    expect(rewrittenLegacy).toHaveLength(32);
    expect(statSync(legacyKeyPath).mode & 0o777).toBe(0o600);

    // A bare-Node consumer reading only legacyKeyPath must decrypt with the
    // same key resetKey() just wrapped.
    const envelope = box.encrypt('longbridge', 'secret-value');
    const bareNodeBox = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath: join(dirname(wrappedKeyPath), 'unrelated-wrapped.json'),
      legacyKeyPath,
    });
    expect(bareNodeBox.decrypt('longbridge', envelope)).toBe('secret-value');
  });

  it('resetKey does not create a legacy keyfile that never existed', () => {
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    box.resetKey();
    expect(existsSync(legacyKeyPath)).toBe(false);
  });

  it('a corrupt wrapped-key file is treated as invalid, not a crash', () => {
    writeFileSync(wrappedKeyPath, 'not json', { mode: 0o600 });
    const box = createDesktopSecretBox({
      safeStorage: fakeSafeStorage(),
      wrappedKeyPath,
      legacyKeyPath,
    });
    expect(box.status()).toBe('invalid');
  });
});
