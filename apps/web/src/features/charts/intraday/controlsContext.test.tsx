// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IntradayControlsProvider, useIntradayControls } from './controlsContext';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderControls(storageNamespace?: string) {
  return renderHook(() => useIntradayControls(), {
    wrapper: ({ children }) => (
      <IntradayControlsProvider storageNamespace={storageNamespace}>
        {children}
      </IntradayControlsProvider>
    ),
  });
}

describe('IntradayControlsProvider storage namespace', () => {
  it('with no namespace, still reads and writes the original un-prefixed keys', () => {
    localStorage.setItem('intraday-timeframes', JSON.stringify(['m5', 'm15', 'h1', 'day']));

    const { result } = renderControls();
    expect(result.current.visibleTfs).toContain('day');

    act(() => result.current.toggleTf('30m'));
    expect(localStorage.getItem('intraday-timeframes')).not.toBeNull();
    expect(localStorage.getItem('trainer-intraday-timeframes')).toBeNull();
  });

  it('with a namespace, reads and writes only its own prefixed keys', () => {
    localStorage.setItem('intraday-timeframes', JSON.stringify(['m5', 'm15', 'h1', 'day']));
    localStorage.setItem(
      'intraday-ma-lines',
      JSON.stringify([{ id: 'ma-99', period: 99, color: '#fff', visible: true }]),
    );
    localStorage.setItem('intraday-indicators', JSON.stringify({ fvg: true, markerRange: 'all' }));

    const { result } = renderControls('trainer');

    expect(result.current.visibleTfs).not.toContain('day');
    expect(result.current.maLines.some((l) => l.period === 99)).toBe(false);
    expect(result.current.toggles.fvg).toBe(false);

    act(() => result.current.toggleTf('30m'));
    act(() => result.current.set('fvg', true));
    act(() => result.current.addMaLine());

    expect(localStorage.getItem('trainer-intraday-timeframes')).not.toBeNull();
    expect(localStorage.getItem('trainer-intraday-ma-lines')).not.toBeNull();
    expect(localStorage.getItem('trainer-intraday-indicators')).not.toBeNull();

    expect(JSON.parse(localStorage.getItem('intraday-timeframes')!)).toEqual([
      'm5',
      'm15',
      'h1',
      'day',
    ]);
    expect(JSON.parse(localStorage.getItem('intraday-ma-lines')!)).toEqual([
      { id: 'ma-99', period: 99, color: '#fff', visible: true },
    ]);
  });
});
