import { describe, expect, it } from 'vitest';
import { BaseDesktopEdition, BaseEdition, BaseServerEdition } from '../src/edition/base.js';
import type {
  CoreEditionHost,
  DesktopEditionHost,
  ServerEditionHost,
} from '../src/edition/host.js';

function fakeHost(): CoreEditionHost {
  return {
    db: {} as unknown as CoreEditionHost['db'],
    license: { isLicensed: () => true },
    aiSettings: null,
    watchedMarkets: null,
    paths: { kansokuHome: '/tmp/kansoku-home' },
    production: false,
  };
}

class TestEdition extends BaseEdition<CoreEditionHost> {
  readonly calls: string[] = [];
  readonly runningThings: string[] = [];
  initFn: () => void | Promise<void> = () => {};
  startFn: () => void | Promise<void> = () => {};

  protected async onInitialize(): Promise<void> {
    await this.initFn();
    this.calls.push('init');
  }

  protected async onStart(): Promise<void> {
    await this.startFn();
    this.runningThings.push('scheduler');
    this.calls.push('start');
  }

  protected async onDispose(): Promise<void> {
    this.runningThings.length = 0;
    this.calls.push('dispose');
  }
}

describe('BaseEdition lifecycle', () => {
  it('runs the full legal sequence exactly once, in order', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await edition.start();
    await edition.dispose();
    expect(edition.calls).toEqual(['init', 'start', 'dispose']);
  });

  it('throws naming the edition class on a second initialize', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await expect(edition.initialize()).rejects.toThrow(/TestEdition/);
  });

  it('throws when start is called before initialize', async () => {
    const edition = new TestEdition(fakeHost());
    await expect(edition.start()).rejects.toThrow();
  });

  it('is a no-op the second time start is called after success', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await edition.start();
    await edition.start();
    expect(edition.calls.filter((call) => call === 'start')).toHaveLength(1);
  });

  it('calls onDispose once even when dispose is called twice', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await edition.start();
    await edition.dispose();
    await edition.dispose();
    expect(edition.calls.filter((call) => call === 'dispose')).toHaveLength(1);
  });

  it('throws when start is called after dispose', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await edition.dispose();
    await expect(edition.start()).rejects.toThrow();
  });

  it('allows dispose before start', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await expect(edition.dispose()).resolves.toBeUndefined();
    expect(edition.calls).toEqual(['init', 'dispose']);
  });

  it('allows retrying initialize after a failed onInitialize', async () => {
    const edition = new TestEdition(fakeHost());
    edition.initFn = () => {
      throw new Error('boom');
    };
    await expect(edition.initialize()).rejects.toThrow('boom');
    expect(edition.calls).toEqual([]);

    edition.initFn = () => {};
    await expect(edition.initialize()).resolves.toBeUndefined();
    expect(edition.calls).toEqual(['init']);
  });

  it('throws when initialize is called again after a successful dispose (single-use)', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();
    await edition.dispose();
    await expect(edition.initialize()).rejects.toThrow(/TestEdition/);
  });

  it('rejects a concurrent second initialize while the first is in flight, running onInitialize once', async () => {
    const edition = new TestEdition(fakeHost());
    let resolveInit: () => void = () => {};
    edition.initFn = () =>
      new Promise<void>((resolve) => {
        resolveInit = resolve;
      });

    const first = edition.initialize();
    const second = edition.initialize();

    await expect(second).rejects.toThrow(/TestEdition/);
    resolveInit();
    await expect(first).resolves.toBeUndefined();
    expect(edition.calls.filter((call) => call === 'init')).toHaveLength(1);
  });

  it('clears in-flight state after a failed initialize even when a concurrent call raced it, allowing retry', async () => {
    const edition = new TestEdition(fakeHost());
    edition.initFn = () => {
      throw new Error('boom');
    };

    const first = edition.initialize();
    const second = edition.initialize();

    await expect(second).rejects.toThrow(/TestEdition/);
    await expect(first).rejects.toThrow('boom');

    edition.initFn = () => {};
    await expect(edition.initialize()).resolves.toBeUndefined();
    expect(edition.calls).toEqual(['init']);
  });

  it('runs onStart once for concurrent start calls; both callers resolve with the same outcome', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();

    let resolveStart: () => void = () => {};
    edition.startFn = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });

    const first = edition.start();
    const second = edition.start();
    resolveStart();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(edition.calls.filter((call) => call === 'start')).toHaveLength(1);
  });

  it('clears in-flight state after a failed concurrent start, allowing retry', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();

    edition.startFn = () => {
      throw new Error('boom');
    };

    const first = edition.start();
    const second = edition.start();

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    expect(edition.calls.filter((call) => call === 'start')).toHaveLength(0);

    edition.startFn = () => {};
    await expect(edition.start()).resolves.toBeUndefined();
    expect(edition.calls.filter((call) => call === 'start')).toHaveLength(1);
  });

  it('dispose during a pending start awaits onStart before running onDispose, and stops what was started', async () => {
    const edition = new TestEdition(fakeHost());
    await edition.initialize();

    let resolveStart: () => void = () => {};
    edition.startFn = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });

    const startPromise = edition.start();
    const disposePromise = edition.dispose();

    expect(edition.calls).toEqual(['init']);
    resolveStart();

    await expect(startPromise).resolves.toBeUndefined();
    await expect(disposePromise).resolves.toBeUndefined();
    expect(edition.calls).toEqual(['init', 'start', 'dispose']);
    expect(edition.runningThings).toEqual([]);
  });

  it('dispose during a pending initialize awaits it (swallowing rejection) before running onDispose', async () => {
    const edition = new TestEdition(fakeHost());

    let rejectInit: (error: Error) => void = () => {};
    edition.initFn = () =>
      new Promise<void>((_, reject) => {
        rejectInit = reject;
      });

    const initPromise = edition.initialize();
    const disposePromise = edition.dispose();

    expect(edition.calls).toEqual([]);
    rejectInit(new Error('boom'));

    await expect(initPromise).rejects.toThrow('boom');
    await expect(disposePromise).resolves.toBeUndefined();
    expect(edition.calls).toEqual(['dispose']);
  });
});

describe('BaseServerEdition / BaseDesktopEdition', () => {
  it('narrow the host type without changing lifecycle behavior', async () => {
    class ServerTestEdition extends BaseServerEdition {
      ran = false;
      protected onInitialize(): void {
        this.ran = true;
      }
    }

    const serverHost = fakeHost() as ServerEditionHost;
    const serverEdition = new ServerTestEdition(serverHost);
    await serverEdition.initialize();
    expect(serverEdition.ran).toBe(true);

    class DesktopTestEdition extends BaseDesktopEdition {}

    const desktopHost: DesktopEditionHost = { ...fakeHost(), relaunch: () => {} };
    const desktopEdition = new DesktopTestEdition(desktopHost);
    await expect(desktopEdition.initialize()).resolves.toBeUndefined();
  });
});
