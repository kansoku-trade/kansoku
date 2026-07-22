import { afterEach, describe, expect, it, vi } from 'vitest';

const status = vi.fn();

vi.mock('../src/credentials/credentials.service.js', () => ({
  credentialsService: { status: (...args: unknown[]) => status(...args) },
}));

const { stampDefaultProvider } = await import('../src/marketdata/defaultProvider.js');
const { getDefaultProviderName, setDefaultProviderName } =
  await import('../src/marketdata/registry.js');

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
