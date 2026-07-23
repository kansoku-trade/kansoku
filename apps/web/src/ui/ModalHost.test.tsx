// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModalHost } from './ModalHost';
import { openModal, resetModalStoreForTests } from './modalStore';

afterEach(() => {
  cleanup();
  resetModalStoreForTests();
});

describe('ModalHost', () => {
  it('defaults to the lg panel with no size modifier class', () => {
    openModal({ title: '默认尺寸', body: <p>内容</p> });
    render(<ModalHost />);

    const panel = screen.getByRole('dialog');
    expect(panel.className).toBe('modal-panel');
  });

  it('applies the sm modifier class', () => {
    openModal({ title: '小尺寸', size: 'sm', body: <p>内容</p> });
    render(<ModalHost />);

    const panel = screen.getByRole('dialog');
    expect(panel.classList.contains('modal-panel--sm')).toBe(true);
  });

  it('applies the md modifier class', () => {
    openModal({ title: '中尺寸', size: 'md', body: <p>内容</p> });
    render(<ModalHost />);

    const panel = screen.getByRole('dialog');
    expect(panel.classList.contains('modal-panel--md')).toBe(true);
  });

  it('keeps panelClassName as an escape hatch alongside the size modifier', () => {
    openModal({
      title: '兼容',
      size: 'sm',
      panelClassName: 'pro-overlay-panel',
      body: <p>内容</p>,
    });
    render(<ModalHost />);

    const panel = screen.getByRole('dialog');
    expect(panel.classList.contains('modal-panel--sm')).toBe(true);
    expect(panel.classList.contains('pro-overlay-panel')).toBe(true);
  });
});
