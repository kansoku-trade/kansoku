import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, Module } from '@tsuki-hono/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setModelsRuntimeForTests } from '@kansoku/core/ai/modelsRuntime';
import { BaseServerEdition } from '@kansoku/core/edition/base';
import { createDefaultServerEditionHost } from '@kansoku/core/edition/host';
import type { ServerBuilder } from '@kansoku/core/edition/serverBuilder';
import type { EditionActivation } from '@kansoku/core/pro/editionLoader';
import { freeHooks, registerProModule, unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { resetProtocolClaimForTests } from '@kansoku/core/pro/protocolClaim';
import { createKernel } from '../src/bootstrap.js';

vi.mock('@kansoku/core/pro/editionLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kansoku/core/pro/editionLoader')>();
  return { ...actual, loadEdition: vi.fn(actual.loadEdition) };
});

vi.mock('@kansoku/core/pro/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kansoku/core/pro/loader')>();
  return { ...actual, loadPro: vi.fn(actual.loadPro) };
});

const { initServerRuntime } = await import('../src/runtimeInit.js');
const { registerShutdownHandlers } = await import('../src/shutdown.js');
const { LegacyCompatServerEdition } = await import('../src/modules/legacyServerEdition.js');
const { loadEdition } = await import('@kansoku/core/pro/editionLoader');
const { loadPro } = await import('@kansoku/core/pro/loader');

@Controller('edition-active-probe')
class ActiveProbeController {
  @Get('/ping')
  ping() {
    return { pong: true };
  }
}

@Module({ controllers: [ActiveProbeController] })
class ActiveProbeModule {}

class ActiveProbeEdition extends BaseServerEdition {
  override configureServer(builder: ServerBuilder): void {
    super.configureServer(builder);
    builder.addModule(ActiveProbeModule);
  }
}

let tmpAppDir: string;

beforeEach(() => {
  tmpAppDir = mkdtempSync(join(tmpdir(), 'kansoku-server-edition-lifecycle-'));
  vi.mocked(loadEdition).mockClear();
  vi.mocked(loadPro).mockClear();
});

afterEach(() => {
  rmSync(tmpAppDir, { recursive: true, force: true });
  unregisterProModuleForTests();
  resetProtocolClaimForTests();
  setModelsRuntimeForTests(null);
});

