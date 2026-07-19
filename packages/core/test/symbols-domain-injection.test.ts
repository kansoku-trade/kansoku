import { promises as fs } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepDiveStartResult, DeepDiveState } from '@kansoku/pro-api';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}symbols-domain-injection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('../src/env.js', () => ({ CHART_DATA_DIR: ctx.dir, JOURNAL_DIR: ctx.dir, STOCKS_DIR: ctx.dir }));

const { createSymbolsService } = await import('../src/modules/symbols/symbols.service.js');
const { DisabledDeepDiveService, DisabledFollowAutomation } = await import(
  '../src/pro/domain/defaultImplementations.js'
);
const { freeHooks, registerProModule, unregisterProModuleForTests } = await import(
  '../src/pro/registry.js'
);
type DeepDiveService = InstanceType<typeof DisabledDeepDiveService>;
type FollowAutomation = InstanceType<typeof DisabledFollowAutomation>;

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.KANSOKU_LICENSE_BYPASS = '1';
  registerProModule({ hooks: freeHooks });
});

afterEach(() => {
  unregisterProModuleForTests();
  delete process.env.KANSOKU_LICENSE_BYPASS;
});

class FakeFollowAutomation implements FollowAutomation {
  calls: string[] = [];

  requestImmediateFollow(symbol: string): void {
    this.calls.push(symbol);
  }
}

class FakeDeepDiveService implements DeepDiveService {
  startDeepDiveForNote(note: string): DeepDiveStartResult {
    return { started: true, note } as unknown as DeepDiveStartResult;
  }

  deepDiveStatus(): DeepDiveState {
    return { running: true, symbol: 'MU.US' } as unknown as DeepDiveState;
  }
}

describe('createSymbolsService with hand-written fakes', () => {
  it('calls requestImmediateFollow once when transitioning not-following -> following', async () => {
    const follow = new FakeFollowAutomation();
    const service = createSymbolsService({
      followAutomation: follow,
      deepDiveService: new FakeDeepDiveService(),
    });

    await service.startFollow({ sym: 'TESTA.US' });
    expect(follow.calls).toEqual(['TESTA.US']);

    await service.stopFollow({ sym: 'TESTA.US' });
  });

  it('does not call requestImmediateFollow when already following', async () => {
    const follow = new FakeFollowAutomation();
    const service = createSymbolsService({
      followAutomation: follow,
      deepDiveService: new FakeDeepDiveService(),
    });

    await service.startFollow({ sym: 'TESTB.US' });
    follow.calls = [];
    await service.startFollow({ sym: 'TESTB.US' });
    expect(follow.calls).toEqual([]);

    await service.stopFollow({ sym: 'TESTB.US' });
  });

  it('deepDive/deepDiveStatus return exactly what the fake DeepDiveService returns', async () => {
    const service = createSymbolsService({
      followAutomation: new FakeFollowAutomation(),
      deepDiveService: new FakeDeepDiveService(),
    });

    const deepDiveResult = await service.deepDive({ sym: 'TESTC.US' });
    expect(deepDiveResult).toEqual({ started: true, note: 'TESTC' });

    const statusResult = await service.deepDiveStatus({ sym: 'TESTC.US' });
    expect(statusResult).toEqual({ running: true, symbol: 'MU.US' });
  });
});

describe('createSymbolsService with free-mode defaults (Disabled*)', () => {
  const service = createSymbolsService({
    followAutomation: new DisabledFollowAutomation(),
    deepDiveService: new DisabledDeepDiveService(),
  });

  it('deepDive returns the disabled result', async () => {
    expect(await service.deepDive({ sym: 'TESTD.US' })).toEqual({
      started: false,
      reason: 'disabled',
    });
  });

  it('deepDiveStatus returns the disabled result', async () => {
    expect(await service.deepDiveStatus({ sym: 'TESTD.US' })).toEqual({ running: false });
  });

  it('startFollow does not throw and returns the follow state with no side effects', async () => {
    await expect(service.startFollow({ sym: 'TESTE.US' })).resolves.toEqual({
      symbol: 'TESTE.US',
      following: true,
      startedAt: expect.any(String),
    });

    await service.stopFollow({ sym: 'TESTE.US' });
  });
});
