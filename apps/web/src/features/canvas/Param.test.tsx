// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Param } from '@kansoku/canvas';

afterEach(() => cleanup());

describe('Param', () => {
  it('renders a slider only when min and max are both set', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Param label="止损" value={58} onChange={onChange} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} min={50} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} max={70} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} min={50} max={70} />);
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('snaps and clamps on blur, and ignores invalid drafts', () => {
    const onChange = vi.fn();
    render(<Param label="止损" value={58.4} onChange={onChange} min={50} max={70} step={0.05} />);
    const input = screen.getByRole('textbox', { name: '止损' });

    fireEvent.change(input, { target: { value: '61.23' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(61.25);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(70);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('58.40');
  });

  it('emits onChange while dragging the slider', () => {
    const onChange = vi.fn();
    render(<Param label="止损" value={58} onChange={onChange} min={50} max={70} step={1} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(59);
  });

  it('restores the default after remount', () => {
    function Harness() {
      const [value, setValue] = useState(61.2);
      return <Param label="入场" value={value} onChange={setValue} step={0.1} />;
    }
    const { unmount } = render(<Harness />);
    const input = screen.getByRole('textbox', { name: '入场' });
    fireEvent.change(input, { target: { value: '64' } });
    fireEvent.blur(input);
    unmount();
    render(<Harness />);
    expect((screen.getByRole('textbox', { name: '入场' }) as HTMLInputElement).value).toBe('61.2');
  });

  it('throws when value, step, or the range is not usable', () => {
    const onChange = vi.fn();
    expect(() => render(<Param label="x" value={Number.NaN} onChange={onChange} />)).toThrow(
      'Param: value must be a finite number',
    );
    cleanup();
    expect(() => render(<Param label="x" value={1} onChange={onChange} step={0} />)).toThrow(
      'Param: step must be > 0',
    );
    cleanup();
    expect(() =>
      render(<Param label="x" value={1} onChange={onChange} min={70} max={50} />),
    ).toThrow('Param: min must be <= max');
  });
});
