// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalHost, resetModalStoreForTests } from '@web/ui';
import { AgentKitSection } from './AgentKitSection';

const baseStatus = {
  enabled: true,
  location: { kind: 'follow-data-root' as const },
  resolvedPath: '/tmp/kansoku-data',
  followBlocked: false,
  dataRoot: '/tmp/kansoku-data',
};

function mockDesktop(handlers: Record<string, (input?: unknown) => unknown>) {
  const invoke = vi.fn(async (channel: string, input?: unknown) => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`unexpected channel ${channel}`);
    return handler(input);
  });
  (window as { desktop?: unknown }).desktop = { rpc: { invoke } };
  return invoke;
}

describe('AgentKitSection', () => {
  afterEach(() => {
    cleanup();
    resetModalStoreForTests();
    delete (window as { desktop?: unknown }).desktop;
  });

  it('renders nothing outside the desktop runtime', () => {
    const { container } = render(<AgentKitSection />);
    expect(container.textContent).toBe('');
  });

  it('shows enabled status, kit version and last sync', async () => {
    mockDesktop({
      'agentKit.getStatus': () => ({
        ok: true,
        data: { ...baseStatus, kitVersion: '1.2.0', lastSyncAt: '2026-07-22T00:00:00.000Z' },
      }),
    });

    render(<AgentKitSection />);

    expect(await screen.findByText(/1\.2\.0/)).toBeTruthy();
    expect(screen.getByText(/2026-07-22T00:00:00\.000Z/)).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('renders a row with an action button per pending conflict and update', async () => {
    mockDesktop({
      'agentKit.getStatus': () => ({
        ok: true,
        data: {
          ...baseStatus,
          pendingConflicts: [
            { dest: 'a.md', templatePath: 't/a.md', reason: 'target-exists-no-state' },
          ],
          pendingUpdates: [
            { dest: 'b.md', templatePath: 't/b.md', oldTemplateHash: 'x', newTemplateHash: 'y' },
          ],
        },
      }),
    });

    render(<AgentKitSection />);

    expect(await screen.findByText(/a\.md/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '处理' })).toBeTruthy();
    expect(screen.getByText(/b\.md/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy();
  });

  it('resolving a conflict from the dialog closes it and reloads status', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...baseStatus,
          pendingConflicts: [
            { dest: 'a.md', templatePath: 't/a.md', reason: 'target-exists-no-state' },
          ],
        },
      })
      .mockResolvedValueOnce({ ok: true, data: baseStatus });
    const resolveConflict = vi.fn(() => ({ ok: true, data: { dest: 'a.md' } }));
    mockDesktop({
      'agentKit.getStatus': () => getStatus(),
      'agentKit.resolveConflict': (input) => resolveConflict(input),
    });

    render(
      <>
        <AgentKitSection />
        <ModalHost />
      </>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '处理' }));
    expect(await screen.findByText(/处理冲突/)).toBeTruthy();

    fireEvent.click(screen.getByText(/使用 Kit 模板覆盖/));

    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    expect(resolveConflict).toHaveBeenCalledWith({ dest: 'a.md', choice: 'use-template' });
    await vi.waitFor(() => expect(screen.queryByText(/处理冲突/)).toBeNull());
  });

  it('toggling the switch calls setEnabled then reloads status', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { ...baseStatus, enabled: false } })
      .mockResolvedValueOnce({ ok: true, data: baseStatus });
    const setEnabled = vi.fn((_input?: unknown) => ({
      ok: true,
      data: { enabled: true, conflicts: [], updates: [] },
    }));
    mockDesktop({
      'agentKit.getStatus': () => getStatus(),
      'agentKit.setEnabled': (input) => setEnabled(input),
    });

    render(<AgentKitSection />);

    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);

    await vi.waitFor(() =>
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'),
    );
    expect(setEnabled).toHaveBeenCalledWith({ enabled: true });
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('重刷 calls forceSync then reloads status', async () => {
    const forceSync = vi.fn(() => ({ ok: true, data: { conflicts: [], updates: [] } }));
    const getStatus = vi.fn(() => ({ ok: true, data: baseStatus }));
    mockDesktop({
      'agentKit.getStatus': () => getStatus(),
      'agentKit.forceSync': () => forceSync(),
    });

    render(<AgentKitSection />);

    const button = await screen.findByRole('button', { name: '重刷' });
    fireEvent.click(button);

    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    expect(forceSync).toHaveBeenCalledTimes(1);
  });

  it('清理 asks for confirmation before calling clean', async () => {
    const clean = vi.fn(() => ({ ok: true, data: { cleaned: true } }));
    const getStatus = vi.fn(() => ({ ok: true, data: baseStatus }));
    mockDesktop({
      'agentKit.getStatus': () => getStatus(),
      'agentKit.clean': () => clean(),
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AgentKitSection />);

    const button = await screen.findByRole('button', { name: '清理' });
    fireEvent.click(button);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(clean).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(button);

    await vi.waitFor(() => expect(clean).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('shows blocked hint + disables follow when data root is the app default', async () => {
    mockDesktop({
      'agentKit.getStatus': () => ({
        ok: true,
        data: {
          ...baseStatus,
          location: { kind: 'follow-data-root' as const },
          resolvedPath: null,
          followBlocked: true,
          dataRoot: '/Users/x/Library/Application Support/Kansoku',
        },
      }),
    });

    render(<AgentKitSection />);

    expect(await screen.findByText(/跟随不可用/)).toBeTruthy();
    const follow = screen.getByRole('button', { name: '跟随数据目录' });
    expect(follow.hasAttribute('disabled')).toBe(true);
  });

  it('pick custom location calls pickCustomLocation and updates status', async () => {
    const picked = {
      ...baseStatus,
      location: { kind: 'custom' as const, path: '/Users/x/kansoku-kit' },
      resolvedPath: '/Users/x/kansoku-kit',
    };
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: baseStatus })
      .mockResolvedValueOnce({ ok: true, data: picked });
    const pickCustomLocation = vi.fn(() => ({ ok: true, data: picked }));
    mockDesktop({
      'agentKit.getStatus': () => getStatus(),
      'agentKit.pickCustomLocation': () => pickCustomLocation(),
    });

    render(<AgentKitSection />);

    fireEvent.click(await screen.findByRole('button', { name: '选择目录…' }));

    await vi.waitFor(() => expect(pickCustomLocation).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      const hits = screen.queryAllByText((_, node) =>
        (node?.textContent ?? '').includes('/Users/x/kansoku-kit'),
      );
      expect(hits.length).toBeGreaterThan(0);
    });
  });
});
