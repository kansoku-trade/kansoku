// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDocView } from '@web/features/charts/intraday/useIntradayDoc';

const update = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    charts: {
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const { useSepaRefresh } = await import('./useSepaRefresh');

function sepaDoc(overrides: Partial<ChartDocView> = {}): ChartDocView {
  return {
    id: 'chart-1',
    schema_version: 2,
    type: 'sepa',
    title: 'MRVL',
    symbol: 'MRVL.US',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    input: { origin: 'research' },
    built: { kind: 'sepa' } as ChartDocView['built'],
    sepa_stale: true,
    ...overrides,
  };
}

describe('useSepaRefresh', () => {
  beforeEach(() => {
    update.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-refreshes exactly once for a stale research-origin doc', async () => {
    update.mockResolvedValue({ data: {}, meta: {} });
    const reload1 = vi.fn();
    const doc = sepaDoc();

    const { result, rerender } = renderHook(({ doc, reload }) => useSepaRefresh(doc, reload), {
      initialProps: { doc, reload: reload1 },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ id: 'chart-1', refresh: true });
    expect(reload1).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();

    const reload2 = vi.fn();
    rerender({ doc: sepaDoc(), reload: reload2 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(reload2).not.toHaveBeenCalled();
  });

  it('does not auto-refresh a stale doc without the research origin', async () => {
    const reload = vi.fn();
    const doc = sepaDoc({ input: {} });

    renderHook(() => useSepaRefresh(doc, reload));

    await act(async () => {
      await Promise.resolve();
    });

    expect(update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not auto-refresh a research-origin doc that is not stale', async () => {
    const reload = vi.fn();
    const doc = sepaDoc({ sepa_stale: false });

    renderHook(() => useSepaRefresh(doc, reload));

    await act(async () => {
      await Promise.resolve();
    });

    expect(update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('surfaces the failure and does not retry', async () => {
    update.mockRejectedValue(new Error('network down'));
    const reload1 = vi.fn();
    const doc = sepaDoc();

    const { result, rerender } = renderHook(({ doc, reload }) => useSepaRefresh(doc, reload), {
      initialProps: { doc, reload: reload1 },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(reload1).not.toHaveBeenCalled();
    expect(result.current.error).toBe('network down');
    expect(result.current.refreshing).toBe(false);

    const reload2 = vi.fn();
    rerender({ doc: sepaDoc(), reload: reload2 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not auto-refresh when doc is null', async () => {
    const reload = vi.fn();

    renderHook(() => useSepaRefresh(null, reload));

    await act(async () => {
      await Promise.resolve();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('exposes refresh for the manual button and reflects refreshing state', async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    update.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const reload = vi.fn();
    const doc = sepaDoc({ sepa_stale: false });

    const { result } = renderHook(() => useSepaRefresh(doc, reload));

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolveUpdate?.({ data: {}, meta: {} });
      await refreshPromise;
    });

    expect(result.current.refreshing).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores a same-tick second refresh() call while one is already in flight', async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    update.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const reload = vi.fn();
    const doc = sepaDoc({ sepa_stale: false });

    const { result } = renderHook(() => useSepaRefresh(doc, reload));

    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = result.current.refresh();
      p2 = result.current.refresh();
    });

    expect(update).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate?.({ data: {}, meta: {} });
      await p1;
      await p2;
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not let doc A's late success settle set busy/reload once doc B is current", async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const reload = vi.fn();
    const docA = sepaDoc({ id: 'chart-a' });
    const docB = sepaDoc({ id: 'chart-b', sepa_stale: false });

    const { result, rerender } = renderHook(({ doc }) => useSepaRefresh(doc, reload), {
      initialProps: { doc: docA },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.refreshing).toBe(true);

    rerender({ doc: docB });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      resolveUpdate?.({ data: {}, meta: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.refreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not let doc A's late failure set the error once doc B is current", async () => {
    let rejectUpdate: ((reason: unknown) => void) | undefined;
    update.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpdate = reject;
        }),
    );
    const reload = vi.fn();
    const docA = sepaDoc({ id: 'chart-a' });
    const docB = sepaDoc({ id: 'chart-b', sepa_stale: false });

    const { result, rerender } = renderHook(({ doc }) => useSepaRefresh(doc, reload), {
      initialProps: { doc: docA },
    });

    await act(async () => {
      await Promise.resolve();
    });

    rerender({ doc: docB });

    await act(async () => {
      rejectUpdate?.(new Error('network down'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.refreshing).toBe(false);
  });

  it('auto-refreshes each distinct stale research-origin doc once within the same mount', async () => {
    update.mockResolvedValue({ data: {}, meta: {} });
    const reload = vi.fn();
    const docA = sepaDoc({ id: 'chart-a' });
    const docB = sepaDoc({ id: 'chart-b' });

    const { rerender } = renderHook(({ doc }) => useSepaRefresh(doc, reload), {
      initialProps: { doc: docA },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith({ id: 'chart-a', refresh: true });

    rerender({ doc: docB });
    await act(async () => {
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledWith({ id: 'chart-b', refresh: true });
    expect(update).toHaveBeenCalledTimes(2);

    rerender({ doc: docA });
    await act(async () => {
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledTimes(2);
  });
});
