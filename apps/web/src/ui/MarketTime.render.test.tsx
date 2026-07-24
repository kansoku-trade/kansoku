// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setTimeDisplayPreference } from '@web/lib/timeDisplayPreference';
import { MarketTime } from './MarketTime';

vi.mock('@kansoku/shared/time', async () => {
  const actual = await vi.importActual<typeof import('@kansoku/shared/time')>(
    '@kansoku/shared/time',
  );
  return { ...actual, localTimeZone: () => 'Asia/Singapore' };
});

afterEach(() => {
  cleanup();
  setTimeDisplayPreference('market');
});

const marketOpen = '2026-07-02T13:30:00Z';

describe('MarketTime zone', () => {
  it('follows the local-time preference by default', () => {
    setTimeDisplayPreference('local');
    const { container } = render(<MarketTime value={marketOpen} format="clock" />);

    expect(container.textContent).toContain('21:30');
  });

  it('stays in market time when the zone is pinned to the market', () => {
    setTimeDisplayPreference('local');
    const { container } = render(<MarketTime value={marketOpen} format="clock" zone="market" />);

    expect(container.textContent).toContain('09:30');
  });
});
