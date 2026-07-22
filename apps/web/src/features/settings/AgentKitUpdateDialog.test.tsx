// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentKitUpdateDialog } from './AgentKitUpdateDialog';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

const update = {
  dest: 'CLAUDE.md',
  templatePath: 'templates/CLAUDE.md',
  oldTemplateHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  newTemplateHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
};

function makeBridge(overrides: Partial<DesktopAgentKitBridge> = {}): DesktopAgentKitBridge {
  return {
    getStatus: vi.fn(),
    setEnabled: vi.fn(),
    forceSync: vi.fn(),
    resolveConflict: vi.fn(),
    applyUpdate: vi.fn(async () => ({ dest: update.dest })),
    clean: vi.fn(),
    ...overrides,
  } as DesktopAgentKitBridge;
}

describe('AgentKitUpdateDialog', () => {
  afterEach(() => cleanup());

  it('renders both actions and the hash prefixes', () => {
    render(
      <AgentKitUpdateDialog update={update} bridge={makeBridge()} onResolved={vi.fn()} close={vi.fn()} />,
    );

    expect(screen.getByText(/使用新模板覆盖/)).toBeTruthy();
    expect(screen.getByText('继续保留')).toBeTruthy();
    expect(screen.getByText(/a{12}/)).toBeTruthy();
    expect(screen.getByText(/b{12}/)).toBeTruthy();
  });

  it('继续保留 closes without calling the bridge', () => {
    const bridge = makeBridge();
    const close = vi.fn();
    render(<AgentKitUpdateDialog update={update} bridge={bridge} onResolved={vi.fn()} close={close} />);

    fireEvent.click(screen.getByText('继续保留'));

    expect(close).toHaveBeenCalledTimes(1);
    expect(bridge.applyUpdate).not.toHaveBeenCalled();
  });

  it('applies the update, then calls onResolved and close', async () => {
    const bridge = makeBridge();
    const onResolved = vi.fn();
    const close = vi.fn();
    render(
      <AgentKitUpdateDialog update={update} bridge={bridge} onResolved={onResolved} close={close} />,
    );

    fireEvent.click(screen.getByText(/使用新模板覆盖/));

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(bridge.applyUpdate).toHaveBeenCalledWith({ dest: update.dest });
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error and keeps the modal open on failure', async () => {
    const bridge = makeBridge({
      applyUpdate: vi.fn(async () => {
        throw new Error('apply failed');
      }),
    });
    const onResolved = vi.fn();
    const close = vi.fn();
    render(
      <AgentKitUpdateDialog update={update} bridge={bridge} onResolved={onResolved} close={close} />,
    );

    fireEvent.click(screen.getByText(/使用新模板覆盖/));

    expect(await screen.findByText('apply failed')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
