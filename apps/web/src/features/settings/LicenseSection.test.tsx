// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCapabilitiesStoreForTests } from '@web/features/edition/capabilitiesStore';
import {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} from '@web/features/edition/licenseModalStore';

const capabilitiesGet = vi.fn();
const subscribeUrlGet = vi.fn();
const activate = vi.fn();
const deactivate = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    capabilities: { get: (...args: unknown[]) => capabilitiesGet(...args) },
    settings: { getSubscribeUrl: (...args: unknown[]) => subscribeUrlGet(...args) },
    license: {
      activate: (...args: unknown[]) => activate(...args),
      deactivate: (...args: unknown[]) => deactivate(...args),
    },
  },
}));

const { LicenseSection } = await import('./LicenseSection');

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe('LicenseSection', () => {
  afterEach(() => {
    cleanup();
    resetCapabilitiesStoreForTests();
    resetLicenseModalStoreForTests();
    capabilitiesGet.mockReset();
    subscribeUrlGet.mockReset();
    activate.mockReset();
    deactivate.mockReset();
  });

  it('shows the key input and subscribe link when unlicensed', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: 'unlicensed' },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: 'https://buy.example.com' });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByPlaceholderText('输入授权码')).toBeTruthy();
    expect(await screen.findByText('还没有授权码？前往订阅')).toBeTruthy();
    expect(screen.queryByText('停用本机')).toBeNull();
  });

  it('shows the trial subscribe link when the subscription carries trial days', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: 'unlicensed' },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: 'https://buy.example.com', trialDays: 7 });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText('还没有授权码？免费试用 7 天')).toBeTruthy();
    expect(screen.queryByText('还没有授权码？前往订阅')).toBeNull();
  });

  it('opens the license paywall modal from the subscribe entry instead of direct checkout', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: 'unlicensed' },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: 'https://buy.example.com', trialDays: 7 });

    renderWithClient(<LicenseSection />);

    const entry = await screen.findByText('还没有授权码？免费试用 7 天');
    expect(entry.closest('a')).toBeNull();
    fireEvent.click(entry);

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('shows the status row and deactivate button when licensed', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: true,
      license: { state: 'licensed', maskedKey: '••••1234', deviceName: 'MacBook' },
    });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText('已授权')).toBeTruthy();
    expect(screen.getByText(/••••1234/)).toBeTruthy();
    expect(screen.getByText('停用本机')).toBeTruthy();
    expect(screen.queryByPlaceholderText('输入授权码')).toBeNull();
  });

  it('shows the invalid-key notice with a re-entry input when invalid', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: 'invalid', maskedKey: '••••9999' },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/已失效/)).toBeTruthy();
    expect(screen.getByPlaceholderText('输入授权码')).toBeTruthy();
  });

  it('shows a distinct auto-recoverable notice with a re-entry input when expired', async () => {
    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: false,
      license: { state: 'expired', maskedKey: '••••5678' },
    });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/授权已过期/)).toBeTruthy();
    expect(screen.getByText(/自动重新验证/)).toBeTruthy();
    expect(screen.queryByText(/已失效/)).toBeNull();
    expect(screen.getByPlaceholderText('输入授权码')).toBeTruthy();
  });

  it("shows the restart-required notice when licensed but pro hasn't loaded and an enc bundle is staged", async () => {
    capabilitiesGet.mockResolvedValue({
      pro: false,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234" },
      hasEncBundle: true,
    });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/需要重启应用后才会生效/)).toBeTruthy();
    expect(screen.queryByText(/当前构建不包含付费模块/)).toBeNull();
  });

  it("offers one-click relaunch in the desktop runtime instead of asking for a manual quit", async () => {
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const invoke = vi.fn((channel: string) =>
      channel === "appControl.relaunch" ? relaunch() : Promise.resolve(undefined),
    );
    (window as { desktop?: unknown }).desktop = { rpc: { invoke } };
    capabilitiesGet.mockResolvedValue({
      pro: false,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234" },
      hasEncBundle: true,
    });

    try {
      renderWithClient(<LicenseSection />);

      const button = await screen.findByRole("button", { name: "立即重启" });
      expect(screen.queryByText(/请手动退出并重新打开/)).toBeNull();
      fireEvent.click(button);
      expect(relaunch).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as { desktop?: unknown }).desktop;
    }
  });

  it("shows the honest no-paid-module notice when licensed but this build has no pro code at all", async () => {
    capabilitiesGet.mockResolvedValue({
      pro: false,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234" },
      hasEncBundle: false,
    });

    renderWithClient(<LicenseSection />);

    expect(await screen.findByText(/当前构建不包含付费模块/)).toBeTruthy();
    expect(screen.queryByText(/需要重启应用后才会生效/)).toBeNull();
  });
});
