import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller } from '../src/realtime/poller.js';

describe('poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits only when data changes', async () => {
    let value = 'a';
    const poller = createPoller({ intervalMs: 1000, task: async () => value });
    const events: string[] = [];
    const unsub = poller.subscribe((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => JSON.parse(e).type === 'data')).toHaveLength(1);

    value = 'b';
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.filter((e) => JSON.parse(e).type === 'data')).toHaveLength(2);
    unsub();
  });

  it('stops polling when last subscriber leaves and calls onStop', async () => {
    let calls = 0;
    let stopped = false;
    const poller = createPoller({
      intervalMs: 1000,
      task: async () => ++calls,
      onStop: () => {
        stopped = true;
      },
    });
    const unsub = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    unsub();
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(1);
  });

  it('backs off after repeated failures and recovers', async () => {
    let fail = false;
    let calls = 0;
    const poller = createPoller({
      intervalMs: 1000,
      failThreshold: 3,
      backoffMs: 60_000,
      task: async () => {
        calls++;
        if (fail) throw new Error('boom');
        return `ok-${calls}`;
      },
    });
    const events: { type: string; degraded?: boolean }[] = [];
    const unsub = poller.subscribe((e) => events.push(JSON.parse(e)));

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(4);
    expect(events.filter((e) => e.type === 'status' && e.degraded)).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(4);
    fail = false;
    await vi.advanceTimersByTimeAsync(59_000);
    expect(calls).toBe(5);
    expect(events.some((e) => e.type === 'status' && e.degraded === false)).toBe(true);
    expect(events.filter((e) => e.type === 'data').length).toBeGreaterThanOrEqual(2);
    unsub();
  });

  it('replays last data to new subscribers immediately', async () => {
    const poller = createPoller({ intervalMs: 1000, task: async () => 'snapshot' });
    const first = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const events: string[] = [];
    const second = poller.subscribe((e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]).data).toBe('snapshot');
    first();
    second();
  });

  it('lingers after last unsubscribe: delays onStop, replays cache and resumes on resubscribe', async () => {
    let stopped = false;
    const phases: string[] = [];
    const poller = createPoller({
      intervalMs: 1000,
      lingerMs: 10_000,
      task: async () => 'cached',
      onIdle: () => phases.push('idle'),
      onResume: () => phases.push('resume'),
      onStop: () => {
        stopped = true;
      },
    });
    const unsub = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    expect(phases).toEqual(['idle']);
    expect(stopped).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false);
    const events: string[] = [];
    const resub = poller.subscribe((e) => events.push(e));
    expect(phases).toEqual(['idle', 'resume']);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]).data).toBe('cached');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(stopped).toBe(false);
    resub();
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(stopped).toBe(true);
  });

  it('destroy() during linger fires onStop exactly once', async () => {
    let stops = 0;
    const poller = createPoller({
      intervalMs: 1000,
      lingerMs: 10_000,
      task: async () => 'x',
      onStop: () => {
        stops += 1;
      },
    });
    const unsub = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    poller.destroy();
    expect(stops).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(stops).toBe(1);
  });

  it('destroy() is a no-op while subscribers remain', async () => {
    let stops = 0;
    const poller = createPoller({
      intervalMs: 1000,
      lingerMs: 10_000,
      task: async () => 'x',
      onStop: () => {
        stops += 1;
      },
    });
    const unsub = poller.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    poller.destroy();
    expect(stops).toBe(0);
    unsub();
  });

  it('retries fast while no frame has ever landed, then falls back to the normal cadence', async () => {
    let fail = true;
    let calls = 0;
    const poller = createPoller({
      intervalMs: 300_000,
      task: async () => {
        calls++;
        if (fail) throw new Error('rate limited');
        return 'frame';
      },
    });
    const events: string[] = [];
    const unsub = poller.subscribe((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(calls).toBe(3);

    fail = false;
    await vi.advanceTimersByTimeAsync(8_000);
    expect(calls).toBe(4);
    expect(events.some((e) => JSON.parse(e).type === 'data')).toBe(true);

    fail = true;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls).toBe(5);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(5);
    await vi.advanceTimersByTimeAsync(270_000);
    expect(calls).toBe(6);
    unsub();
  });

  it('refresh() triggers an immediate tick for active subscribers', async () => {
    let value = 'a';
    const poller = createPoller({ intervalMs: 60_000, task: async () => value });
    const events: string[] = [];
    const unsub = poller.subscribe((e) => events.push(e));
    await vi.advanceTimersByTimeAsync(0);
    value = 'b';
    poller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(events.filter((e) => JSON.parse(e).type === 'data')).toHaveLength(2);
    unsub();
  });
});
