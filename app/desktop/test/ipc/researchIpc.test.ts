import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}));

const service = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../../../packages/core/src/modules/research/research.service.js", () => ({ researchService: service }));

const { ResearchIpc } = await import("../../src/ipc/researchIpc.js");

beforeEach(() => {
  service.list.mockReset().mockResolvedValue([]);
  service.get.mockReset();
});

describe("desktop research browse ipc", () => {
  it("registers the browse service under the research group", () => {
    expect(ResearchIpc.groupName).toBe("research");
  });

  it("serves list through the core research service", async () => {
    const instance = new ResearchIpc();
    const result = await instance.list({ kind: "stock" });
    expect(service.list).toHaveBeenCalledWith({ kind: "stock" });
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("serves get through the core research service", async () => {
    service.get.mockResolvedValue({ path: "stocks/MU.md", markdown: "# MU" });
    const instance = new ResearchIpc();
    const result = await instance.get({ path: "stocks/MU.md" });
    expect(service.get).toHaveBeenCalledWith({ path: "stocks/MU.md" });
    expect(result).toEqual({ ok: true, data: { path: "stocks/MU.md", markdown: "# MU" } });
  });
});
