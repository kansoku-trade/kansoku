// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { memo, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Fold, useFoldActions } from './Fold';

afterEach(() => cleanup());

function Demo({
  defaultOpen = false,
  caret = true,
  disabled = false,
}: {
  defaultOpen?: boolean;
  caret?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Fold open={open} onToggle={() => setOpen((current) => !current)}>
      <Fold.Trigger caret={caret} disabled={disabled}>
        打开
      </Fold.Trigger>
      <Fold.Panel>里面的内容</Fold.Panel>
    </Fold>
  );
}

describe('Fold', () => {
  it('hides the panel until the trigger is clicked', () => {
    render(<Demo />);
    expect(screen.getByRole('button', { name: '打开' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByText('里面的内容')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByRole('button', { name: '打开' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('里面的内容')).toBeTruthy();
  });

  it('closes the panel on the second click', () => {
    render(<Demo defaultOpen />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByRole('button', { name: '打开' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('does not toggle while disabled', () => {
    render(<Demo disabled />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByRole('button', { name: '打开' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByText('里面的内容')).toBeNull();
  });

  it('can hide the caret', () => {
    const { container } = render(<Demo caret={false} />);
    expect(container.querySelector('.ui-fold-caret')).toBeNull();
  });

  it('can shrink the trigger to a pill', () => {
    function Pill() {
      const [open, setOpen] = useState(false);
      return (
        <Fold open={open} onToggle={() => setOpen((current) => !current)}>
          <Fold.Trigger fit>打开</Fold.Trigger>
          <Fold.Panel>里面的内容</Fold.Panel>
        </Fold>
      );
    }
    render(<Pill />);
    expect(screen.getByRole('button', { name: '打开' }).getAttribute('data-fit')).toBe('true');
  });

  it('does not rerender action consumers when open changes', () => {
    let actionRenders = 0;
    const ActionProbe = memo(function ActionProbe() {
      useFoldActions();
      actionRenders += 1;
      return null;
    });
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <Fold open={open} onToggle={() => setOpen((current) => !current)}>
          <Fold.Trigger>打开</Fold.Trigger>
          <ActionProbe />
          <Fold.Panel>里面的内容</Fold.Panel>
        </Fold>
      );
    }
    render(<Harness />);
    const started = actionRenders;
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    expect(screen.getByText('里面的内容')).toBeTruthy();
    expect(actionRenders).toBe(started);
  });

  it('keeps extra class names on the root and trigger', () => {
    function Named() {
      const [open, setOpen] = useState(false);
      return (
        <Fold open={open} onToggle={() => setOpen((current) => !current)} className="extra-root">
          <Fold.Trigger className="extra-trigger">打开</Fold.Trigger>
          <Fold.Panel>里面的内容</Fold.Panel>
        </Fold>
      );
    }
    const { container } = render(<Named />);
    expect(container.querySelector('.ui-fold')?.className).toContain('extra-root');
    expect(container.querySelector('.ui-fold-trigger')?.className).toContain('extra-trigger');
  });

  it('puts panel class names inside the height clipper', () => {
    function Named() {
      const [open, setOpen] = useState(true);
      return (
        <Fold open={open} onToggle={() => setOpen((current) => !current)}>
          <Fold.Trigger>打开</Fold.Trigger>
          <Fold.Panel className="extra-panel">里面的内容</Fold.Panel>
        </Fold>
      );
    }
    const { container } = render(<Named />);
    const clipper = container.querySelector('.ui-fold-panel');
    expect(clipper).toBeTruthy();
    expect(clipper?.className).not.toContain('extra-panel');
    expect(clipper?.querySelector('.extra-panel')).toBeTruthy();
  });
});
