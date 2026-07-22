// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';

let capabilities: { features?: Record<string, string> } = {
  features: { 'auto-patterns': 'locked', 'options-walls': 'locked' },
};

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

vi.mock('./useIntradayCharts', () => ({
  EMA_COLORS: ['#fff'],
  useIntradayCharts: vi.fn(),
}));

vi.mock('../drawings/useDrawings', () => ({
  useDrawings: () => ({}),
}));

vi.mock('../drawings/DrawingToolbar', () => ({
  DrawingToolbar: () => null,
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } =
  await import('@web/features/edition/licenseModalStore');
const { IntradayChartOnly } = await import('./IntradayDashboard');

const built = {
  sidebar: { technicals: { m5: { emas: [] } } },
  timeframes: { m5: { candles: [] } },
} as unknown as IntradayBuilt;

afterEach(() => {
  cleanup();
  resetLicenseModalStoreForTests();
  capabilities = { features: { 'auto-patterns': 'locked', 'options-walls': 'locked' } };
});

function openCustomLayers() {
  fireEvent.click(screen.getByText('自定义图层'));
}

describe('IntradayChartOnly pro annotation layer locks', () => {
  it('renders locked gated layers with a lock icon and free layers as normal checkboxes', () => {
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);
    openCustomLayers();

    expect(screen.getByText('SB 结构').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('123 结构').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('期权墙').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('EMA 均线').closest('label')?.querySelector('input')).toBeTruthy();
  });

  it('opens the license modal via guard when a locked layer is clicked, without toggling it', () => {
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);
    openCustomLayers();

    fireEvent.click(screen.getByText('SB 结构'));

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('excludes locked layers from the layer count', () => {
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);

    expect(screen.getByText(/^图层 \d+\/14$/)).toBeTruthy();
  });

  it('filters locked keys out of preset options so applying a preset cannot enable them', () => {
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);

    const allPresetInput = document.querySelector<HTMLInputElement>(
      '.lp-presets input[value="all"]',
    );
    fireEvent.click(allPresetInput!);

    expect(screen.getByText(/^图层 7\/14$/)).toBeTruthy();
  });

  it('renders gated layers locked on a public-only build where features are absent', () => {
    capabilities = { features: { 'auto-patterns': 'absent', 'options-walls': 'absent' } };
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);
    openCustomLayers();

    expect(screen.getByText('SB 结构').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('123 结构').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('期权墙').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText(/^图层 \d+\/14$/)).toBeTruthy();
  });

  it('renders gated layers locked before capabilities load (features undefined)', () => {
    capabilities = {};
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);
    openCustomLayers();

    expect(screen.getByText('期权墙').closest('.lp-locked')).toBeTruthy();
  });

  it('renders unlocked checkboxes once the gating features become active', () => {
    capabilities = { features: { 'auto-patterns': 'active', 'options-walls': 'active' } };
    render(<IntradayChartOnly symbol="NVDA.US" built={built} activeTf="m5" />);
    openCustomLayers();

    expect(screen.getByText('SB 结构').closest('label')?.querySelector('input')).toBeTruthy();
    expect(screen.getByText('期权墙').closest('label')?.querySelector('input')).toBeTruthy();
    expect(screen.getByText(/^图层 \d+\/20$/)).toBeTruthy();
  });
});
