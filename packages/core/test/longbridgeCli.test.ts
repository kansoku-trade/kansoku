import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  locateLongbridgeCli,
  LongbridgeCliError,
  resetLongbridgeCliCacheForTests,
  runLongbridgeJson,
} from '../src/marketdata/longbridgeCli.js';

const dirs: string[] = [];

afterEach(() => {
  resetLongbridgeCliCacheForTests();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeCli(): string {
  const dir = mkdtempSync(join(tmpdir(), 'longbridge-cli-'));
  dirs.push(dir);
  const path = join(dir, 'longbridge');
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

describe('longbridge CLI boundary', () => {
  it('prefers LONGBRIDGE_CLI_PATH over PATH', async () => {
    const cli = fakeCli();
    await expect(
      locateLongbridgeCli({ env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' } }),
    ).resolves.toBe(cli);
  });

  it('reports a specific error when no executable can be found', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('missing'));
    await expect(
      locateLongbridgeCli({ env: { PATH: '', SHELL: '/bin/false' }, exec, standardPaths: [] }),
    ).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
  });

  it('executes without a shell, appends JSON output mode, and parses stdout', async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockResolvedValue({ stdout: '{"ok":true}', stderr: 'upgrade notice' });
    await expect(
      runLongbridgeJson<{ ok: boolean }>(['quote', 'AAPL.US'], {
        env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' },
        exec,
      }),
    ).resolves.toEqual({ ok: true });
    expect(exec).toHaveBeenCalledWith(
      cli,
      ['quote', 'AAPL.US', '--format', 'json'],
      expect.any(Object),
    );
  });

  it('does not include stdout in an invalid JSON error', async () => {
    const cli = fakeCli();
    const exec = vi.fn().mockResolvedValue({ stdout: 'secret-token', stderr: '' });
    const error = await runLongbridgeJson([], {
      env: { LONGBRIDGE_CLI_PATH: cli, PATH: '' },
      exec,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(LongbridgeCliError);
    expect(String(error)).not.toContain('secret-token');
  });
});
