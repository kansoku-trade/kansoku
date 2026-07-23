// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '../../lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('../../lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const store = await import('./analystRunsStore');

interface Sub {
  spec: ChannelSpec;
  onPayload: (payload: unknown) => void;
  onConnected: (connected: boolean) => void;
  unsub: ReturnType<typeof vi.fn>;
}

const running = (activity: string, extra: Record<string, unknown> = {}) => ({
  running: true as const,
  origin: 'manual' as const,
  phase: 'researching' as const,
  activity,
  startedAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z',
  ...extra,
});

describe('analystRunsStore', () => {
  let subs: Sub[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (
        spec: ChannelSpec,
        onPayload: (payload: unknown) => void,
        onConnected: (connected: boolean) => void,
      ) => {
        const unsub = vi.fn();
        subs.push({ spec, onPayload, onConnected, unsub });
        return unsub;
      },
    );
  });

  afterEach(() => {
    cleanup();
    store.resetAnalystRunsStoreForTests();
  });

  const currentRuns = () => store.getAnalystRunsSnapshot().runs;
  const currentUnseen = () => store.getAnalystRunsSnapshot().unseen;

  it('populates runs from the init payload', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({
      type: 'init',
      runs: [
        { symbol: 'NVDA', status: running('preparing') },
        { symbol: 'MU', status: running('writing') },
      ],
    });

    expect(currentRuns().has('NVDA')).toBe(true);
    expect(currentRuns().has('MU')).toBe(true);
    expect(currentRuns().get('NVDA')).toEqual({
      ...running('preparing'),
      activities: [],
      sections: {},
    });
    off();
  });

  it('adds a symbol on running:true update and removes it on running:false', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    expect(currentRuns().has('NVDA')).toBe(true);

    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });
    expect(currentRuns().has('NVDA')).toBe(false);
    off();
  });

  it('marks unseen when a run ends while its symbol is not the active tab', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(currentUnseen().has('NVDA')).toBe(true);
    off();
  });

  it('does not mark unseen when the active symbol matches the finished run', () => {
    store.setActiveSymbol('NVDA');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('does not mark unseen when no active symbol is set', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('marks unseen when desktop tracking is active on a non-symbol tab', () => {
    store.setActiveSymbol(null);
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(currentUnseen().has('NVDA')).toBe(true);
    off();
  });

  it('stops marking unseen after desktop tracking is cleared', () => {
    store.setActiveSymbol(null);
    store.clearActiveSymbol();
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('clears the unseen mark when its symbol becomes active', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });
    expect(currentUnseen().has('NVDA')).toBe(true);

    store.setActiveSymbol('NVDA');
    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('ignores malformed payloads', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload(null);
    subs[0].onPayload({ type: 'update', symbol: 42, status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { bogus: true } });
    subs[0].onPayload({ type: 'bogus' });

    expect(currentRuns().has('NVDA')).toBe(false);
    off();
  });

  it('ignores non-running and incomplete statuses in the init snapshot', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({
      type: 'init',
      runs: [
        { symbol: 'NVDA', status: { running: false } },
        { symbol: 'MU', status: { running: true } },
      ],
    });

    expect(currentRuns().size).toBe(0);
    expect(store.getLatestAnalystRunEvent('NVDA')).toMatchObject({ running: false });
    expect(store.getLatestAnalystRunEvent('NVDA')?.revision).toBeGreaterThan(0);
    expect(store.getLatestAnalystRunEvent('MU')).toBeNull();
    off();
  });

  it('subscribes the channel lazily on first listener and unsubscribes on last detach', () => {
    expect(subscribeChannel).not.toHaveBeenCalled();

    const offA = store.subscribeAnalystRuns(vi.fn());
    expect(subscribeChannel).toHaveBeenCalledTimes(1);
    expect(subs[0].spec).toEqual({ kind: 'analyst-runs' });

    const offB = store.subscribeAnalystRuns(vi.fn());
    expect(subscribeChannel).toHaveBeenCalledTimes(1);

    offA();
    expect(subs[0].unsub).not.toHaveBeenCalled();

    offB();
    expect(subs[0].unsub).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while a status selector is disabled', () => {
    const { rerender } = renderHook(({ enabled }) => store.useAnalystRunStatus('NVDA', enabled), {
      initialProps: { enabled: false },
    });

    expect(subscribeChannel).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(subscribeChannel).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    expect(subs[0].unsub).toHaveBeenCalledTimes(1);
  });

  it('keeps NVDA selector snapshots stable when MU changes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return {
        indicator: store.useAnalystRunIndicator('NVDA'),
        status: store.useAnalystRunStatus('NVDA'),
      };
    });
    const initialIndicator = result.current.indicator;
    const rendersBeforeUpdate = renders;

    act(() => {
      subs[0].onPayload({ type: 'update', symbol: 'MU', status: running('writing') });
    });

    expect(result.current.status).toBeNull();
    expect(result.current.indicator).toBe(initialIndicator);
    expect(renders).toBe(rendersBeforeUpdate);
    expect(subscribeChannel).toHaveBeenCalledTimes(1);
  });

  it('returns stable indicator tuples for the selected symbol', () => {
    store.setActiveSymbol('MU');
    const { result } = renderHook(() => store.useAnalystRunIndicator('NVDA'));
    expect(result.current).toEqual([false, false]);

    act(() => {
      subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    });
    expect(result.current).toEqual([true, false]);

    act(() => {
      subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });
    });
    expect(result.current).toEqual([false, true]);

    act(() => store.setActiveSymbol('NVDA'));
    expect(result.current).toEqual([false, false]);
  });

  it('marks unseen for a run that ended during a disconnect window, on next init', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'init', runs: [{ symbol: 'NVDA', status: running('preparing') }] });
    expect(currentRuns().has('NVDA')).toBe(true);

    subs[0].onPayload({ type: 'init', runs: [] });

    expect(currentRuns().has('NVDA')).toBe(false);
    expect(currentUnseen().has('NVDA')).toBe(true);
    off();
  });

  it('does not mark unseen on init-diff when the active symbol matches the vanished run', () => {
    store.setActiveSymbol('NVDA');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'init', runs: [{ symbol: 'NVDA', status: running('preparing') }] });

    subs[0].onPayload({ type: 'init', runs: [] });

    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('does not mark unseen on init-diff when no active symbol is set', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'init', runs: [{ symbol: 'NVDA', status: running('preparing') }] });

    subs[0].onPayload({ type: 'init', runs: [] });

    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('clears runs without fabricating unseen when the channel disconnects', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    expect(currentRuns().has('NVDA')).toBe(true);
    const eventBeforeDisconnect = store.getLatestAnalystRunEvent('NVDA');

    subs[0].onConnected(false);

    expect(currentRuns().has('NVDA')).toBe(false);
    expect(currentUnseen().has('NVDA')).toBe(false);
    expect(store.getLatestAnalystRunEvent('NVDA')).toBe(eventBeforeDisconnect);
    off();
  });

  it('marks unseen on reconnect init when a disconnected run never comes back', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onConnected(false);
    expect(currentUnseen().has('NVDA')).toBe(false);

    subs[0].onConnected(true);
    subs[0].onPayload({ type: 'init', runs: [] });

    expect(currentRuns().has('NVDA')).toBe(false);
    expect(currentUnseen().has('NVDA')).toBe(true);
    off();
  });

  it('re-adds a still-running symbol on reconnect init without marking it unseen', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onConnected(false);

    subs[0].onConnected(true);
    subs[0].onPayload({ type: 'init', runs: [{ symbol: 'NVDA', status: running('writing') }] });

    expect(currentRuns().has('NVDA')).toBe(true);
    expect(currentUnseen().has('NVDA')).toBe(false);
    off();
  });

  it('clears runs (but keeps unseen) when the last listener detaches', () => {
    store.setActiveSymbol('MU');
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });
    subs[0].onPayload({ type: 'update', symbol: 'AMD', status: running('writing') });
    subs[0].onPayload({ type: 'update', symbol: 'AMD', status: { running: false } });
    expect(currentUnseen().has('AMD')).toBe(true);

    off();

    expect(currentRuns().has('NVDA')).toBe(false);
    expect(currentUnseen().has('AMD')).toBe(true);
  });

  it('carries activities and sections from an update payload', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在读 5 分钟 K 线' }];
    const sections = { technical: { trends: [], levels: [], summary: '摘要' } };
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities, sections }),
    });

    const status = store.getAnalystRunStatus('NVDA');
    expect(status?.activities).toEqual(activities);
    expect(status?.sections).toEqual(sections);
    off();
  });

  it('normalizes missing activities/sections to empty array/object on update', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('researching') });

    const status = store.getAnalystRunStatus('NVDA');
    expect(status?.activities).toEqual([]);
    expect(status?.sections).toEqual({});
    off();
  });

  it('hydrates activities/sections from the init payload', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在查 NVDA 新闻' }];
    const sections = { context: { summary: '消息面平淡', bias: 'neutral' as const } };
    subs[0].onPayload({
      type: 'init',
      runs: [{ symbol: 'NVDA', status: running('writing', { activities, sections }) }],
    });

    const status = store.getAnalystRunStatus('NVDA');
    expect(status?.activities).toEqual(activities);
    expect(status?.sections).toEqual(sections);
    off();
  });

  it('normalizes missing activities/sections to empty array/object on init', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({
      type: 'init',
      runs: [{ symbol: 'NVDA', status: running('writing') }],
    });

    const status = store.getAnalystRunStatus('NVDA');
    expect(status?.activities).toEqual([]);
    expect(status?.sections).toEqual({});
    off();
  });

  it('retains lastEnded content when a run with activities/sections ends', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在读 5 分钟 K 线' }];
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities }),
    });

    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    const lastEnded = store.getAnalystRunLastEnded('NVDA');
    expect(lastEnded).not.toBeNull();
    expect(lastEnded?.activities).toEqual(activities);
    expect(lastEnded?.sections).toEqual({});
    expect(lastEnded?.startedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(typeof lastEnded?.endedAt).toBe('string');
    off();
  });

  it('retains lastEnded content when a run ends with only sections (no activities)', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const sections = { context: { summary: '消息面平淡', bias: 'neutral' as const } };
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { sections }),
    });

    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    const lastEnded = store.getAnalystRunLastEnded('NVDA');
    expect(lastEnded).not.toBeNull();
    expect(lastEnded?.activities).toEqual([]);
    expect(lastEnded?.sections).toEqual(sections);
    expect(lastEnded?.startedAt).toBe('2026-07-16T00:00:00.000Z');
    off();
  });

  it('does not retain lastEnded when a run ends with no activities or sections', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('researching') });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });

    expect(store.getAnalystRunLastEnded('NVDA')).toBeNull();
    off();
  });

  it('retains lastEnded content when a reconnect init omits a running symbol', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在读 5 分钟 K 线' }];
    const sections = { technical: { trends: [], levels: [], summary: '摘要' } };
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities, sections }),
    });

    subs[0].onPayload({ type: 'init', runs: [] });

    const lastEnded = store.getAnalystRunLastEnded('NVDA');
    expect(lastEnded).not.toBeNull();
    expect(lastEnded?.activities).toEqual(activities);
    expect(lastEnded?.sections).toEqual(sections);
    expect(lastEnded?.startedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(currentRuns().has('NVDA')).toBe(false);
    off();
  });

  it('retains lastEnded content when a reconnect init lists the symbol as running:false', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在读 5 分钟 K 线' }];
    const sections = { technical: { trends: [], levels: [], summary: '摘要' } };
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities, sections }),
    });

    subs[0].onPayload({
      type: 'init',
      runs: [{ symbol: 'NVDA', status: { running: false } }],
    });

    const lastEnded = store.getAnalystRunLastEnded('NVDA');
    expect(lastEnded).not.toBeNull();
    expect(lastEnded?.activities).toEqual(activities);
    expect(lastEnded?.sections).toEqual(sections);
    expect(lastEnded?.startedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(currentRuns().has('NVDA')).toBe(false);
    off();
  });

  it('does not retain lastEnded when a reconnect init still lists the symbol as running', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在读 5 分钟 K 线' }];
    const sections = { technical: { trends: [], levels: [], summary: '摘要' } };
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities, sections }),
    });

    subs[0].onPayload({
      type: 'init',
      runs: [{ symbol: 'NVDA', status: running('writing') }],
    });

    expect(store.getAnalystRunLastEnded('NVDA')).toBeNull();
    expect(currentRuns().has('NVDA')).toBe(true);
    off();
  });

  it('clears lastEnded for a symbol when a new run starts, leaving other symbols untouched', () => {
    const off = store.subscribeAnalystRuns(vi.fn());
    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在查新闻' }];
    subs[0].onPayload({
      type: 'update',
      symbol: 'NVDA',
      status: running('researching', { activities }),
    });
    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });
    subs[0].onPayload({
      type: 'update',
      symbol: 'MU',
      status: running('researching', { activities }),
    });
    subs[0].onPayload({ type: 'update', symbol: 'MU', status: { running: false } });

    expect(store.getAnalystRunLastEnded('NVDA')).not.toBeNull();
    expect(store.getAnalystRunLastEnded('MU')).not.toBeNull();

    subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: running('preparing') });

    expect(store.getAnalystRunLastEnded('NVDA')).toBeNull();
    expect(store.getAnalystRunLastEnded('MU')).not.toBeNull();
    off();
  });

  it('exposes lastEnded reactively via useAnalystRunLastEnded', () => {
    const { result } = renderHook(() => store.useAnalystRunLastEnded('NVDA'));
    expect(result.current).toBeNull();

    const activities = [{ at: '2026-07-16T00:00:01.000Z', text: '正在查新闻' }];
    act(() => {
      subs[0].onPayload({
        type: 'update',
        symbol: 'NVDA',
        status: running('researching', { activities }),
      });
      subs[0].onPayload({ type: 'update', symbol: 'NVDA', status: { running: false } });
    });

    expect(result.current?.activities).toEqual(activities);
  });
});