describe('initServerRuntime: loadEdition-first with legacy fallback', () => {
  it('absent pro.enc falls through to LegacyCompatServerEdition, and its full lifecycle resolves cleanly', async () => {
    const { edition } = await initServerRuntime({ proAppDir: tmpAppDir });

    expect(edition).toBeInstanceOf(LegacyCompatServerEdition);
    await expect(edition.initialize()).resolves.toBeUndefined();
    await expect(edition.start()).resolves.toBeUndefined();
    await expect(edition.dispose()).resolves.toBeUndefined();
  });

  it('absent pro.enc: legacy edition starts the pro scheduler on start() and stops it on dispose()', async () => {
    const stopScheduler = vi.fn();
    const startScheduler = vi.fn(() => stopScheduler);
    registerProModule({ hooks: freeHooks, startScheduler });

    const { edition } = await initServerRuntime({ proAppDir: tmpAppDir });

    await edition.initialize();
    expect(startScheduler).not.toHaveBeenCalled();

    await edition.start();
    expect(startScheduler).toHaveBeenCalledTimes(1);
    expect(stopScheduler).not.toHaveBeenCalled();

    await edition.dispose();
    expect(stopScheduler).toHaveBeenCalledTimes(1);
  });

  const noBundleStates = ['absent', 'locked'] as const;

  for (const state of noBundleStates) {
    it(`state=${state} falls back to loadPro + LegacyCompatServerEdition, and reports protocol="legacy"`, async () => {
      vi.mocked(loadEdition).mockResolvedValueOnce({
        state,
        bundlePresent: state !== 'absent',
      } as EditionActivation<BaseServerEdition>);
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const { edition, protocol } = await initServerRuntime({ proAppDir: tmpAppDir });

      expect(edition).toBeInstanceOf(LegacyCompatServerEdition);
      expect(protocol).toBe('legacy');
      expect(loadPro).toHaveBeenCalledTimes(1);
      const logLine = infoSpy.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('[edition]'));
      expect(logLine).toContain('runtime=server');
      expect(logLine).toContain(`state=${state}`);

      infoSpy.mockRestore();
    });
  }

  const rejectedBundleStates = ['incompatible', 'failed'] as const;

  for (const state of rejectedBundleStates) {
    it(`state=${state} (bundle present but rejected) never calls loadPro, runs free via LegacyCompatServerEdition, and reports protocol="legacy"`, async () => {
      vi.mocked(loadEdition).mockResolvedValueOnce({
        state,
        bundlePresent: true,
        error: { code: 'PRO_EDITION_ABI_MISMATCH', message: 'boom' },
      } as EditionActivation<BaseServerEdition>);
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { edition, protocol } = await initServerRuntime({ proAppDir: tmpAppDir });

      expect(edition).toBeInstanceOf(LegacyCompatServerEdition);
      expect(protocol).toBe('legacy');
      expect(loadPro).not.toHaveBeenCalled();
      const logLine = infoSpy.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('[edition]'));
      expect(logLine).toContain('runtime=server');
      expect(logLine).toContain(`state=${state}`);
      const errorLine = errorSpy.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('[edition]'));
      expect(errorLine).toContain(`state=${state}`);
      expect(errorLine).toContain('free mode');

      infoSpy.mockRestore();
      errorSpy.mockRestore();
    });
  }

  it('dev-source boot (pro.enc absent, apps/pro slot present as plaintext): a second loadEdition() call for another runtime after the legacy claim throws a protocol conflict — proving why bootKernel() must gate its desktop loadEdition() call on protocol === "edition"', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const desktopAppDir = join(tmpAppDir, 'app');
    mkdirSync(desktopAppDir, { recursive: true });
    const proSrcDir = join(tmpAppDir, 'pro', 'src');
    mkdirSync(proSrcDir, { recursive: true });
    writeFileSync(join(proSrcDir, 'index.js'), 'export default { hooks: {} };\n');

    const { protocol } = await initServerRuntime({ proAppDir: desktopAppDir });
    expect(protocol).toBe('legacy');

    const { encPath, virtualDir } = (await import('../src/proEncLayout.js')).serverEncLayout(
      desktopAppDir,
    );
    await expect(
      loadEdition({ encPath, virtualDir, runtime: 'desktop', keyHex: null, host: {} }),
    ).rejects.toThrow(/pro protocol conflict/);
  });

  it('state=active returns the edition constructed by loadEdition, and never calls loadPro', async () => {
    const fakeEdition = { kind: 'fake-pro-edition' } as unknown as BaseServerEdition;
    vi.mocked(loadEdition).mockResolvedValueOnce({
      state: 'active',
      bundlePresent: true,
      keyId: 'test-key',
      buildId: 'test-build',
      edition: fakeEdition,
    } as EditionActivation<BaseServerEdition>);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { edition, protocol } = await initServerRuntime({ proAppDir: tmpAppDir });

    expect(edition).toBe(fakeEdition);
    expect(protocol).toBe('edition');
    expect(loadPro).not.toHaveBeenCalled();
    const logLine = infoSpy.mock.calls.map((args) => String(args[0])).find((line) => line.startsWith('[edition]'));
    expect(logLine).toContain('buildId=test-build');
    expect(logLine).toContain('keyId=test-key');
    expect(logLine).toContain('state=active');
    expect(logLine).toContain('code=n/a');

    infoSpy.mockRestore();
  });

  it('state=active: the returned edition composes into a kernel whose route is reachable over HTTP', async () => {
    vi.mocked(loadEdition).mockResolvedValueOnce({
      state: 'active',
      bundlePresent: true,
      keyId: 'test-key',
      buildId: 'test-build',
      edition: new ActiveProbeEdition(createDefaultServerEditionHost()),
    } as EditionActivation<BaseServerEdition>);

    const { edition } = await initServerRuntime({ proAppDir: tmpAppDir });
    expect(loadPro).not.toHaveBeenCalled();

    const { app } = await createKernel(edition);
    const res = await app.getInstance().request('/api/edition-active-probe/ping');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });
});

describe('registerShutdownHandlers', () => {
  function fakeProcess(): NodeJS.Process {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { exit: vi.fn() }) as unknown as NodeJS.Process;
  }

  it('disposes exactly once on SIGTERM, then exits', async () => {
    const proc = fakeProcess();
    const dispose = vi.fn().mockResolvedValue(undefined);
    const edition = { dispose } as unknown as BaseServerEdition;

    registerShutdownHandlers(edition, proc);
    proc.emit('SIGTERM');

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
  });

  it('disposes exactly once on SIGINT, then exits', async () => {
    const proc = fakeProcess();
    const dispose = vi.fn().mockResolvedValue(undefined);
    const edition = { dispose } as unknown as BaseServerEdition;

    registerShutdownHandlers(edition, proc);
    proc.emit('SIGINT');

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
  });
});
