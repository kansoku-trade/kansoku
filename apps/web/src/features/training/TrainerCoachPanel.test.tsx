// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerCoachCall, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TrainerCoachPanel } from './TrainerCoachPanel';
import { TrainerOverlayLayer, TrainerOverlayProvider } from './trainerOverlay';

function bar(iso: string, close: number): RawBar {
  return { time: iso, open: close - 1, high: close + 1, low: close - 1.5, close, volume: 1000 };
}

function makeView(overrides: Partial<TrainerView> = {}): TrainerView {
  const base = [bar('2026-01-05T14:00:00.000Z', 100), bar('2026-01-05T14:05:00.000Z', 103)];
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: base.length - 1,
    asOf: base.at(-1)!.time,
    bars: { base, mid: base, top: base },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 20,
    terminal: false,
    result: null,
    submitted: false,
    ...overrides,
  };
}

function makeCall(overrides: Partial<TrainerCoachCall> = {}): TrainerCoachCall {
  return {
    id: 'coach-1',
    cursor: 1,
    step: 2,
    askedAt: '2026-01-05T14:05:00.000Z',
    model: 'test/model',
    humanBefore: { direction: 'long', entry: 101, stop: 99, target: 105 },
    ai: {
      direction: 'short',
      anchor: { timeframe: 'm5', time: '2026-01-05T14:05:00.000Z', price: 103 },
      entry_plan: { entry: 103, stop: 105, target1: 99 },
      scenarios: [],
      comment: '冲高未站稳前高，量能收缩',
    },
    verdict: null,
    annotation: null,
    ...overrides,
  };
}

function makeBridge(coach: ReturnType<typeof vi.fn>): TrainerBridge {
  return { coach } as unknown as TrainerBridge;
}

// The panel puts its latest answer in the chart overlay, so the portal needs a host to land in.
function mount(view: TrainerView, bridge: TrainerBridge) {
  return render(
    <TrainerOverlayProvider>
      <TrainerCoachPanel view={view} bridge={bridge} sessionId="run-1" />
      <TrainerOverlayLayer />
    </TrainerOverlayProvider>,
  );
}

function askButton(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
});

describe('TrainerCoachPanel lock order', () => {
  it('keeps the button disabled until the trader has submitted', () => {
    const coach = vi.fn();
    mount(makeView(), makeBridge(coach));

    const button = askButton('问 AI');
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(coach).not.toHaveBeenCalled();
    expect(screen.getByText(/先提交你自己的方向与三价/)).toBeTruthy();
  });

  it('unlocks once a submission exists', () => {
    mount(makeView({ submitted: true }), makeBridge(vi.fn()));

    expect(askButton('问 AI').disabled).toBe(false);
    expect(screen.queryByText(/先提交你自己的方向与三价/)).toBeNull();
  });
});

describe('TrainerCoachPanel answers', () => {
  it('shows the second opinion and flags a disagreement, with no verdict mid-episode', async () => {
    const coach = vi.fn().mockResolvedValue({ ok: true, data: makeCall() });
    mount(makeView({ submitted: true }), makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await waitFor(() => {
      expect(screen.getByTestId('trainer-coach-comment').textContent).toBe(
        '冲高未站稳前高，量能收缩',
      );
    });
    expect(coach).toHaveBeenCalledWith({ sessionId: 'run-1' });
    expect(screen.getByText('与你分歧')).toBeTruthy();
    expect(screen.getByText('对错与理由的评判留到收盘后')).toBeTruthy();
    expect(askButton(/再问一次（第 2 次）/)).toBeTruthy();
  });

  it('leaves no answer on screen when the call fails', async () => {
    const coach = vi
      .fn()
      .mockResolvedValue({ ok: false, error: '模型没响应', code: 'TRAINER_PROTOCOL', status: 400 });
    mount(makeView({ submitted: true }), makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await waitFor(() => expect(screen.getByText('模型没响应')).toBeTruthy());
    expect(screen.queryByTestId('trainer-coach-comment')).toBeNull();
    expect(askButton('问 AI').disabled).toBe(false);
  });

  it('does not flag agreement as a disagreement', async () => {
    const agreed = makeCall({
      ai: { ...makeCall().ai, direction: 'long' },
    });
    const coach = vi.fn().mockResolvedValue({ ok: true, data: agreed });
    mount(makeView({ submitted: true }), makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await waitFor(() => expect(screen.getByTestId('trainer-coach-comment')).toBeTruthy());
    expect(screen.queryByText('与你分歧')).toBeNull();
  });
});
