// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCapabilitiesStoreForTests } from "./capabilitiesStore";
import { getLicenseModalStateForTests, openLicenseModal, resetLicenseModalStoreForTests } from "./licenseModalStore";

const capabilitiesGet = vi.fn();
const subscribeUrlGet = vi.fn();
const activate = vi.fn();
const deactivate = vi.fn();

vi.mock("./client", () => ({
  client: {
    capabilities: { get: (...args: unknown[]) => capabilitiesGet(...args) },
    settings: { getSubscribeUrl: (...args: unknown[]) => subscribeUrlGet(...args) },
    license: {
      activate: (...args: unknown[]) => activate(...args),
      deactivate: (...args: unknown[]) => deactivate(...args),
    },
  },
}));

const { ModalHost } = await import("./ui");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("LicenseModal", () => {
  afterEach(() => {
    cleanup();
    resetCapabilitiesStoreForTests();
    resetLicenseModalStoreForTests();
    capabilitiesGet.mockReset();
    subscribeUrlGet.mockReset();
    activate.mockReset();
    deactivate.mockReset();
  });

  it("renders nothing when closed", () => {
    renderWithClient(<ModalHost />);
    expect(screen.queryByText("订阅与授权")).toBeNull();
  });

  it("renders the paywall without the runtime notice when opened via guard", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: "https://checkout.example/buy", priceLabel: "$9.9 / 月" });
    openLicenseModal("guard");

    renderWithClient(<ModalHost />);

    expect(screen.getByText("订阅与授权")).toBeTruthy();
    expect(screen.getByText("Kansoku AI")).toBeTruthy();
    const cta = await screen.findByText(/前往订阅 · \$9\.9 \/ 月/);
    expect(cta.closest("a")?.getAttribute("href")).toBe("https://checkout.example/buy");
    expect(screen.queryByPlaceholderText("输入授权码")).toBeNull();
    expect(screen.queryByText(/本次操作因授权已失效/)).toBeNull();
  });

  it("advertises exactly the three paid features, not the now-free ones", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null, priceLabel: null });
    openLicenseModal("guard");

    renderWithClient(<ModalHost />);

    expect(await screen.findByText("个股自动跟踪")).toBeTruthy();
    expect(screen.getByText("深度研究")).toBeTruthy();
    expect(screen.getByText("研究库 AI")).toBeTruthy();
    expect(screen.queryByText("AI 盘面复盘")).toBeNull();
    expect(screen.queryByText("图表对话")).toBeNull();
    expect(screen.queryByText("定时盯盘")).toBeNull();
  });

  it("reveals the activate form behind the toggle", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null, priceLabel: null });
    openLicenseModal("guard");

    renderWithClient(<ModalHost />);
    fireEvent.click(await screen.findByText("已有授权码？输入激活"));

    expect(await screen.findByPlaceholderText("输入授权码")).toBeTruthy();
  });

  it("renders the runtime-403 notice when opened by a mid-session 403", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null, priceLabel: null });
    openLicenseModal("runtime-403");

    renderWithClient(<ModalHost />);

    expect(await screen.findByText(/本次操作因授权已失效/)).toBeTruthy();
  });

  it("closes on a successful activation", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null, priceLabel: null });
    activate.mockResolvedValue({ activated: true });
    openLicenseModal("guard");

    renderWithClient(<ModalHost />);
    fireEvent.click(await screen.findByText("已有授权码？输入激活"));
    const input = await screen.findByPlaceholderText("输入授权码");
    fireEvent.change(input, { target: { value: "KEY-1234" } });

    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234" },
    });
    fireEvent.click(screen.getByText("激活"));

    await waitFor(() => expect(getLicenseModalStateForTests().open).toBe(false));
    expect(activate).toHaveBeenCalledWith({ key: "KEY-1234" });
  });
});
