// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter } from 'react-router';
import {
  matchPopoutSymbolRoute,
  navigate,
  resolveAnchorRoute,
  routePathname,
  setActiveRouter,
  useRoute,
} from './index';

function memRouter(initial: string) {
  return createMemoryRouter([{ path: '*', Component: () => null }], {
    initialEntries: [initial],
  });
}

afterEach(() => {
  cleanup();
  setActiveRouter(null);
});

describe('routePathname', () => {
  it('keeps analysis query parameters out of the symbol route', () => {
    expect(routePathname('/symbol/DRAM.US?analysis=2026-07-13-dram-intraday')).toBe(
      '/symbol/DRAM.US',
    );
  });

  it('preserves percent-encoded question marks inside path segments', () => {
    expect(routePathname('/charts/chart%3Fid?view=compact')).toBe('/charts/chart%3Fid');
  });
});

describe('resolveAnchorRoute', () => {
  it('routes durable localhost chart links inside both web and packaged app runtimes', () => {
    const href = 'http://localhost:1792/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3';
    expect(resolveAnchorRoute(href, href, 'http://localhost:1792')).toBe(
      '/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3',
    );
    expect(resolveAnchorRoute(href, href, 'null')).toBe(
      '/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3',
    );
  });

  it('keeps ordinary relative navigation working under app://', () => {
    expect(resolveAnchorRoute('/settings', 'app://-/settings', 'null')).toBe('/settings');
  });

  it('leaves external protocols to the browser or Electron navigation guard', () => {
    expect(resolveAnchorRoute('https://example.com', 'https://example.com/', 'null')).toBeNull();
    expect(
      resolveAnchorRoute('mailto:test@example.com', 'mailto:test@example.com', 'null'),
    ).toBeNull();
  });
});

describe('matchPopoutSymbolRoute', () => {
  it('extracts and decodes the symbol from a popout route', () => {
    expect(matchPopoutSymbolRoute('/popout/symbol/NVDA')).toBe('NVDA');
    expect(matchPopoutSymbolRoute('/popout/symbol/700.HK')).toBe('700.HK');
    expect(matchPopoutSymbolRoute('/popout/symbol/BRK%2EB')).toBe('BRK.B');
  });

  it('returns null for anything else, including nested paths', () => {
    expect(matchPopoutSymbolRoute('/symbol/NVDA')).toBeNull();
    expect(matchPopoutSymbolRoute('/popout/symbol/')).toBeNull();
    expect(matchPopoutSymbolRoute('/popout/symbol/NVDA/extra')).toBeNull();
  });
});

describe('navigate against the active router', () => {
  it('navigates the active router instead of window.location', async () => {
    const router = memRouter('/');
    setActiveRouter(router);
    navigate('/symbol/MRVL');
    await waitFor(() => expect(router.state.location.pathname).toBe('/symbol/MRVL'));
  });

  it('passes the replace option through to the active router', () => {
    const router = memRouter('/');
    const spy = vi.spyOn(router, 'navigate');
    setActiveRouter(router);
    navigate('/settings', { replace: true });
    expect(spy).toHaveBeenCalledWith('/settings', { replace: true });
  });

  it('does nothing when the route is unchanged', () => {
    const router = memRouter('/settings');
    const spy = vi.spyOn(router, 'navigate');
    setActiveRouter(router);
    navigate('/settings');
    expect(spy).not.toHaveBeenCalled();
  });

  it('retargets to a new router after setActiveRouter switches', async () => {
    const first = memRouter('/');
    const second = memRouter('/');
    setActiveRouter(first);
    navigate('/logs');
    await waitFor(() => expect(first.state.location.pathname).toBe('/logs'));

    setActiveRouter(second);
    navigate('/about');
    await waitFor(() => expect(second.state.location.pathname).toBe('/about'));
    expect(first.state.location.pathname).toBe('/logs');
  });
});

describe('useRoute', () => {
  function RouteProbe() {
    return <div data-testid="route">{useRoute()}</div>;
  }

  it('reflects the active router and updates on navigate and on router switch', async () => {
    const first = memRouter('/alpha');
    setActiveRouter(first);
    render(<RouteProbe />);
    expect(screen.getByTestId('route').textContent).toBe('/alpha');

    await act(async () => {
      navigate('/beta');
    });
    expect(screen.getByTestId('route').textContent).toBe('/beta');

    const second = memRouter('/gamma');
    act(() => setActiveRouter(second));
    expect(screen.getByTestId('route').textContent).toBe('/gamma');
  });
});
