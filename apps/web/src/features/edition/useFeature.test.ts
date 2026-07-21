// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { features?: Record<string, string> } = { features: {} };

vi.mock('./capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } =
  await import('./licenseModalStore');
const { useFeature } = await import('./useFeature');

afterEach(() => {
  capabilities = { features: {} };
  resetLicenseModalStoreForTests();
});

describe('useFeature', () => {
  it('reports active state and runs the action directly', () => {
    capabilities = { features: { 'symbol-follow': 'active' } };
    const { result } = renderHook(() => useFeature('symbol-follow'));
    const action = vi.fn();

    result.current.guard(action);

    expect(result.current.state).toBe('active');
    expect(result.current.active).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('reports locked state and opens the license modal instead of running the action', () => {
    capabilities = { features: { 'symbol-follow': 'locked' } };
    const { result } = renderHook(() => useFeature('symbol-follow'));
    const action = vi.fn();

    result.current.guard(action);

    expect(result.current.state).toBe('locked');
    expect(result.current.active).toBe(false);
    expect(result.current.locked).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('reports absent state and does nothing for an unknown key', () => {
    capabilities = { features: { 'symbol-follow': 'absent' } };
    const { result } = renderHook(() => useFeature('symbol-follow'));
    const action = vi.fn();

    result.current.guard(action);

    expect(result.current.state).toBe('absent');
    expect(result.current.active).toBe(false);
    expect(result.current.locked).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('reports absent state while capabilities are still loading (features undefined)', () => {
    capabilities = {};
    const { result } = renderHook(() => useFeature('symbol-follow'));
    const action = vi.fn();

    result.current.guard(action);

    expect(result.current.state).toBe('absent');
    expect(action).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
