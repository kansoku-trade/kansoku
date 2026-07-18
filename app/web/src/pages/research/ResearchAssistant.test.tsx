// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchDocument, ResearchDocumentMeta } from "../../../../packages/core/src/contract";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: true, licensed: true };

const listEdits = vi.fn().mockResolvedValue([]);
const getRefresh = vi.fn().mockResolvedValue(null);
const getChat = vi.fn().mockResolvedValue({ session: null, messages: [], busy: false, partial: "" });
const suggestions = vi.fn().mockResolvedValue({ suggestions: [] });
const postMessage = vi.fn();
const abortChat = vi.fn();
const startRefresh = vi.fn();
const abortRefresh = vi.fn();

vi.mock("../../capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("../../client", () => ({
  client: {
    research: {
      listEdits: (...args: unknown[]) => listEdits(...args),
      getRefresh: (...args: unknown[]) => getRefresh(...args),
      getChat: (...args: unknown[]) => getChat(...args),
      postMessage: (...args: unknown[]) => postMessage(...args),
      abortChat: (...args: unknown[]) => abortChat(...args),
      suggestions: (...args: unknown[]) => suggestions(...args),
      startRefresh: (...args: unknown[]) => startRefresh(...args),
      abortRefresh: (...args: unknown[]) => abortRefresh(...args),
    },
  },
}));
vi.mock("../../wsHub", () => ({
  subscribeChannel: () => () => {},
}));
vi.mock("../cockpit/chat/ChatComposer", () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
}));
vi.mock("../cockpit/chat/ConversationTranscript", () => ({
  ConversationTranscript: () => <div data-testid="conversation-transcript" />,
}));

const { ResearchAssistant } = await import("./ResearchAssistant");

const document: ResearchDocument = {
  path: "stocks/MRVL.md",
  kind: "stock",
  type: "stock",
  title: "MRVL",
  date: null,
  symbols: ["MRVL"],
  mtime: "2026-07-18T00:00:00.000Z",
  excerpt: "",
  markdown: "# MRVL",
  revision: "r1",
};

const related: ResearchDocumentMeta[] = [
  {
    path: "stocks/AVGO.md",
    kind: "stock",
    type: "stock",
    title: "AVGO",
    date: null,
    symbols: ["AVGO"],
    mtime: "2026-07-18T00:00:00.000Z",
    excerpt: "",
  },
];

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  capabilities = { pro: true, licensed: true };
  listEdits.mockClear();
  getRefresh.mockClear();
  getChat.mockClear();
  suggestions.mockClear();
});

describe("ResearchAssistant license gate", () => {
  it("renders the locked placeholder + browse card, and fires zero AI-subroute fetches", async () => {
    capabilities = { pro: true, licensed: false };

    renderWithClient(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/研究库 AI/)).toBeTruthy();
    expect(screen.getByText("订阅解锁")).toBeTruthy();
    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.queryByLabelText("刷新研究")).toBeNull();
    expect(screen.queryByTestId("chat-composer")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listEdits).not.toHaveBeenCalled();
    expect(getRefresh).not.toHaveBeenCalled();
    expect(getChat).not.toHaveBeenCalled();
  });

  it("renders the browse card only for a community build (pro:false), no locked notice, zero AI fetches", async () => {
    capabilities = { pro: false, licensed: false };

    renderWithClient(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.queryByText(/研究库 AI/)).toBeNull();
    expect(screen.queryByText("订阅解锁")).toBeNull();
    expect(screen.queryByLabelText("刷新研究")).toBeNull();
    expect(screen.queryByTestId("chat-composer")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listEdits).not.toHaveBeenCalled();
    expect(getRefresh).not.toHaveBeenCalled();
    expect(getChat).not.toHaveBeenCalled();
  });

  it("renders the real AI panel and fires the AI-subroute fetches when licensed", async () => {
    capabilities = { pro: true, licensed: true };

    renderWithClient(
      <ResearchAssistant
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("刷新研究")).toBeTruthy();
    expect(screen.getByTestId("chat-composer")).toBeTruthy();
    expect(screen.queryByText(/研究库 AI/)).toBeNull();

    await waitFor(() => expect(listEdits).toHaveBeenCalled());
    await waitFor(() => expect(getRefresh).toHaveBeenCalled());
    await waitFor(() => expect(getChat).toHaveBeenCalled());
  });
});
