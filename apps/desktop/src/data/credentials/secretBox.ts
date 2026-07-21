import { chmodSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { MasterKeyStatus, SecretBox } from '@kansoku/pro-api';
import {
  decryptWithKey,
  encryptWithKey,
  SecretBoxError,
} from '@kansoku/core/platform/secretCrypto';
import type { SafeStorageLike } from './store.js';

const KEY_BYTES = 32;

export interface DesktopSecretBoxDeps {
  safeStorage: SafeStorageLike;
  wrappedKeyPath: string;
  legacyKeyPath: string;
}

interface WrappedKeyFile {
  version: 1;
  ciphertext: string;
}

function isWrappedKeyFile(value: unknown): value is WrappedKeyFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as WrappedKeyFile).version === 1 &&
    typeof (value as WrappedKeyFile).ciphertext === 'string'
  );
}

function writeWrappedKey(path: string, key: Buffer, safeStorage: SafeStorageLike): void {
  const ciphertext = safeStorage.encryptString(key.toString('base64')).toString('base64');
  const payload: WrappedKeyFile = { version: 1, ciphertext };
  writeFileSync(path, JSON.stringify(payload), { mode: 0o600 });
  chmodSync(path, 0o600);
}

function readWrappedKey(path: string, safeStorage: SafeStorageLike): Buffer | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isWrappedKeyFile(parsed)) return null;
  try {
    const decoded = safeStorage.decryptString(Buffer.from(parsed.ciphertext, 'base64'));
    const key = Buffer.from(decoded, 'base64');
    if (key.length !== KEY_BYTES) return null;
    return key;
  } catch {
    return null;
  }
}

function readLegacyKey(path: string): Buffer | null {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return null;
  }
  if (!stats.isFile() || stats.size !== KEY_BYTES) return null;
  return readFileSync(path);
}

// Migration order on every boot: prefer an already-wrapped key (steady
// state); else wrap a pre-P3 plaintext keyfile and DELETE the plaintext —
// leaving the bare key on disk next to the Keychain-wrapped copy would
// defeat the wrapping entirely; else mint a fresh key.
function resolveKey(deps: DesktopSecretBoxDeps): Buffer | null {
  const wrapped = readWrappedKey(deps.wrappedKeyPath, deps.safeStorage);
  if (wrapped) return wrapped;

  if (!deps.safeStorage.isEncryptionAvailable()) return null;

  const legacy = readLegacyKey(deps.legacyKeyPath);
  if (legacy) {
    writeWrappedKey(deps.wrappedKeyPath, legacy, deps.safeStorage);
    try {
      rmSync(deps.legacyKeyPath, { force: true });
    } catch (error) {
      // The wrapped copy is already in place, so a failed unlink is not
      // fatal — but the plaintext key is still on disk, so make noise.
      console.warn('[secretBox] migrated master key but could not delete legacy keyfile:', error);
    }
    return legacy;
  }

  const fresh = randomBytes(KEY_BYTES);
  writeWrappedKey(deps.wrappedKeyPath, fresh, deps.safeStorage);
  return fresh;
}

export function createDesktopSecretBox(deps: DesktopSecretBoxDeps): SecretBox {
  function currentKey(): Buffer {
    const key = resolveKey(deps);
    if (!key) throw new SecretBoxError('OS secure storage unavailable for master key');
    return key;
  }

  return {
    status(): MasterKeyStatus {
      if (readWrappedKey(deps.wrappedKeyPath, deps.safeStorage)) return 'ready';
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return existsSync(deps.wrappedKeyPath) ? 'invalid' : 'missing';
      }
      if (readLegacyKey(deps.legacyKeyPath)) return 'missing';
      return existsSync(deps.wrappedKeyPath) ? 'invalid' : 'missing';
    },

    encrypt(provider: string, plaintext: string): string {
      return encryptWithKey(currentKey(), provider, plaintext);
    },

    decrypt(provider: string, envelope: string): string {
      return decryptWithKey(currentKey(), provider, envelope);
    },

    resetKey(): void {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        throw new SecretBoxError('OS secure storage unavailable for master key');
      }
      const fresh = randomBytes(KEY_BYTES);
      writeWrappedKey(deps.wrappedKeyPath, fresh, deps.safeStorage);
      // Never write the fresh key back to the legacy plaintext path — the
      // bare keyfile is gone for good once the safeStorage wrap exists.
      rmSync(deps.legacyKeyPath, { force: true });
    },
  };
}
