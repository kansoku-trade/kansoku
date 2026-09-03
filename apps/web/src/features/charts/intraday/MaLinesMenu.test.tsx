// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { MaLinesMenu } from './MaLinesMenu';
import { IntradayControlsProvider } from './controlsContext';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function open() {
  render(
    <IntradayControlsProvider>
      <MaLinesMenu
        built={{ timeframes: {} } as unknown as IntradayBuilt}
        activeTf="m15"
        symbol="NVDA.US"
      />
    </IntradayControlsProvider>,
  );
  fireEvent.click(screen.getByLabelText('均线设置'));
}

const periodInput = (period: number) => screen.getByLabelText(`EMA${period} 周期`);

const DEFAULT_PERIODS = [9, 21, 55];

const storedPeriods = () => {
  const raw = localStorage.getItem('intraday-ma-lines');
  return raw ? (JSON.parse(raw) as { period: number }[]).map((l) => l.period) : null;
};

describe('MaLinesMenu period editing', () => {
  it('lets the field be cleared mid-edit and retyped — the value only commits on blur', () => {
    open();
    const input = periodInput(55);

    fireEvent.change(input, { target: { value: '' } });
    expect((input as HTMLInputElement).value).toBe('');

    fireEvent.change(input, { target: { value: '144' } });
    expect((input as HTMLInputElement).value).toBe('144');

    fireEvent.blur(input);

    expect(storedPeriods()).toEqual([9, 21, 144]);
  });

  it('commits on Enter as well', () => {
    open();
    const input = periodInput(21);

    fireEvent.change(input, { target: { value: '34' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(storedPeriods()).toEqual([9, 34, 55]);
  });

  it('does not react to intermediate values while typing', () => {
    open();
    const input = periodInput(55);

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '14' } });

    expect(storedPeriods()).toEqual(DEFAULT_PERIODS);
  });

  it('rolls back an out-of-range period instead of storing it', () => {
    open();
    const input = periodInput(9);

    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe('9');
    expect(storedPeriods()).toEqual(DEFAULT_PERIODS);
  });

  it('rolls back an empty or non-numeric period', () => {
    open();
    const input = periodInput(9);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('9');

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('9');

    expect(storedPeriods()).toEqual(DEFAULT_PERIODS);
  });

  it('rolls back a period already used by another line', () => {
    open();
    const input = periodInput(9);

    fireEvent.change(input, { target: { value: '21' } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe('9');
    expect(storedPeriods()).toEqual(DEFAULT_PERIODS);
  });

  it('restores the committed value on Escape', () => {
    open();
    const input = periodInput(9);

    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect((input as HTMLInputElement).value).toBe('9');
  });
});
