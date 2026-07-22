// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentKitConflictDialog } from './AgentKitConflictDialog';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

const conflict = {
  dest: 'CLAUDE.md',
  templatePath: 'templates/CLAUDE.md',
  reason: 'target-exists-no-state' as const,
};

function makeBridge(overrides: Partial<DesktopAgentKitBridge> = {}): DesktopAgentKitBridge {
  return {
    getStatus: vi.fn(),
    setEnabled: vi.fn(),
    forceSync: vi.fn(),
    resolveConflict: vi.fn(async () => ({ dest: conflict.dest })),
    applyUpdate: vi.fn(),
    clean: vi.fn(),
    ...overrides,
  } as DesktopAgentKitBridge;
}

describe('AgentKitConflictDialog', () => {
  afterEach(() => cleanup());

  it('renders the three choices', () => {
    render(
      <AgentKitConflictDialog
        conflict={conflict}
        bridge={makeBridge()}
        onResolved={vi.fn()}
        close={vi.fn()}
      />,
    );

    expect(screen.getByText(/使用 Kit 模板覆盖/)).toBeTruthy();
    expect(screen.getByText(/保留原文件/)).toBeTruthy();
    expect(screen.getByText('稍后再说')).toBeTruthy();
  });

  it('稍后再说 closes without calling the bridge', () => {
    const bridge = makeBridge();
    const close = vi.fn();
    render(
      <AgentKitConflictDialog conflict={conflict} bridge={bridge} onResolved={vi.fn()} close={close} />,
    );

    fireEvent.click(screen.getByText('稍后再说'));

    expect(close).toHaveBeenCalledTimes(1);
    expect(bridge.resolveConflict).not.toHaveBeenCalled();
  });

  it('use-template resolves, calls onResolved then close', async () => {
    const bridge = makeBridge();
    const onResolved = vi.fn();
    const close = vi.fn();
    render(
      <AgentKitConflictDialog conflict={conflict} bridge={bridge} onResolved={onResolved} close={close} />,
    );

    fireEvent.click(screen.getByText(/使用 Kit 模板覆盖/));

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(bridge.resolveConflict).toHaveBeenCalledWith({
      dest: conflict.dest,
      choice: 'use-template',
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('keep-original invokes the bridge with the matching choice', async () => {
    const bridge = makeBridge();
    render(
      <AgentKitConflictDialog conflict={conflict} bridge={bridge} onResolved={vi.fn()} close={vi.fn()} />,
    );

    fireEvent.click(screen.getByText(/保留原文件/));

    await vi.waitFor(() =>
      expect(bridge.resolveConflict).toHaveBeenCalledWith({
        dest: conflict.dest,
        choice: 'keep-original',
      }),
    );
  });

  it('shows an inline error and keeps the modal open on failure', async () => {
    const bridge = makeBridge({
      resolveConflict: vi.fn(async () => {
        throw new Error('resolve failed');
      }),
    });
    const onResolved = vi.fn();
    const close = vi.fn();
    render(
      <AgentKitConflictDialog conflict={conflict} bridge={bridge} onResolved={onResolved} close={close} />,
    );

    fireEvent.click(screen.getByText(/使用 Kit 模板覆盖/));

    expect(await screen.findByText('resolve failed')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
