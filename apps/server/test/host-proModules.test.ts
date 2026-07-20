import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Controller, Get, Module } from '@tsuki-hono/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetProChannelsForTests } from '@kansoku/core/pro/channels';
import { resetProHooksForTests } from '@kansoku/core/pro/hooks';
import { setProPresent } from '@kansoku/core/pro/bundleState';
import { setAiRuntimeForTests } from '@kansoku/core/ai/initAiSettings';
import { setModelsRuntimeForTests } from '@kansoku/core/ai/modelsRuntime';
import { setLicenseManagerForTests } from '@kansoku/core/license/licenseState';

// Regression coverage for defect 1: a Tsuki module owned by the pro
// composition — not a core route gated through registerProHooks — must
// actually be mounted into the Nest-style app the standalone server serves.
// apps/server/test/proPresent.test.ts only exercises core routes gated by
// hooks, which is exactly why it never caught the module list being dropped
// on the floor between initServerRuntime() and createKernel().
@Controller('pro-probe')
class FakeProProbeController {
  @Get('ping')
  ping() {
    return { probed: true };
  }
}

@Module({ controllers: [FakeProProbeController] })
class FakeProProbeModule {}

vi.mock('@kansoku/core/ai/comments', () => ({
  onComment: vi.fn(() => () => {}),
  listComments: vi.fn(async () => []),
  appendComment: vi.fn(),
}));
vi.mock('@kansoku/core/ai/chat', () => ({
  onChatEvent: vi.fn(),
  chatTurnState: vi.fn(),
}));
vi.mock('@kansoku/core/realtime/analyses', () => ({ subscribeAnalyses: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/benchmark', () => ({ subscribeBenchmark: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/board', () => ({ subscribeBoard: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/charts', () => ({ subscribeChart: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/position', () => ({ subscribePosition: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/quotes', () => ({ subscribeQuotes: vi.fn(() => () => {}) }));

const loadProComposition = vi.hoisted(() =>
  vi.fn(async () => ({
    modules: [FakeProProbeModule],
    realtimeChannels: [],
    start: vi.fn(),
    dispose: vi.fn(),
  })),
);
vi.mock('../src/edition/pro.js', () => ({ loadProComposition }));

const { initServerRuntime } = await import('../src/runtimeInit.js');
const { startHost } = await import('../src/host.js');

describe('standalone server mounts the pro composition modules', () => {
  let server: Server;
  let baseUrl: string;

  afterEach(() => {
    setProPresent(false);
    resetProHooksForTests();
    resetProChannelsForTests();
    setLicenseManagerForTests(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeAll(async () => {
    const proComposition = await initServerRuntime();
    const handle = await startHost(0, false, proComposition?.modules ?? []);
    server = handle.server;
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  it('routes a pro-module-owned endpoint through the real host, not 404', async () => {
    const res = await fetch(`${baseUrl}/api/pro-probe/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ probed: true });
  });
});
