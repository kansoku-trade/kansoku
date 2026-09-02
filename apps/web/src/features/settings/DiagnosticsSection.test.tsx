// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalHost, resetModalStoreForTests } from '@web/ui';
import { DiagnosticsSection } from './DiagnosticsSection';

describe('DiagnosticsSection', () => {
  afterEach(() => {
    cleanup();
    resetModalStoreForTests();
    delete (window as { desktop?: unknown }).desktop;
  });

  it('shows the diagnostic log in a renderer modal', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'logs.getInfo') return { path: '/tmp/kansoku.log', dir: '/tmp' };
      if (channel === 'logs.tail') return { path: '/tmp/kansoku.log', text: 'renderer log' };
      throw new Error(`unexpected channel ${channel}`);
    });
    (window as { desktop?: unknown }).desktop = { rpc: { invoke } };

    render(
      <>
        <DiagnosticsSection />
        <ModalHost />
      </>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '查看日志' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('诊断日志')).toBeTruthy();
    expect(await within(dialog).findByText('renderer log')).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('logs.tail', { maxBytes: 256 * 1024 });
  });
});
