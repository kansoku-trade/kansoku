import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getLongbridgeAuthStatus = vi.fn();

vi.mock('../src/marketdata/longbridgeCli.js', () => ({
  getLongbridgeAuthStatus: (...args: unknown[]) => getLongbridgeAuthStatus(...args),
}));

const { readLongbridgeToken } = await import('../src/marketdata/longbridgeToken.js');
const dirs: string[] = [];

afterEach(() => {
  getLongbridgeAuthStatus.mockReset();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tokenFile(data: Buffer | string): string {
  const dir = mkdtempSync(join(tmpdir(), 'longbridge-token-'));
  dirs.push(dir);
  const path = join(dir, 'token');
  writeFileSync(path, data);
  return path;
}

function encryptedToken(payload: object, machineId: string): Buffer {
  const magic = Buffer.from([0x4c, 0x42, 0x01]);
  const nonce = randomBytes(12);
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(machineId),
      Buffer.alloc(0),
      Buffer.from('longbridge-token-v1'),
      32,
    ),
  );
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([magic, nonce, ciphertext, cipher.getAuthTag()]);
}

describe('Longbridge CLI token reader', () => {
  const payload = {
    client_id: 'client-id',
    access_token: 'us_fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_at: 4_102_444_800,
  };

  it('reads the legacy plaintext token format', async () => {
    const path = tokenFile(JSON.stringify(payload));
    getLongbridgeAuthStatus.mockResolvedValue({
      token: { status: 'valid', path, dc_region: 'us' },
    });
    await expect(readLongbridgeToken()).resolves.toMatchObject({
      clientId: 'client-id',
      accessToken: 'us_fake-access-token',
      dcRegion: 'us',
    });
  });

  it('decrypts the current machine-bound token format', async () => {
    const path = tokenFile(encryptedToken(payload, 'machine-id'));
    getLongbridgeAuthStatus.mockResolvedValue({
      token: { status: 'valid', path, dc_region: 'us' },
    });
    await expect(
      readLongbridgeToken({ machineId: async () => 'machine-id' }),
    ).resolves.toMatchObject({
      clientId: 'client-id',
      accessToken: 'us_fake-access-token',
    });
  });

  it('never exposes encrypted bytes or tokens when decryption fails', async () => {
    const path = tokenFile(encryptedToken(payload, 'correct-machine'));
    getLongbridgeAuthStatus.mockResolvedValue({ token: { status: 'valid', path } });
    const error = await readLongbridgeToken({ machineId: async () => 'wrong-machine' }).catch(
      (cause) => cause,
    );
    expect(String(error)).not.toContain('us_fake-access-token');
    expect(error).toMatchObject({ code: 'TOKEN_UNREADABLE' });
  });

  it('rejects an unauthenticated CLI before reading files', async () => {
    getLongbridgeAuthStatus.mockResolvedValue({ token: { status: 'not_found' } });
    await expect(readLongbridgeToken()).rejects.toMatchObject({ code: 'NOT_LOGGED_IN' });
  });
});
