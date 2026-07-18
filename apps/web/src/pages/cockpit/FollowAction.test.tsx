// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: true, licensed: true };
const followStatus = vi.fn();
const startFollow = vi.fn();
const stopFollow = vi.fn();

vi.mock("../../capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("../../client", () => ({
  client: {
    symbols: {
      followStatus: (...args: unknown[]) => followStatus(...args),
      startFollow: (...args: unknown[]) => startFollow(...args),
      stopFollow: (...args: unknown[]) => stopFollow(...args),
    },
  },
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } = await import("../../licenseModalStore");
const { FollowAction } = await import("./FollowAction");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  capabilities = { pro: true, licensed: true };
  resetLicenseModalStoreForTests();
  followStatus.mockReset();
  startFollow.mockReset();
  stopFollow.mockReset();
});

describe("FollowAction license gate", () => {
  it("opens the license modal instead of toggling when pro but unlicensed", async () => {
    capabilities = { pro: true, licensed: false };
    followStatus.mockResolvedValue({ following: false });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    const toggle = await screen.findByLabelText("持续跟进 AI 点评");
    await waitFor(() => expect(toggle.getAttribute("data-disabled")).toBeNull());
    fireEvent.click(toggle);

    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("toggles normally when licensed", async () => {
    capabilities = { pro: true, licensed: true };
    followStatus.mockResolvedValue({ following: false });
    startFollow.mockResolvedValue({ following: true });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    const toggle = await screen.findByLabelText("持续跟进 AI 点评");
    await waitFor(() => expect(toggle.getAttribute("data-disabled")).toBeNull());
    fireEvent.click(toggle);

    expect(startFollow).toHaveBeenCalledWith({ sym: "MRVL.US" });
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders nothing for a community build (pro:false) and fires no follow query", async () => {
    capabilities = { pro: false, licensed: false };
    followStatus.mockResolvedValue({ following: false });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText("持续跟进 AI 点评")).toBeNull();
    expect(followStatus).not.toHaveBeenCalled();
    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders nothing while capabilities are still loading (pro:null)", async () => {
    capabilities = { pro: null, licensed: false };
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText("持续跟进 AI 点评")).toBeNull();
    expect(followStatus).not.toHaveBeenCalled();
  });
});
