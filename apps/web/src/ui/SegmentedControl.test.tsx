// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

afterEach(() => cleanup());

const OPTIONS = [
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
] as const;

describe('SegmentedControl', () => {
  it('reports the picked option', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="周期"
        value="week"
        onChange={onChange}
        options={OPTIONS}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '月' }));

    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('carries the size modifier so callers can pick the compact variant', () => {
    const { container } = render(
      <SegmentedControl ariaLabel="周期" size="sm" value="week" onChange={vi.fn()} options={OPTIONS} />,
    );

    expect(container.querySelector('.ui-segmented-control--sm')).toBeTruthy();
  });

  it('carries the fit modifier so callers can shrink columns to content', () => {
    const { container } = render(
      <SegmentedControl ariaLabel="周期" fit value="week" onChange={vi.fn()} options={OPTIONS} />,
    );

    expect(container.querySelector('.ui-segmented-control--fit')).toBeTruthy();
  });

  it('keeps caller className alongside the modifier classes', () => {
    const { container } = render(
      <SegmentedControl
        ariaLabel="周期"
        className="lp-presets"
        size="sm"
        fit
        value="week"
        onChange={vi.fn()}
        options={OPTIONS}
      />,
    );

    const root = container.querySelector('.ui-segmented-control');
    expect(root?.classList.contains('lp-presets')).toBe(true);
    expect(root?.classList.contains('ui-segmented-control--sm')).toBe(true);
    expect(root?.classList.contains('ui-segmented-control--fit')).toBe(true);
  });
});
