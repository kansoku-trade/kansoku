import { afterEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import type { EventSourceAdapter } from '../src/events/registry.js';
import { createEventRuntime } from '../src/events/runtime.js';
import { readSourceState, saveSourceState } from '../src/events/store.js';

const open: Db[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
});

describe('source state disabledReason', () => {
  it('persists a reason for being off separately from the last error', async () => {
    const handle = db();
    await saveSourceState(
      {
        source: 'sec-edgar',
        health: 'disabled',
        disabledReason: 'SEC_USER_AGENT is not set',
        lastError: null,
      },
      handle,
    );

    const state = await readSourceState('sec-edgar', handle);
    expect(state?.health).toBe('disabled');
    expect(state?.disabledReason).toBe('SEC_USER_AGENT is not set');
    expect(state?.lastError).toBeNull();
  });

  it('keeps the reason while a later failure writes only lastError', async () => {
    const handle = db();
    await saveSourceState(
      { source: 'fed-monetary', health: 'disabled', disabledReason: 'switched off' },
      handle,
    );
    await saveSourceState({ source: 'fed-monetary', lastError: 'boom' }, handle);

    const state = await readSourceState('fed-monetary', handle);
    expect(state?.disabledReason).toBe('switched off');
    expect(state?.lastError).toBe('boom');
  });

  it('clears the reason when a source comes back on', async () => {
    const handle = db();
    await saveSourceState(
      { source: 'bls-rss', health: 'disabled', disabledReason: 'off' },
      handle,
    );
    await saveSourceState({ source: 'bls-rss', health: 'active', disabledReason: null }, handle);

    const state = await readSourceState('bls-rss', handle);
    expect(state?.disabledReason).toBeNull();
  });
});

describe('runtime disabled bookkeeping', () => {
  const disabled: EventSourceAdapter = {
    disabledReason: 'SEC_USER_AGENT is not set',
    enabled: false,
    intervalMs: 1000,
    poll: () => Promise.reject(new Error('should not be polled')),
    source: 'sec-edgar',
  };

  it('records the reason in its own field rather than as an error', async () => {
    const handle = db();
    const runtime = createEventRuntime({ adapters: [disabled], db: handle });
    await runtime.start();

    const state = await readSourceState('sec-edgar', handle);
    expect(state?.health).toBe('disabled');
    expect(state?.disabledReason).toBe('SEC_USER_AGENT is not set');
    // A source that is off on purpose has not failed, so the error column must stay
    // empty: the UI reads it as "something broke".
    expect(state?.lastError).toBeNull();
    await runtime.stop();
  });

  it('keeps the reason across repeated starts while the credential is still missing', async () => {
    const handle = db();
    const runtime = createEventRuntime({ adapters: [disabled], db: handle });
    await runtime.start();
    await runtime.start();

    const state = await readSourceState('sec-edgar', handle);
    expect(state?.disabledReason).toBe('SEC_USER_AGENT is not set');
    await runtime.stop();
  });
});

describe('a source that comes back drops its reason for being off', () => {
  const WAS_OFF = { source: 'sec-edgar', health: 'disabled' as const, disabledReason: 'SEC_USER_AGENT is not set' };

  function polling(poll: () => Promise<{ drafts: never[]; cursor?: string }>): EventSourceAdapter {
    return { intervalMs: 60_000, poll, source: 'sec-edgar' };
  }

  it('clears it on a successful poll', async () => {
    const handle = db();
    await saveSourceState(WAS_OFF, handle);
    const runtime = createEventRuntime({
      adapters: [polling(async () => ({ cursor: 'a', drafts: [] }))],
      db: handle,
    });

    await runtime.pollOnce('sec-edgar');

    const state = await readSourceState('sec-edgar', handle);
    expect(state?.health).toBe('active');
    // Still saying "SEC_USER_AGENT is not set" next to a source that just polled is
    // worse than saying nothing: the operator goes looking for a setting that is fine.
    expect(state?.disabledReason).toBeNull();
  });

  it('clears it on a heartbeat poll that found no events', async () => {
    const handle = db();
    await saveSourceState(WAS_OFF, handle);
    const runtime = createEventRuntime({
      adapters: [polling(async () => ({ drafts: [] }))],
      db: handle,
    });

    await runtime.pollOnce('sec-edgar');

    expect((await readSourceState('sec-edgar', handle))?.disabledReason).toBeNull();
  });

  it('clears it when the source is on but failing', async () => {
    const handle = db();
    await saveSourceState(WAS_OFF, handle);
    const runtime = createEventRuntime({
      adapters: [
        polling(async () => {
          throw new Error('sec unreachable');
        }),
      ],
      db: handle,
    });

    await runtime.pollOnce('sec-edgar');

    const state = await readSourceState('sec-edgar', handle);
    // Enabled and broken is a different state from switched off, and the two must not
    // be readable at the same time.
    expect(state?.health).toBe('active');
    expect(state?.lastError).toMatch(/sec unreachable/);
    expect(state?.disabledReason).toBeNull();
  });

  it('clears it once a failing source has degraded', async () => {
    const handle = db();
    await saveSourceState(WAS_OFF, handle);
    const runtime = createEventRuntime({
      adapters: [
        polling(async () => {
          throw new Error('sec unreachable');
        }),
      ],
      db: handle,
    });

    await runtime.pollOnce('sec-edgar');
    await runtime.pollOnce('sec-edgar');

    const state = await readSourceState('sec-edgar', handle);
    expect(state?.health).toBe('degraded');
    expect(state?.disabledReason).toBeNull();
  });

  it('clears it when a subscription attaches', async () => {
    const handle = db();
    await saveSourceState({ ...WAS_OFF, source: 'kernel-triggers' }, handle);
    const runtime = createEventRuntime({
      adapters: [
        {
          intervalMs: 5000,
          source: 'kernel-triggers',
          subscribe: () => () => {},
        },
      ],
      db: handle,
    });

    await runtime.startSource('kernel-triggers');
    await new Promise((resolve) => setTimeout(resolve, 5));

    const state = await readSourceState('kernel-triggers', handle);
    expect(state?.health).toBe('active');
    expect(state?.disabledReason).toBeNull();
    await runtime.stop();
  });

  it('clears it when a pushed heartbeat arrives on a stream', async () => {
    const handle = db();
    await saveSourceState({ ...WAS_OFF, source: 'kernel-triggers' }, handle);
    let emit: ((result: { drafts: never[] }) => void) | undefined;
    const runtime = createEventRuntime({
      adapters: [
        {
          intervalMs: 5000,
          source: 'kernel-triggers',
          subscribe: (ctx) => {
            emit = ctx.emit as typeof emit;
            return () => {};
          },
        },
      ],
      db: handle,
    });

    await runtime.startSource('kernel-triggers');
    emit!({ drafts: [] });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await readSourceState('kernel-triggers', handle))?.disabledReason).toBeNull();
    await runtime.stop();
  });
});
