import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

function writeLegacyKey(path: string, key: Buffer): void {
  writeFileSync(path, key, { mode: 0o600 });
  chmodSync(path, 0o600);
}

// Migration order on every boot: prefer an already-wrapped key (steady
// state); else wrap a pre-P3 plaintext keyfile in place, keeping the
// original file untouched (never delete user data); else mint a fresh key.
// The legacy plaintext file, if wrapped, is intentionally left on disk —
// this function only adds a safeStorage-wrapped copy alongside it.
function resolveKey(deps: DesktopSecretBoxDeps): Buffer | null {
  const wrapped = readWrappedKey(deps.wrappedKeyPath, deps.safeStorage);
  if (wrapped) return wrapped;

  if (!deps.safeStorage.isEncryptionAvailable()) return null;

  const legacy = readLegacyKey(deps.legacyKeyPath);
  if (legacy) {
    writeWrappedKey(deps.wrappedKeyPath, legacy, deps.safeStorage);
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
      // A bare-Node host sharing this data root (no Electron, no safeStorage)
      // reads the master key straight from legacyKeyPath — if that file is
      // still around, keep it in lockstep or it'd decrypt with a stale key
      // after this reset.
      if (readLegacyKey(deps.legacyKeyPath)) writeLegacyKey(deps.legacyKeyPath, fresh);
    },
  };
}
