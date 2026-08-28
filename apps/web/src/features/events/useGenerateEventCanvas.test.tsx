// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';

const generateCanvas = vi.fn();
const subscribeChannel = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    events: {
      generateCanvas: (...args: unknown[]) => generateCanvas(...args),
    },
  },
}));
vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { useGenerateEventCanvas } = await import('./useGenerateEventCanvas');

const event: MarketEvent = {
  id: 'evt-1',
  dedupeKey: 'k1',
  clusterId: 'c1',
  source: 'sec-edgar',
  class: 'filing',
  kind: '8-K',
  symbols: ['MU.US'],
  occurredAt: '2026-08-01T14:30:00.000Z',
  observedAt: '2026-08-01T14:31:00.000Z',
  trust: 'official',
  severity: 'critical',
  payload: { title: 'Micron 提交 8-K' },
  canvasSlug: null,
};

afterEach(() => {
  cleanup();
  generateCanvas.mockReset();
  subscribeChannel.mockReset();
});

describe('useGenerateEventCanvas', () => {
  beforeEach(() => {
    subscribeChannel.mockReturnValue(() => {});
    generateCanvas.mockResolvedValue({
      eventId: 'evt-1',
      clusterId: 'c1',
      slug: 'event-evt-1',
      symbols: ['MU.US'],
      phase: 'queued',
      error: null,
    });
  });

  it('subscribes to the shared events channel for progress', () => {
    renderHook(() => useGenerateEventCanvas({ onOpen: () => {} }));
    expect(subscribeChannel).toHaveBeenCalledWith(
      { kind: 'events' },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('opens an existing canvas without starting another run', async () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useGenerateEventCanvas({ onOpen }));
    await result.current.onEventCanvas({ ...event, canvasSlug: 'event-evt-1' });
    expect(generateCanvas).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith('event-evt-1');
  });

  it('starts generation and opens the pane when the channel says done', async () => {
    const onOpen = vi.fn();
    let onPayload: ((payload: unknown) => void) | undefined;
    subscribeChannel.mockImplementation((_spec, payload: (raw: unknown) => void) => {
      onPayload = payload;
      return () => {};
    });
    const { result } = renderHook(() => useGenerateEventCanvas({ onOpen }));
    await result.current.onEventCanvas(event);
    expect(generateCanvas).toHaveBeenCalledWith({ id: 'evt-1' });
    await waitFor(() => expect(result.current.phaseOf('evt-1')).toBe('queued'));

    onPayload?.({
      type: 'canvas',
      eventId: 'evt-1',
      slug: 'event-evt-1',
      phase: 'done',
      error: null,
    });
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('event-evt-1'));
    await waitFor(() => expect(result.current.phaseOf('evt-1')).toBe('done'));
  });
});
