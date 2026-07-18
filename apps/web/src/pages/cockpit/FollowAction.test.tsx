// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capabilities: { features?: Record<string, string> } = { features: { "symbol-follow": "active" } };
const followStatus = vi.fn();
const startFollow = vi.fn();
const stopFollow = vi.fn();

vi.mock("@web/capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("@web/client", () => ({
  client: {
    symbols: {
      followStatus: (...args: unknown[]) => followStatus(...args),
      startFollow: (...args: unknown[]) => startFollow(...args),
      stopFollow: (...args: unknown[]) => stopFollow(...args),
    },
  },
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } = await import("@web/licenseModalStore");
const { FollowAction } = await import("./FollowAction");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  capabilities = { features: { "symbol-follow": "active" } };
  resetLicenseModalStoreForTests();
  followStatus.mockReset();
  startFollow.mockReset();
  stopFollow.mockReset();
});

describe("FollowAction license gate", () => {
  it("opens the license modal instead of toggling when pro but unlicensed", async () => {
    capabilities = { features: { "symbol-follow": "locked" } };
    followStatus.mockResolvedValue({ following: false });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    const toggle = await screen.findByLabelText("持续跟进 AI 点评");
    await waitFor(() => expect(toggle.getAttribute("data-disabled")).toBeNull());
    fireEvent.click(toggle);

    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("allows turning off an already-on follow when pro but unlicensed", async () => {
    capabilities = { features: { "symbol-follow": "locked" } };
    followStatus.mockResolvedValue({ following: true });
    stopFollow.mockResolvedValue({ following: false });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    const toggle = await screen.findByLabelText("持续跟进 AI 点评");
    await waitFor(() => expect(toggle.getAttribute("data-disabled")).toBeNull());
    fireEvent.click(toggle);

    await waitFor(() => expect(stopFollow).toHaveBeenCalledWith({ sym: "MRVL.US" }));
    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("toggles normally when licensed", async () => {
    capabilities = { features: { "symbol-follow": "active" } };
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
    capabilities = { features: { "symbol-follow": "absent" } };
    followStatus.mockResolvedValue({ following: false });
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText("持续跟进 AI 点评")).toBeNull();
    expect(followStatus).not.toHaveBeenCalled();
    expect(startFollow).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders nothing while capabilities are still loading (pro:null)", async () => {
    capabilities = { features: undefined };
    renderWithClient(<FollowAction symbol="MRVL.US" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText("持续跟进 AI 点评")).toBeNull();
    expect(followStatus).not.toHaveBeenCalled();
  });
});
