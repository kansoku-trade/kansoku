// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerPanel, type LayerGroup, type LayerPreset } from './LayerPanel';

afterEach(() => {
  cleanup();
});

function makeGroups(overrides?: { lockedOnClick?: () => void }): LayerGroup[] {
  return [
    {
      title: '参照',
      items: [
        { key: 'ema', label: 'EMA 均线', color: '#fff', toggle: vi.fn() },
        { key: 'vwap', label: 'VWAP', color: '#fff', toggle: vi.fn() },
      ],
    },
    {
      title: '结构',
      items: [
        {
          key: 'sb',
          label: 'SB 结构',
          color: '#fff',
          toggle: vi.fn(),
          locked: true,
          onLockedClick: overrides?.lockedOnClick,
        },
      ],
    },
  ];
}

describe('LayerPanel locks', () => {
  it('renders a lock icon for a locked item instead of a checkbox', () => {
    render(<LayerPanel groups={makeGroups()} checked={{ ema: true, vwap: false, sb: false }} />);

    expect(screen.getByText('SB 结构')).toBeTruthy();
    expect(screen.getByText('SB 结构').closest('.lp-locked')).toBeTruthy();
    expect(screen.getByText('SB 结构').closest('.lp-locked')?.querySelector('input')).toBeNull();
  });

  it('calls the locked click handler when a locked item is clicked, without toggling it', () => {
    const onLockedClick = vi.fn();
    render(
      <LayerPanel
        groups={makeGroups({ lockedOnClick: onLockedClick })}
        checked={{ ema: true, vwap: false, sb: false }}
      />,
    );

    fireEvent.click(screen.getByText('SB 结构'));

    expect(onLockedClick).toHaveBeenCalledTimes(1);
  });

  it('excludes locked items from the on-count numerator and denominator', () => {
    render(
      <LayerPanel
        groups={makeGroups()}
        checked={{ ema: true, vwap: false, sb: true }}
        title="图层"
      />,
    );

    expect(screen.getByText('图层 1/2')).toBeTruthy();
  });

  it('renders normal checkboxes for unlocked items', () => {
    render(<LayerPanel groups={makeGroups()} checked={{ ema: true, vwap: false, sb: false }} />);

    const emaCheckbox = screen.getByText('EMA 均线').closest('label')?.querySelector('input');
    expect(emaCheckbox).toBeTruthy();
    expect((emaCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it('keeps SEPA-style usage without lock props unaffected', () => {
    const groups: LayerGroup[] = [
      {
        items: [{ key: 'a', label: 'A', color: '#fff', toggle: vi.fn() }],
      },
    ];
    render(<LayerPanel groups={groups} />);

    expect(screen.getByText('A').closest('label')?.querySelector('input')).toBeTruthy();
  });

  it('does not highlight a preset that includes a locked key as active, when caller pre-filters presets', () => {
    const presets: LayerPreset[] = [{ key: 'std', label: '标准', on: ['ema'] }];
    render(
      <LayerPanel
        groups={makeGroups()}
        checked={{ ema: true, vwap: false, sb: false }}
        presets={presets}
      />,
    );

    const activeInput = document.querySelector<HTMLInputElement>('.lp-presets input:checked');
    expect(activeInput?.value).toBe('std');
  });
});
