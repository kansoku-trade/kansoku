// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrainerLadderTf, type TrainerLadder } from './payloadToIntradayBuilt';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';

afterEach(() => cleanup());

const LADDER: TrainerLadder = ['5m', '15m', '1h'];

describe('isTrainerLadderTf', () => {
  it('accepts only tiers present in the ladder', () => {
    expect(isTrainerLadderTf(LADDER, 'm5')).toBe(true);
    expect(isTrainerLadderTf(LADDER, 'm15')).toBe(true);
    expect(isTrainerLadderTf(LADDER, 'h1')).toBe(true);
    expect(isTrainerLadderTf(LADDER, '1m')).toBe(false);
    expect(isTrainerLadderTf(LADDER, 'day')).toBe(false);
  });
});

describe('TrainerPeriodSwitch', () => {
  it('renders one button per ladder tier and reports the mapped ChartTf on click', () => {
    const onChange = vi.fn();
    render(<TrainerPeriodSwitch ladder={LADDER} activeTf="m5" onChange={onChange} />);

    expect(screen.getByRole('button', { pressed: true }).textContent).toBe('5m');

    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(onChange).toHaveBeenCalledWith('h1');
  });
});
