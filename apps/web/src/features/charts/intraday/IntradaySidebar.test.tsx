// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { IntradaySidebar } = await import('./IntradaySidebar');

const built = {
  defaultTf: 'm15',
  timeframes: {},
  sidebar: { symbol: 'NVDA.US', name: '英伟达', last: 100, asOf: '', position: null },
} as unknown as IntradayBuilt;

let subs: { spec: ChannelSpec; onPayload: (payload: unknown) => void }[];

beforeEach(() => {
  subs = [];
  subscribeChannel.mockReset();
  subscribeChannel.mockImplementation(
    (spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
      subs.push({ spec, onPayload });
      return vi.fn();
    },
  );
});

afterEach(() => cleanup());

describe('IntradaySidebar live quote', () => {
  it('shows the pushed price without re-rendering the dock', () => {
    let dockCommits = 0;
    render(
      <IntradaySidebar
        built={built}
        activeTf="m15"
        live
        tabsOverride={[]}
        dock={
          <Profiler id="dock" onRender={() => dockCommits++}>
            <div>dock</div>
          </Profiler>
        }
      />,
    );
    expect(screen.getByText('$100.00')).toBeTruthy();
    dockCommits = 0;

    act(() => {
      subs[0].onPayload({
        type: 'data',
        data: { quotes: [{ symbol: 'NVDA.US', last: 123.45, pct: 0, session: '日盘', asOf: '' }] },
      });
    });

    expect(screen.getByText('$123.45')).toBeTruthy();
    expect(dockCommits).toBe(0);
  });
});
