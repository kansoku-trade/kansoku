// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerCoachCall, TrainerCoachVerdict } from '@kansoku/pro-api';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TrainerCoachCompare } from './TrainerCoachCompare';

function verdict(overrides: Partial<TrainerCoachVerdict> = {}): TrainerCoachVerdict {
  return {
    outcome: 'win',
    plannedRewardRisk: 2,
    realizedR: 2,
    directionCorrect: true,
    agreement: 'held',
    judgedAt: '2026-01-05T15:00:00.000Z',
    ...overrides,
  };
}

function call(overrides: Partial<TrainerCoachCall> = {}): TrainerCoachCall {
  return {
    id: 'coach-1',
    cursor: 7,
    step: 8,
    askedAt: '2026-01-05T14:35:00.000Z',
    model: 'test/model',
    humanBefore: { direction: 'long', entry: 101, stop: 99, target: 105 },
    ai: {
      direction: 'short',
      anchor: { timeframe: 'm5', time: '2026-01-05T14:35:00.000Z', price: 103 },
      entry_plan: { entry: 103, stop: 105, target1: 99 },
      scenarios: [],
      comment: '冲高未站稳前高，量能收缩',
    },
    verdict: verdict(),
    annotation: null,
    ...overrides,
  };
}

function bridgeWith(annotate: ReturnType<typeof vi.fn>): TrainerBridge {
  return { annotate } as unknown as TrainerBridge;
}

afterEach(() => {
  cleanup();
});

describe('TrainerCoachCompare annotation gate', () => {
  it('asks about the reason only when the market confirmed the direction', () => {
    render(
      <TrainerCoachCompare
        calls={[call()]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('理由站得住吗？')).toBeTruthy();
    expect(screen.getByRole('button', { name: '站得住' })).toBeTruthy();
  });

  it('archives a refuted call without asking', () => {
    render(
      <TrainerCoachCompare
        calls={[call({ verdict: verdict({ outcome: 'loss', directionCorrect: false, realizedR: -1 }) })]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.queryByText('理由站得住吗？')).toBeNull();
    expect(screen.getByText('方向没判对，直接归档，不问理由。')).toBeTruthy();
  });

  it('shows no annotation row before the episode has been judged', () => {
    render(
      <TrainerCoachCompare
        calls={[call({ verdict: null })]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.queryByText('理由站得住吗？')).toBeNull();
    expect(screen.queryByText(/方向没判对/)).toBeNull();
  });

  it('sends the chosen verdict and hands the updated call back up', async () => {
    const annotated = call({ annotation: { verdict: 'sound', at: '2026-01-05T15:10:00.000Z' } });
    const annotate = vi.fn().mockResolvedValue({ ok: true, data: annotated });
    const onAnnotated = vi.fn();
    render(
      <TrainerCoachCompare
        calls={[call()]}
        bridge={bridgeWith(annotate)}
        sessionId="run-1"
        onAnnotated={onAnnotated}
        onSeek={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '结论对但理由错' }));

    await waitFor(() => expect(onAnnotated).toHaveBeenCalledWith(annotated));
    expect(annotate).toHaveBeenCalledWith({
      sessionId: 'run-1',
      coachId: 'coach-1',
      verdict: 'right_call_wrong_reason',
    });
  });
});

describe('TrainerCoachCompare readout', () => {
  it('names the disagreement and what came of it', () => {
    render(
      <TrainerCoachCompare
        calls={[call({ verdict: verdict({ agreement: 'persuaded' }) })]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('分歧 · 你改了 → 被说服')).toBeTruthy();
    expect(screen.getByText(/到目标 · \+2\.00R/)).toBeTruthy();
    expect(screen.getByText(/你当时：做多/)).toBeTruthy();
  });

  it('keeps an AI that agreed out of the comparison', () => {
    render(
      <TrainerCoachCompare
        calls={[call({ verdict: verdict({ agreement: 'aligned' }) })]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('同向 · 不进对照')).toBeTruthy();
  });

  it('seeks the timeline to the bar the question was asked on', () => {
    const onSeek = vi.fn();
    render(
      <TrainerCoachCompare
        calls={[call()]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={onSeek}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /第 1 次 · B7/ }));

    expect(onSeek).toHaveBeenCalledWith('coach-1');
  });

  it('says so plainly when the trader never asked', () => {
    render(
      <TrainerCoachCompare
        calls={[]}
        bridge={bridgeWith(vi.fn())}
        sessionId="run-1"
        onAnnotated={vi.fn()}
        onSeek={vi.fn()}
      />,
    );

    expect(screen.getByText('本局没有问过 AI。')).toBeTruthy();
  });
});
