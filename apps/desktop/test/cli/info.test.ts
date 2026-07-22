import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInfo } from '@desktop/cli/commands/info.js';

describe('runInfo', () => {
  const originalTradeProjectRoot = process.env.TRADE_PROJECT_ROOT;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalTradeProjectRoot === undefined) delete process.env.TRADE_PROJECT_ROOT;
    else process.env.TRADE_PROJECT_ROOT = originalTradeProjectRoot;
  });

  it('emits kitVersion from the injected manifest', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const readManifest = () => ({ kitVersion: '9.9.9+20260722', appVersion: '1.4.2' });

    runInfo(['kit-version'], readManifest);

    expect(write).toHaveBeenCalledWith('{"kitVersion":"9.9.9+20260722"}\n');
  });

  it('emits appVersion as version from the injected manifest', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const readManifest = () => ({ kitVersion: '9.9.9+20260722', appVersion: '1.4.2' });

    runInfo(['version'], readManifest);

    expect(write).toHaveBeenCalledWith('{"version":"1.4.2"}\n');
  });

  it('emits the resolved data root from the environment', () => {
    process.env.TRADE_PROJECT_ROOT = '/tmp/xyz';
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    runInfo(['data-root']);

    expect(write).toHaveBeenCalledWith('{"dataRoot":"/tmp/xyz"}\n');
  });

  it('writes to stderr and exits with 64 on an unknown sub-command', () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    runInfo(['bogus']);

    expect(errWrite).toHaveBeenCalledWith('info: unknown sub-command "bogus"\n');
    expect(exit).toHaveBeenCalledWith(64);
  });
});
