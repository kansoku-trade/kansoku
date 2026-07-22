import { afterEach, describe, expect, it, vi } from 'vitest';

const locateLongbridgeCli = vi.fn();
const readLongbridgeToken = vi.fn();

class FakeLongbridgeTokenError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

vi.mock('../src/marketdata/longbridgeCli.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/marketdata/longbridgeCli.js')>();
  return {
    ...actual,
    locateLongbridgeCli: (...args: unknown[]) => locateLongbridgeCli(...args),
  };
});

vi.mock('../src/marketdata/longbridgeToken.js', () => ({
  readLongbridgeToken: (...args: unknown[]) => readLongbridgeToken(...args),
  LongbridgeTokenError: FakeLongbridgeTokenError,
}));

const { credentialsService } = await import('../src/credentials/credentials.service.js');
const { getDefaultProviderName, setDefaultProviderName } =
  await import('../src/marketdata/registry.js');

describe('credentialsService.status re-stamps the default provider', () => {
  afterEach(() => {
    locateLongbridgeCli.mockReset();
    readLongbridgeToken.mockReset();
    setDefaultProviderName('longbridge');
  });

  it('stamps yahoo when the CLI cannot be located', async () => {
    locateLongbridgeCli.mockRejectedValue(new Error('not found'));
    await credentialsService.status();
    expect(getDefaultProviderName()).toBe('yahoo');
  });

  it('stamps yahoo when the token is unreadable', async () => {
    locateLongbridgeCli.mockResolvedValue('/bin/longbridge');
    readLongbridgeToken.mockRejectedValue(new FakeLongbridgeTokenError('nope', 'NOT_LOGGED_IN'));
    await credentialsService.status();
    expect(getDefaultProviderName()).toBe('yahoo');
  });

  it('re-stamps longbridge after an earlier yahoo stamp once credentials become configured', async () => {
    locateLongbridgeCli.mockRejectedValue(new Error('not found'));
    await credentialsService.status();
    expect(getDefaultProviderName()).toBe('yahoo');

    locateLongbridgeCli.mockResolvedValue('/bin/longbridge');
    readLongbridgeToken.mockResolvedValue({});
    await credentialsService.status();
    expect(getDefaultProviderName()).toBe('longbridge');
  });
});
