import { afterEach, describe, expect, it, vi } from 'vitest';

const status = vi.fn();

vi.mock('../src/credentials/credentials.service.js', () => ({
  credentialsService: { status: (...args: unknown[]) => status(...args) },
}));

const { stampDefaultProvider, restampFromCredentialStatus } = await import(
  '../src/marketdata/defaultProvider.js'
);
const { getDefaultProviderName, setDefaultProviderName, onProviderRoutingChanged, disposeMarketData } =
  await import('../src/marketdata/registry.js');
const { getLongbridgeStream } = await import('../src/marketdata/longbridgeStream.js');

describe('stampDefaultProvider', () => {
  afterEach(() => {
    status.mockReset();
    setDefaultProviderName('longbridge');
  });

  it('stamps longbridge when credentials are configured', async () => {
    status.mockResolvedValue({ configured: true });
    await expect(stampDefaultProvider()).resolves.toBe('longbridge');
    expect(getDefaultProviderName()).toBe('longbridge');
  });

  it('stamps yahoo when credentials are not configured', async () => {
    status.mockResolvedValue({ configured: false });
    await expect(stampDefaultProvider()).resolves.toBe('yahoo');
    expect(getDefaultProviderName()).toBe('yahoo');
  });

  it('stamps yahoo without throwing when status() rejects', async () => {
    status.mockRejectedValue(new Error('probe crashed'));
    await expect(stampDefaultProvider()).resolves.toBe('yahoo');
    expect(getDefaultProviderName()).toBe('yahoo');
  });
});

describe('restampFromCredentialStatus', () => {
  afterEach(() => {
    setDefaultProviderName('longbridge');
    disposeMarketData();
  });

  it('fires the routing-changed callback exactly once when the stamped name flips', () => {
    setDefaultProviderName('yahoo');
    const cb = vi.fn();
    const off = onProviderRoutingChanged(cb);
    try {
      expect(restampFromCredentialStatus(true)).toBe('longbridge');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(restampFromCredentialStatus(true)).toBe('longbridge');
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('disposes the stream singletons on a flip but leaves them intact on a no-op', () => {
    setDefaultProviderName('longbridge');
    const before = getLongbridgeStream();
    restampFromCredentialStatus(true);
    expect(getLongbridgeStream()).toBe(before);
    restampFromCredentialStatus(false);
    expect(getLongbridgeStream()).not.toBe(before);
  });
});
