import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) =>
    descriptor,
  IpcService: class {},
}));

const overview = vi.hoisted(() => ({ usage: vi.fn() }));
const settings = vi.hoisted(() => ({ getAi: vi.fn() }));
const symbols = vi.hoisted(() => ({
  reassess: vi.fn(),
  reassessStatus: vi.fn(),
  deepDive: vi.fn(),
  deepDiveStatus: vi.fn(),
  explain: vi.fn(),
}));

vi.mock('@kansoku/core/overview/overview.service', () => ({ overviewService: overview }));
vi.mock('@kansoku/core/settings/settings.service', () => ({ settingsService: settings }));
vi.mock('@kansoku/core/symbols/symbols.service', () => ({ symbolsService: symbols }));

const { OverviewIpc } = await import('@desktop/kernel/ipc/overviewIpc.js');
const { SettingsIpc } = await import('@desktop/kernel/ipc/settingsIpc.js');
const { SymbolsIpc } = await import('@desktop/kernel/ipc/symbolsIpc.js');
const { setProPresent } = await import('@kansoku/core/pro/bundleState');

beforeEach(() => {
  setProPresent(false);
  overview.usage.mockReset().mockResolvedValue({
    date: '2026-07-18',
    runs: 0,
    calls: 0,
    total_tokens: 0,
    cost_total: 0,
    by_layer: {},
  });
  settings.getAi.mockReset().mockResolvedValue({ roles: {}, credentials: [], masterKey: 'ready' });
  symbols.reassess
    .mockReset()
    .mockResolvedValue({ started: false, reason: 'analyst layer disabled' });
  symbols.reassessStatus.mockReset().mockResolvedValue({ running: false });
  symbols.explain.mockReset().mockResolvedValue({ ok: false, reason: 'disabled' });
});

describe('desktop AI IPC parity with pro absent', () => {
  it('serves overview.usage without a pro gate', async () => {
    const result = await new OverviewIpc().usage({ date: '2026-07-18' });
    expect(result.ok).toBe(true);
    expect(symbols.deepDive).not.toHaveBeenCalled();
    expect(overview.usage).toHaveBeenCalledWith({ date: '2026-07-18' });
  });

  it('serves settings.getAi without a pro gate', async () => {
    const result = await new SettingsIpc().getAi();
    expect(result.ok).toBe(true);
    expect(settings.getAi).toHaveBeenCalled();
  });

  it('serves symbols.reassess and reassessStatus without a pro gate', async () => {
    const reassess = await new SymbolsIpc().reassess({ sym: 'MU' });
    expect(reassess).toEqual({
      ok: true,
      data: { started: false, reason: 'analyst layer disabled' },
    });
    const status = await new SymbolsIpc().reassessStatus({ sym: 'MU' });
    expect(status).toEqual({ ok: true, data: { running: false } });
  });

  it('serves symbols.deepDive and deepDiveStatus without a host-level pro gate', async () => {
    symbols.deepDive.mockResolvedValue({ started: false, reason: 'disabled' });
    symbols.deepDiveStatus.mockResolvedValue({ running: false });
    const deepDive = await new SymbolsIpc().deepDive({ sym: 'MU' });
    expect(deepDive).toEqual({ ok: true, data: { started: false, reason: 'disabled' } });
    const status = await new SymbolsIpc().deepDiveStatus({ sym: 'MU' });
    expect(status).toEqual({ ok: true, data: { running: false } });
  });

  it('serves symbols.explain without a pro gate', async () => {
    const comment = {
      ts: '2026-07-24T14:00:00.000Z',
      symbol: 'MU.US',
      level: 'info',
      text: '图上有什么……一句话结论：不构成动作。',
      stance: 'no_action',
      trigger: 'manual: 解读请求',
      source: 'explainer',
    };
    symbols.explain.mockResolvedValue({ ok: true, comment });
    const result = await new SymbolsIpc().explain({ sym: 'MU' });
    expect(result).toEqual({ ok: true, data: { ok: true, comment } });
    expect(symbols.explain).toHaveBeenCalledWith({ sym: 'MU' });
  });
});
