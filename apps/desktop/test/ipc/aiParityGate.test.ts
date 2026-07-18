import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

const overview = vi.hoisted(() => ({ usage: vi.fn() }));
const settings = vi.hoisted(() => ({ getAi: vi.fn() }));
const symbols = vi.hoisted(() => ({
  reassess: vi.fn(),
  reassessStatus: vi.fn(),
  deepDive: vi.fn(),
  deepDiveStatus: vi.fn(),
}));

vi.mock("@kansoku/core/modules/overview/overview.service", () => ({ overviewService: overview }));
vi.mock("@kansoku/core/modules/settings/settings.service", () => ({ settingsService: settings }));
vi.mock("@kansoku/core/modules/symbols/symbols.service", () => ({ symbolsService: symbols }));

const { OverviewIpc } = await import("@desktop/ipc/overviewIpc.js");
const { SettingsIpc } = await import("@desktop/ipc/settingsIpc.js");
const { SymbolsIpc } = await import("@desktop/ipc/symbolsIpc.js");
const { unregisterProModuleForTests } = await import("@kansoku/core/pro/registry");

beforeEach(() => {
  unregisterProModuleForTests();
  overview.usage.mockReset().mockResolvedValue({ date: "2026-07-18", runs: 0, calls: 0, total_tokens: 0, cost_total: 0, by_layer: {} });
  settings.getAi.mockReset().mockResolvedValue({ roles: {}, credentials: [], masterKey: "ready" });
  symbols.reassess.mockReset().mockResolvedValue({ started: false, reason: "analyst layer disabled" });
  symbols.reassessStatus.mockReset().mockResolvedValue({ running: false });
});

describe("desktop AI IPC parity with pro absent", () => {
  it("serves overview.usage without a pro gate", async () => {
    const result = await new OverviewIpc().usage({ date: "2026-07-18" });
    expect(result.ok).toBe(true);
    expect(symbols.deepDive).not.toHaveBeenCalled();
    expect(overview.usage).toHaveBeenCalledWith({ date: "2026-07-18" });
  });

  it("serves settings.getAi without a pro gate", async () => {
    const result = await new SettingsIpc().getAi();
    expect(result.ok).toBe(true);
    expect(settings.getAi).toHaveBeenCalled();
  });

  it("serves symbols.reassess and reassessStatus without a pro gate", async () => {
    const reassess = await new SymbolsIpc().reassess({ sym: "MU" });
    expect(reassess).toEqual({ ok: true, data: { started: false, reason: "analyst layer disabled" } });
    const status = await new SymbolsIpc().reassessStatus({ sym: "MU" });
    expect(status).toEqual({ ok: true, data: { running: false } });
  });

  it("serves symbols.deepDive and deepDiveStatus without a host-level pro gate", async () => {
    symbols.deepDive.mockResolvedValue({ started: false, reason: "disabled" });
    symbols.deepDiveStatus.mockResolvedValue({ running: false });
    const deepDive = await new SymbolsIpc().deepDive({ sym: "MU" });
    expect(deepDive).toEqual({ ok: true, data: { started: false, reason: "disabled" } });
    const status = await new SymbolsIpc().deepDiveStatus({ sym: "MU" });
    expect(status).toEqual({ ok: true, data: { running: false } });
  });
});
