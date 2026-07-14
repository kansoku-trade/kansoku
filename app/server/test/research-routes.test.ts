import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}));
const chat = vi.hoisted(() => ({
  getChat: vi.fn(),
  postMessage: vi.fn(),
  abortChat: vi.fn(),
  suggestions: vi.fn(),
}));
const refresh = vi.hoisted(() => ({
  getRefresh: vi.fn(),
  startRefresh: vi.fn(),
  abortRefresh: vi.fn(),
}));
const edits = vi.hoisted(() => ({
  listResearchEditProposals: vi.fn(),
  applyResearchEditProposal: vi.fn(),
  rejectResearchEditProposal: vi.fn(),
  undoResearchEditProposal: vi.fn(),
}));

vi.mock("../../packages/core/src/modules/research/research.service.js", () => ({ researchService: service }));
vi.mock("../../packages/core/src/modules/research/researchChat.service.js", () => ({ researchChatService: chat }));
vi.mock("../../packages/core/src/modules/research/researchRefresh.service.js", () => ({ researchRefreshService: refresh }));
vi.mock("../../packages/core/src/modules/research/researchEdit.service.js", () => edits);

const { tsukiRequest } = await import("./helpers.js");

beforeEach(() => {
  service.list.mockReset();
  service.get.mockReset();
  service.list.mockResolvedValue([]);
  for (const mock of Object.values(chat)) mock.mockReset();
  for (const mock of Object.values(refresh)) mock.mockReset();
  for (const mock of Object.values(edits)) mock.mockReset();
  edits.listResearchEditProposals.mockResolvedValue([]);
});

describe("research routes", () => {
  it("forwards the selected view and full-text query to the research service", async () => {
    const res = await tsukiRequest("/api/research?kind=stock&query=供给纪律");

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith({ kind: "stock", query: "供给纪律" });
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });

  it("rejects unknown research views", async () => {
    const res = await tsukiRequest("/api/research?kind=other");

    expect(res.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("loads a document by its repository-relative path", async () => {
    service.get.mockResolvedValue({
      path: "stocks/MU.md",
      kind: "stock",
      type: "stock",
      title: "MU",
      date: null,
      symbols: ["MU"],
      mtime: "2026-07-14T00:00:00.000Z",
      excerpt: "",
      markdown: "# MU",
    });

    const res = await tsukiRequest("/api/research/document?path=stocks%2FMU.md");

    expect(res.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith({ path: "stocks/MU.md" });
    expect((await res.json()).data.markdown).toBe("# MU");
  });

  it("requires a document path", async () => {
    const res = await tsukiRequest("/api/research/document");

    expect(res.status).toBe(400);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("returns the document-scoped research chat state", async () => {
    chat.getChat.mockResolvedValue({ session: null, messages: [], busy: false, partial: null });

    const res = await tsukiRequest("/api/research/chat?path=stocks%2FMU.md");

    expect(res.status).toBe(200);
    expect(chat.getChat).toHaveBeenCalledWith({ path: "stocks/MU.md" });
    expect(await res.json()).toEqual({ session: null, messages: [], busy: false, partial: null });
  });

  it("starts a research chat turn through the raw status response contract", async () => {
    chat.postMessage.mockResolvedValue({ status: 202, body: { accepted: true } });

    const res = await tsukiRequest("/api/research/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stocks/MU.md", text: "更新风险章节" }),
    });

    expect(res.status).toBe(202);
    expect(chat.postMessage).toHaveBeenCalledWith({ path: "stocks/MU.md", text: "更新风险章节" });
    expect(await res.json()).toEqual({ accepted: true });
  });

  it("starts and reads a document-scoped research refresh task", async () => {
    const task = { id: "refresh-1", path: "stocks/MU.md", status: "running", phase: "preparing" };
    refresh.startRefresh.mockResolvedValue(task);
    refresh.getRefresh.mockResolvedValue(task);

    const startRes = await tsukiRequest("/api/research/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stocks/MU.md", objective: "重新核查投资论点" }),
    });
    expect(startRes.status).toBe(200);
    expect(refresh.startRefresh).toHaveBeenCalledWith({ path: "stocks/MU.md", objective: "重新核查投资论点" });
    expect(await startRes.json()).toEqual({ ok: true, data: task });

    const stateRes = await tsukiRequest("/api/research/refresh?path=stocks%2FMU.md");
    expect(refresh.getRefresh).toHaveBeenCalledWith({ path: "stocks/MU.md" });
    expect(await stateRes.json()).toEqual({ ok: true, data: task });
  });

  it("lists and applies selected edit operations", async () => {
    const proposal = { id: "edit-1", path: "stocks/MU.md", status: "pending" };
    edits.listResearchEditProposals.mockResolvedValue([proposal]);
    edits.applyResearchEditProposal.mockResolvedValue({ proposal: { ...proposal, status: "applied" }, document: {} });

    const listRes = await tsukiRequest("/api/research/edits?path=stocks%2FMU.md");
    expect(await listRes.json()).toEqual({ ok: true, data: [proposal] });

    const applyRes = await tsukiRequest("/api/research/edits/edit-1/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stocks/MU.md", operationIndexes: [1] }),
    });
    expect(applyRes.status).toBe(200);
    expect(edits.applyResearchEditProposal).toHaveBeenCalledWith({
      id: "edit-1",
      path: "stocks/MU.md",
      operationIndexes: [1],
    });
  });
});
