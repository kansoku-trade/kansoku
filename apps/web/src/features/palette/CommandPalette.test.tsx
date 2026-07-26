// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} from '../edition/licenseModalStore';

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };
let trainerBridge: { openTrainer: () => Promise<void> } | null = null;
const openTrainer = vi.fn(async () => {});

vi.mock('../../lib/apiHooks', () => ({ useQuery: () => ({ data: null }) }));
vi.mock('../edition/capabilitiesStore', () => ({ useCapabilities: () => capabilities }));
vi.mock('../desktop/desktopWindowsBridge', () => ({
  getOpenTrainerBridge: () => trainerBridge,
}));

const { CommandPalette } = await import('./CommandPalette');

// jsdom has no layout engine, so Element.prototype.scrollIntoView is unimplemented.
Element.prototype.scrollIntoView = vi.fn();

function openPalette(): void {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

describe('CommandPalette trainer entry', () => {
  afterEach(() => {
    cleanup();
    resetLicenseModalStoreForTests();
    capabilities = { pro: null, licensed: false };
    trainerBridge = null;
    openTrainer.mockClear();
  });

  it('hides the trainer command when no desktop bridge is present', () => {
    capabilities = { pro: true, licensed: true };
    render(<CommandPalette onOpenRoute={vi.fn()} />);
    openPalette();

    expect(screen.queryByText('开始盲盘训练')).toBeNull();
  });

  it('shows a Pro prompt instead of opening the window when not licensed', () => {
    trainerBridge = { openTrainer };
    capabilities = { pro: true, licensed: false };
    render(<CommandPalette onOpenRoute={vi.fn()} />);
    openPalette();
    fireEvent.click(screen.getByText('开始盲盘训练'));

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('no-ops instead of showing the Pro prompt while capabilities are still loading', () => {
    trainerBridge = { openTrainer };
    capabilities = { pro: null, licensed: false };
    render(<CommandPalette onOpenRoute={vi.fn()} />);
    openPalette();
    fireEvent.click(screen.getByText('开始盲盘训练'));

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('never touches the desktop rpc when the build has no pro module at all', () => {
    trainerBridge = { openTrainer };
    capabilities = { pro: false, licensed: false };
    render(<CommandPalette onOpenRoute={vi.fn()} />);
    openPalette();
    fireEvent.click(screen.getByText('开始盲盘训练'));

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('opens the trainer window when pro and licensed', () => {
    trainerBridge = { openTrainer };
    capabilities = { pro: true, licensed: true };
    render(<CommandPalette onOpenRoute={vi.fn()} />);
    openPalette();
    fireEvent.click(screen.getByText('开始盲盘训练'));

    expect(openTrainer).toHaveBeenCalledTimes(1);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
