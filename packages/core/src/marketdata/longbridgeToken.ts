import { createDecipheriv, hkdfSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { getLongbridgeAuthStatus, type RunLongbridgeOptions } from './longbridgeCli.js';

const execFileAsync = promisify(execFile);
const MAGIC = Buffer.from([0x4c, 0x42, 0x01]);
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = Buffer.from('longbridge-token-v1');

export interface LongbridgeToken {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  dcRegion: string | null;
}

interface StoredToken {
  client_id?: string;
  access_token?: string;
  refresh_token?: string | null;
  expires_at?: number;
}

export class LongbridgeTokenError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_LOGGED_IN' | 'TOKEN_UNREADABLE' | 'TOKEN_UNSUPPORTED' | 'TOKEN_EXPIRED',
  ) {
    super(message);
    this.name = 'LongbridgeTokenError';
  }
}

export interface LongbridgeTokenDeps extends RunLongbridgeOptions {
  machineId?: () => Promise<string>;
}

function parseStoredToken(value: StoredToken, dcRegion: string | null): LongbridgeToken {
  if (!value.client_id || !value.access_token) {
    throw new LongbridgeTokenError('Longbridge Token 缺少必要字段', 'TOKEN_UNREADABLE');
  }
  const expiresAt = Number(value.expires_at ?? 0);
  if (expiresAt > 0 && expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new LongbridgeTokenError(
      'Longbridge Token 已过期，请重新执行 longbridge auth login',
      'TOKEN_EXPIRED',
    );
  }
  return {
    clientId: value.client_id,
    accessToken: value.access_token,
    refreshToken: value.refresh_token ?? null,
    expiresAt,
    dcRegion,
  };
}

export async function readMacMachineId(): Promise<string> {
  const { stdout } = await execFileAsync(
    '/usr/sbin/ioreg',
    ['-rd1', '-c', 'IOPlatformExpertDevice'],
    {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
  if (!match) throw new LongbridgeTokenError('无法读取 macOS 机器标识', 'TOKEN_UNREADABLE');
  return match[1];
}

function decryptTokenFile(data: Buffer, machineId: string): StoredToken {
  if (
    data.length < MAGIC.length + NONCE_BYTES + TAG_BYTES ||
    !data.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new LongbridgeTokenError('不支持的 Longbridge Token 文件格式', 'TOKEN_UNSUPPORTED');
  }
  const nonceStart = MAGIC.length;
  const ciphertextStart = nonceStart + NONCE_BYTES;
  const tagStart = data.length - TAG_BYTES;
  const key = Buffer.from(
    hkdfSync('sha256', Buffer.from(machineId), Buffer.alloc(0), HKDF_INFO, 32),
  );
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      data.subarray(nonceStart, ciphertextStart),
    );
    decipher.setAuthTag(data.subarray(tagStart));
    const plaintext = Buffer.concat([
      decipher.update(data.subarray(ciphertextStart, tagStart)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as StoredToken;
  } catch {
    throw new LongbridgeTokenError(
      '无法解密 Longbridge Token，请重新执行 longbridge auth login',
      'TOKEN_UNREADABLE',
    );
  }
}

export async function readLongbridgeToken(
  deps: LongbridgeTokenDeps = {},
): Promise<LongbridgeToken> {
  const status = await getLongbridgeAuthStatus(deps);
  const tokenStatus = status.token?.status;
  if (!tokenStatus || ['not_found', 'expired', 'decrypt_failed'].includes(tokenStatus)) {
    throw new LongbridgeTokenError(
      'Longbridge CLI 尚未登录，请执行 longbridge auth login',
      'NOT_LOGGED_IN',
    );
  }
  const path = status.token?.path;
  if (!path) throw new LongbridgeTokenError('Longbridge CLI 未返回 Token 路径', 'TOKEN_UNREADABLE');

  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(path);
    const dcRegion = status.token?.dc_region ?? null;
    if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
      return parseStoredToken(JSON.parse(data.toString('utf8')) as StoredToken, dcRegion);
    }
    const machineId = await (deps.machineId ?? readMacMachineId)();
    return parseStoredToken(decryptTokenFile(data, machineId), dcRegion);
  } catch (error) {
    if (error instanceof LongbridgeTokenError) throw error;
    throw new LongbridgeTokenError('无法读取 Longbridge Token', 'TOKEN_UNREADABLE');
  }
}
