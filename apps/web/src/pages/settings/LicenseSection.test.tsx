// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCapabilitiesStoreForTests } from "@web/capabilitiesStore";
import { getLicenseModalStateForTests, resetLicenseModalStoreForTests } from "@web/licenseModalStore";

const capabilitiesGet = vi.fn();
const subscribeUrlGet = vi.fn();
const activate = vi.fn();
const deactivate = vi.fn();

vi.mock("@web/client", () => ({
  client: {
    capabilities: { get: (...args: unknown[]) => capabilitiesGet(...args) },
    settings: { getSubscribeUrl: (...args: unknown[]) => subscribeUrlGet(...args) },
    license: {
      activate: (...args: unknown[]) => activate(...args),
      deactivate: (...args: unknown[]) => deactivate(...args),
    },
  },
}));

const { LicenseSection } = await import("./LicenseSection");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("LicenseSection", () => {
  afterEach(() => {
    cleanup();
    resetCapabilitiesStoreForTests();
    resetLicenseModalStoreForTests();
    capabilitiesGet.mockReset();
    subscribeUrlGet.mockReset();
    activate.mockReset();
    deactivate.mockReset();
  });

  it("shows the key input and subscribe link when unlicensed", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: "https://buy.example.com" });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByPlaceholderText("输入授权码")).toBeTruthy();
    expect(await screen.findByText("还没有授权码？前往订阅")).toBeTruthy();
    expect(screen.queryByText("停用本机")).toBeNull();
  });

  it("shows the trial subscribe link when the subscription carries trial days", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: "https://buy.example.com", trialDays: 7 });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText("还没有授权码？免费试用 7 天")).toBeTruthy();
    expect(screen.queryByText("还没有授权码？前往订阅")).toBeNull();
  });

  it("opens the license paywall modal from the subscribe entry instead of direct checkout", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: "https://buy.example.com", trialDays: 7 });

    renderWithClient(<LicenseSection />);

    const entry = await screen.findByText("还没有授权码？免费试用 7 天");
    expect(entry.closest("a")).toBeNull();
    fireEvent.click(entry);

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("shows the status row and deactivate button when licensed", async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234", deviceName: "MacBook" },
    });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText("已授权")).toBeTruthy();
    expect(screen.getByText(/••••1234/)).toBeTruthy();
    expect(screen.getByText("停用本机")).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入授权码")).toBeNull();
  });

  it("shows the invalid-key notice with a re-entry input when invalid", async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: "invalid", maskedKey: "••••9999" },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/已失效/)).toBeTruthy();
    expect(screen.getByPlaceholderText("输入授权码")).toBeTruthy();
  });

  it("shows a distinct auto-recoverable notice with a re-entry input when expired", async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: "expired", maskedKey: "••••5678" },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/授权已过期/)).toBeTruthy();
    expect(screen.getByText(/自动重新验证/)).toBeTruthy();
    expect(screen.queryByText(/已失效/)).toBeNull();
    expect(screen.getByPlaceholderText("输入授权码")).toBeTruthy();
  });
});
