// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverviewBoard, OverviewRow } from "../../../../../packages/shared/types";

let capabilities: { features?: Record<string, string> } = { features: { "symbol-follow": "active" } };
const startFollow = vi.fn();
const stopFollow = vi.fn();

vi.mock("../../capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("../../client", () => ({
  client: {
    symbols: {
      followStatus: vi.fn(),
      startFollow: (...args: unknown[]) => startFollow(...args),
      stopFollow: (...args: unknown[]) => stopFollow(...args),
    },
  },
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } = await import("../../licenseModalStore");
const { WatchBoard } = await import("./WatchBoard");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

const row: OverviewRow = {
  symbol: "MRVL.US",
  chart_id: "c1",
  url: "/symbol/MRVL.US",
  title: "MRVL",
  direction: null,
  last: null,
  pct: null,
  session: null,
  entry: null,
  stop: null,
  target1: null,
  stop_distance_pct: null,
  target1_distance_pct: null,
  prediction_stale: false,
  ai_following: false,
  latest_comment: null,
  alert_count: 0,
};

const board: OverviewBoard = { date: "2026-07-18", session: "regular", rows: [row] };

afterEach(() => {
  cleanup();
  capabilities = { features: { "symbol-follow": "active" } };
  resetLicenseModalStoreForTests();
  startFollow.mockReset();
  stopFollow.mockReset();
});

describe("WatchBoard follow toggle license gate", () => {
  it("opens the license modal instead of toggling when pro but unlicensed", async () => {
    capabilities = { features: { "symbol-follow": "locked" } };
    renderWithClient(<WatchBoard board={board} error={null} compact={false} />);

    const toggle = await screen.findByLabelText("持续跟进 MRVL.US 的 AI 点评");
    fireEvent.click(toggle);

    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("allows turning off an already-on follow when pro but unlicensed", async () => {
    capabilities = { features: { "symbol-follow": "locked" } };
    stopFollow.mockResolvedValue({ following: false });
    const followingRow: OverviewRow = { ...row, ai_following: true };
    const followingBoard: OverviewBoard = { ...board, rows: [followingRow] };
    renderWithClient(<WatchBoard board={followingBoard} error={null} compact={false} />);

    const toggle = await screen.findByLabelText("持续跟进 MRVL.US 的 AI 点评");
    fireEvent.click(toggle);

    await waitFor(() => expect(stopFollow).toHaveBeenCalledWith({ sym: "MRVL.US" }));
    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("toggles normally when licensed", async () => {
    capabilities = { features: { "symbol-follow": "active" } };
    startFollow.mockResolvedValue({ following: true });
    renderWithClient(<WatchBoard board={board} error={null} compact={false} />);

    const toggle = await screen.findByLabelText("持续跟进 MRVL.US 的 AI 点评");
    fireEvent.click(toggle);

    await waitFor(() => expect(startFollow).toHaveBeenCalledWith({ sym: "MRVL.US" }));
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("hides the follow toggle for a community build (pro:false) while the card still renders", async () => {
    capabilities = { features: { "symbol-follow": "absent" } };
    startFollow.mockResolvedValue({ following: true });
    renderWithClient(<WatchBoard board={board} error={null} compact={false} />);

    expect(await screen.findByText("MRVL.US")).toBeTruthy();
    expect(screen.queryByLabelText("持续跟进 MRVL.US 的 AI 点评")).toBeNull();
    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("hides the follow toggle while capabilities are still loading (pro:null)", async () => {
    capabilities = { features: undefined };
    renderWithClient(<WatchBoard board={board} error={null} compact={false} />);

    expect(await screen.findByText("MRVL.US")).toBeTruthy();
    expect(screen.queryByLabelText("持续跟进 MRVL.US 的 AI 点评")).toBeNull();
  });
});
