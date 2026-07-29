// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerStats } from '@kansoku/pro-api';
import { TrainingStatsPage } from './TrainingStatsPage';

const stats = vi.fn();
vi.mock('@web/features/desktop/desktopTrainerBridge', () => ({
  getTrainerBridge: () => ({ stats }),
}));

function makeStats(overrides: Partial<TrainerStats> = {}): TrainerStats {
  return {
    completedSessions: 3,
    unfinishedSessions: 1,
    sessionsByBasePeriod: { '5m': 3 } as TrainerStats['sessionsByBasePeriod'],
    overview: {
      samples: 3,
      locked: true,
      netR: 3,
      winRate: null,
      plannedRewardRisk: null,
      realizedRewardRisk: null,
      mfeGivebackRate: null,
    },
    byTag: [{ tag: 'false-breakout', samples: 3, locked: true, netR: 3, winRate: null }],
    stopHealth: {
      samples: 0,
      locked: true,
      reachedTargetAfterStopRate: null,
      averageOvershootPct: null,
    },
    coachInfluence: {
      samples: 2,
      locked: true,
      persuadedCount: 1,
      persuadedWinRate: null,
      heldCount: 1,
      heldWinRate: null,
    },
    advanceStyle: {
      samples: 3,
      locked: true,
      barByBarWinRate: null,
      fastForwardWinRate: null,
    },
    coachScorecard: {
      samples: 2,
      locked: true,
      settled: 1,
      annotated: 0,
      directionAccuracy: null,
      soundReasonRate: null,
      rightCallWrongReasonRate: null,
    },
    ...overrides,
  };
}

function unlockedStats(): TrainerStats {
  const base = makeStats({ completedSessions: 12, unfinishedSessions: 0 });
  return {
    ...base,
    overview: {
      samples: 12,
      locked: false,
      netR: 11.4,
      winRate: 0.47,
      plannedRewardRisk: 2.4,
      realizedRewardRisk: 1.3,
      mfeGivebackRate: 0.38,
    },
  };
}

function mount() {
  return render(
    <MemoryRouter>
      <TrainingStatsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  stats.mockReset();
});

describe('TrainingStatsPage sample guard', () => {
  it('reports counts and refuses ratios while any block is short of samples', async () => {
    stats.mockResolvedValue({ ok: true, data: makeStats() });
    mount();

    await waitFor(() => expect(screen.getAllByTestId('training-stats-locked').length).toBe(5));
    expect(screen.getByText(/共 3 局打完/)).toBeTruthy();
    expect(screen.getByText(/另有 1 局开了没打完/)).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
    expect(screen.getByText('3 局，样本不足')).toBeTruthy();
  });

  it('shows the ratios once a block clears the threshold', async () => {
    stats.mockResolvedValue({ ok: true, data: unlockedStats() });
    mount();

    await waitFor(() => expect(screen.getByText('47%')).toBeTruthy());
    expect(screen.getByText('2.40 → 1.30')).toBeTruthy();
    expect(screen.getByText('+11.40')).toBeTruthy();
    // The four blocks that are still short stay locked even though the overview opened up.
    expect(screen.getAllByTestId('training-stats-locked').length).toBe(4);
  });
});
