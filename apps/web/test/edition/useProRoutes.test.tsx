// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadProComposition = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/edition/pro', () => ({ loadProComposition }));

import { resetProRoutesForTests, useProRoutes } from '../../src/features/edition/useProRoutes';

describe('useProRoutes', () => {
  beforeEach(() => {
    loadProComposition.mockReset();
    resetProRoutesForTests();
  });

  it('stays null in free mode', async () => {
    loadProComposition.mockResolvedValue(null);
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('exposes routes once the pro composition resolves', async () => {
    const Page = () => null;
    loadProComposition.mockResolvedValue({ routes: { '/research': Page } });
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!['/research']).toBe(Page);
  });

  it('stays null when the pro chunk fails to load', async () => {
    loadProComposition.mockRejectedValue(new Error('chunk missing'));
    const { result } = renderHook(() => useProRoutes());
    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
