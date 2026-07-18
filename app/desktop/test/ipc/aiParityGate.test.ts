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

vi.mock("../../../packages/core/src/modules/overview/overview.service.js", () => ({ overviewService: overview }));
vi.mock("../../../packages/core/src/modules/settings/settings.service.js", () => ({ settingsService: settings }));
vi.mock("../../../packages/core/src/modules/symbols/symbols.service.js", () => ({ symbolsService: symbols }));

const { OverviewIpc } = await import("../../src/ipc/overviewIpc.js");
const { SettingsIpc } = await import("../../src/ipc/settingsIpc.js");
const { SymbolsIpc } = await import("../../src/ipc/symbolsIpc.js");
const { unregisterProModuleForTests } = await import("../../../packages/core/src/pro/registry.js");

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

  it("still gates symbols.deepDive behind requirePro (404 when pro absent)", async () => {
    const result = await new SymbolsIpc().deepDive({ sym: "MU" });
    expect(result).toEqual({
      ok: false,
      error: "AI features are not available in this build",
      status: 404,
    });
    expect(symbols.deepDive).not.toHaveBeenCalled();
  });

  it("still gates symbols.deepDiveStatus behind requirePro (404 when pro absent)", async () => {
    const result = await new SymbolsIpc().deepDiveStatus({ sym: "MU" });
    expect(result).toEqual({
      ok: false,
      error: "AI features are not available in this build",
      status: 404,
    });
    expect(symbols.deepDiveStatus).not.toHaveBeenCalled();
  });
});
