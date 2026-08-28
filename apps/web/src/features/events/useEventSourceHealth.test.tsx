// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSourceStatus } from '@kansoku/core/contract/events';

const sourceHealth = vi.fn<() => Promise<EventSourceStatus[]>>(async () => []);
vi.mock('@web/lib/client', () => ({
  client: { events: { sourceHealth: () => sourceHealth() } },
}));

const { EVENT_SOURCE_HEALTH_POLL_MS, useEventSourceHealth } = await import(
  './useEventSourceHealth'
);

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const row: EventSourceStatus = {
  source: 'sec-edgar',
  health: 'active',
  cursor: null,
  failureStreak: 0,
  lastPolledAt: '2026-08-01T14:30:00.000Z',
  lastEventAt: null,
  lastError: null,
  disabledReason: null,
  nextAttemptAt: null,
  updatedAt: '2026-08-01T14:30:00.000Z',
};

beforeEach(() => {
  sourceHealth.mockReset();
  sourceHealth.mockResolvedValue([row]);
});

afterEach(() => cleanup());

describe('useEventSourceHealth', () => {
  it('exposes the source rows from the HTTP endpoint', async () => {
    const { result } = renderHook(() => useEventSourceHealth(true), { wrapper });
    await waitFor(() => expect(result.current.sources).toEqual([row]));
    expect(result.current.error).toBeNull();
  });

  it('surfaces the failure message instead of an empty roster', async () => {
    sourceHealth.mockRejectedValue(new Error('health down'));
    const { result } = renderHook(() => useEventSourceHealth(true), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('health down'));
    expect(result.current.sources).toBeNull();
  });

  it('stays quiet when health is not being shown', async () => {
    renderHook(() => useEventSourceHealth(false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sourceHealth).not.toHaveBeenCalled();
  });

  it('polls at a low frequency rather than on every tick', () => {
    expect(EVENT_SOURCE_HEALTH_POLL_MS).toBeGreaterThanOrEqual(60_000);
  });
});
