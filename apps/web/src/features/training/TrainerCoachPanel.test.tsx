// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerCoachCall } from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TrainerCoachPanel } from './TrainerCoachPanel';
import { TrainerOverlayLayer, TrainerOverlayProvider } from './trainerOverlay';

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
function mount(bridge: TrainerBridge) {
  return render(
    <TrainerOverlayProvider>
      <TrainerCoachPanel bridge={bridge} sessionId="run-1" />
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

describe('TrainerCoachPanel availability', () => {
  it('is askable with nothing submitted and no position open', async () => {
    const coach = vi.fn().mockResolvedValue({ ok: true, data: makeCall() });
    mount(makeBridge(coach));

    const button = askButton('问 AI');
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(coach).toHaveBeenCalledWith({ sessionId: 'run-1' }));
  });

  it('counts the calls made so far on the button', async () => {
    const coach = vi.fn().mockResolvedValue({ ok: true, data: makeCall() });
    mount(makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await waitFor(() => expect(askButton('问 AI · 1')).toBeTruthy());
  });
});

describe('TrainerCoachPanel answers', () => {
  it('shows the stance collapsed and the reasoning only once expanded', async () => {
    const coach = vi.fn().mockResolvedValue({ ok: true, data: makeCall() });
    mount(makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    const chip = await screen.findByTestId('trainer-coach-latest');
    expect(chip.textContent).toContain('做空');
    expect(chip.textContent).toContain('103 / 105 / 99');
    expect(screen.getByText('与你分歧')).toBeTruthy();
    expect(screen.queryByTestId('trainer-coach-comment')).toBeNull();

    fireEvent.click(chip);

    const comment = screen.getByTestId('trainer-coach-comment');
    expect(comment.textContent).toContain('冲高未站稳前高，量能收缩');
    expect(comment.textContent).toContain('对错与理由的评判留到收盘后');
  });

  it('leaves no answer on screen when the call fails', async () => {
    const coach = vi
      .fn()
      .mockResolvedValue({ ok: false, error: '模型没响应', code: 'TRAINER_PROTOCOL', status: 400 });
    mount(makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await waitFor(() => expect(screen.getByText('模型没响应')).toBeTruthy());
    expect(screen.queryByTestId('trainer-coach-latest')).toBeNull();
    expect(askButton('问 AI').disabled).toBe(false);
  });

  it('does not flag agreement as a disagreement', async () => {
    const agreed = makeCall({ ai: { ...makeCall().ai, direction: 'long' } });
    const coach = vi.fn().mockResolvedValue({ ok: true, data: agreed });
    mount(makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await screen.findByTestId('trainer-coach-latest');
    expect(screen.queryByText('与你分歧')).toBeNull();
  });

  it('flags no disagreement when the trader had taken no side to disagree with', async () => {
    const coach = vi.fn().mockResolvedValue({ ok: true, data: makeCall({ humanBefore: null }) });
    mount(makeBridge(coach));

    fireEvent.click(askButton('问 AI'));

    await screen.findByTestId('trainer-coach-latest');
    expect(screen.queryByText('与你分歧')).toBeNull();
  });
});
