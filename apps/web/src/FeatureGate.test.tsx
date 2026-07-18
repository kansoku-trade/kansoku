// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { features?: Record<string, string> } = { features: {} };

vi.mock('./capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('./licenseModalStore', () => ({
  openLicenseModal: vi.fn(),
}));

const { FeatureGate } = await import('./FeatureGate');

afterEach(() => {
  cleanup();
  capabilities = { features: {} };
});

describe('FeatureGate', () => {
  it('renders children when the feature is active', () => {
    capabilities = { features: { 'deep-dive': 'active' } };
    render(
      <FeatureGate feature="deep-dive" locked={<span>locked-hint</span>}>
        <span>unlocked-content</span>
      </FeatureGate>,
    );

    expect(screen.getByText('unlocked-content')).toBeTruthy();
    expect(screen.queryByText('locked-hint')).toBeNull();
  });

  it('renders the locked prop when the feature is locked', () => {
    capabilities = { features: { 'deep-dive': 'locked' } };
    render(
      <FeatureGate feature="deep-dive" locked={<span>locked-hint</span>}>
        <span>unlocked-content</span>
      </FeatureGate>,
    );

    expect(screen.getByText('locked-hint')).toBeTruthy();
    expect(screen.queryByText('unlocked-content')).toBeNull();
  });

  it('renders nothing when the feature is absent', () => {
    capabilities = { features: { 'deep-dive': 'absent' } };
    const { container } = render(
      <FeatureGate feature="deep-dive" locked={<span>locked-hint</span>}>
        <span>unlocked-content</span>
      </FeatureGate>,
    );

    expect(container.textContent).toBe('');
  });

  it('defaults the locked prop to null', () => {
    capabilities = { features: { 'deep-dive': 'locked' } };
    const { container } = render(
      <FeatureGate feature="deep-dive">
        <span>unlocked-content</span>
      </FeatureGate>,
    );

    expect(container.textContent).toBe('');
  });
});
