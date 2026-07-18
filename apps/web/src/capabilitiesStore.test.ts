// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('./client', () => ({
  client: { capabilities: { get: (...args: unknown[]) => get(...args) } },
}));

const store = await import('./capabilitiesStore');
const licenseRequiredMode = await import('./licenseRequiredMode');
const licenseModalStore = await import('./licenseModalStore');

describe('capabilitiesStore', () => {
  beforeEach(() => {
    get.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    store.resetCapabilitiesStoreForTests();
    licenseRequiredMode.resetLicenseRequiredModeForTests();
    licenseModalStore.resetLicenseModalStoreForTests();
    vi.useRealTimers();
  });

  it('loads capabilities on mount', async () => {
    get.mockResolvedValue({ pro: true, licensed: true });
    const { result } = renderHook(() => store.useCapabilities());

    await vi.waitFor(() => expect(result.current.pro).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('retries after a fetch failure instead of leaving pro stuck at null', async () => {
    get.mockRejectedValueOnce(new Error('network down'));
    get.mockResolvedValueOnce({ pro: true, licensed: true });

    const { result } = renderHook(() => store.useCapabilities());
    expect(result.current.pro).toBeNull();

    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(result.current.pro).toBe(true));
  });

  it('passes the license snapshot through unchanged', async () => {
    get.mockResolvedValue({
      pro: true,
      licensed: true,
      license: { state: 'grace', graceUntil: '2026-08-01T00:00:00.000Z', maskedKey: '••••1234' },
    });
    const { result } = renderHook(() => store.useCapabilities());

    await vi.waitFor(() => expect(result.current.license?.state).toBe('grace'));
    expect(result.current.license?.maskedKey).toBe('••••1234');
  });

  it('forces licensed:false once a LICENSE_REQUIRED 403 is observed mid-session', async () => {
    get.mockResolvedValue({ pro: true, licensed: true, license: { state: 'licensed' } });
    const { result } = renderHook(() => store.useCapabilities());

    await vi.waitFor(() => expect(result.current.licensed).toBe(true));

    licenseRequiredMode.markLicenseRequired();

    await vi.waitFor(() => expect(result.current.licensed).toBe(false));
  });

  it('refreshCapabilities clears the license-required flag and refetches', async () => {
    get.mockResolvedValueOnce({ pro: true, licensed: true, license: { state: 'licensed' } });
    const { result } = renderHook(() => store.useCapabilities());
    await vi.waitFor(() => expect(result.current.licensed).toBe(true));

    licenseRequiredMode.markLicenseRequired();
    await vi.waitFor(() => expect(result.current.licensed).toBe(false));
    expect(licenseModalStore.getLicenseModalStateForTests().open).toBe(true);

    get.mockResolvedValueOnce({ pro: true, licensed: true, license: { state: 'licensed' } });
    await store.refreshCapabilities();

    expect(licenseRequiredMode.getLicenseRequiredModeSnapshotForTests()).toBe(false);
    await vi.waitFor(() => expect(result.current.licensed).toBe(true));
  });
});
