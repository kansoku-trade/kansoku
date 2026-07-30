// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerFillState, TrainerFillTask } from '@kansoku/pro-api';

const open = vi.fn();
const getTrainerBridge = vi.fn();
const startFill = vi.fn();
let fillState: TrainerFillState = {
  task: null,
  autoRefillEnabled: true,
  autoRefillSuspended: false,
};

vi.mock('../desktop/desktopTrainerBridge', () => ({
  getTrainerBridge: () => getTrainerBridge(),
}));

vi.mock('../desktop/shellRpc', () => ({ getShellRpc: () => null }));

vi.mock('./useTrainerFill', () => ({
  useTrainerFill: () => ({
    state: fillState,
    pending: false,
    error: null,
    startFill,
    abortFill: vi.fn(),
  }),
}));

vi.mock('./TrainerChart', () => ({
  TrainerChart: ({ sessionId }: { sessionId?: string }) => <div>chart:{sessionId}</div>,
}));

const { TrainerLauncher } = await import('./TrainerLauncher');

function runningTask(admitted: number): TrainerFillTask {
  return {
    id: 'fill-1',
    basePeriod: '5m',
    requested: 15,
    trigger: 'pool-read',
    status: 'running',
    phase: 'hard-rule-gate',
    activity: '正在筛案例',
    admitted,
    error: null,
    startedAt: '2026-07-30T14:30:00.000Z',
    updatedAt: '2026-07-30T14:30:10.000Z',
    finishedAt: null,
  };
}

afterEach(() => {
  cleanup();
  fillState = { task: null, autoRefillEnabled: true, autoRefillSuspended: false };
  open.mockReset();
  getTrainerBridge.mockReset();
  startFill.mockReset();
});

describe('TrainerLauncher', () => {
  it('reports the refill in flight instead of a bare dead end when the case pool is empty', async () => {
    fillState = { task: runningTask(2), autoRefillEnabled: true, autoRefillSuspended: false };
    open.mockResolvedValue({
      ok: false,
      error: 'no cases for 5m',
      code: 'TRAINER_POOL_EMPTY',
      status: 404,
    });
    getTrainerBridge.mockReturnValue({ open });

    render(<TrainerLauncher />);

    expect(await screen.findByText('正在攒案例')).toBeTruthy();
    expect(screen.getByText('2/15')).toBeTruthy();
    expect(screen.getByText('正在筛案例')).toBeTruthy();
    expect(screen.getByLabelText('正在筛案例').querySelectorAll('.is-done')).toHaveLength(1);
    expect(screen.getByLabelText('正在筛案例').querySelectorAll('.is-active')).toHaveLength(1);
  });

  it('walks a newcomer through a round while the pool fills', async () => {
    fillState = { task: runningTask(2), autoRefillEnabled: true, autoRefillSuspended: false };
    open.mockResolvedValue({
      ok: false,
      error: 'no cases for 5m',
      code: 'TRAINER_POOL_EMPTY',
      status: 404,
    });
    getTrainerBridge.mockReturnValue({ open });

    render(<TrainerLauncher />);

    expect(await screen.findByRole('heading', { name: '盲盘训练' })).toBeTruthy();
    for (const step of ['选方向', '放线', '推进', '结算'])
      expect(screen.getByText(step)).toBeTruthy();
  });

  it('offers a manual refill when the pool is empty and nothing is filling it', async () => {
    open.mockResolvedValue({
      ok: false,
      error: 'no cases for 5m',
      code: 'TRAINER_POOL_EMPTY',
      status: 404,
    });
    getTrainerBridge.mockReturnValue({ open });

    render(<TrainerLauncher />);

    expect(await screen.findByText('案例池是空的')).toBeTruthy();
    screen.getByRole('button', { name: '补货' }).click();
    expect(startFill).toHaveBeenCalledWith('5m', 15);
  });

  it('opens the session itself once the refill it triggered has admitted cases', async () => {
    open.mockResolvedValue({
      ok: false,
      error: 'no cases for 5m',
      code: 'TRAINER_POOL_EMPTY',
      status: 404,
    });
    getTrainerBridge.mockReturnValue({ open });

    const { rerender } = render(<TrainerLauncher />);
    expect(await screen.findByText('案例池是空的')).toBeTruthy();

    const finished = runningTask(3);
    fillState = {
      task: { ...finished, status: 'done', finishedAt: '2026-07-30T14:31:00.000Z' },
      autoRefillEnabled: true,
      autoRefillSuspended: false,
    };
    open.mockResolvedValue({ ok: true, data: { sessionId: 's2', view: {} } });
    rerender(<TrainerLauncher />);

    expect(await screen.findByText('chart:s2')).toBeTruthy();
  });

  it('surfaces the failure text and a retry for any other open error', async () => {
    open.mockResolvedValue({
      ok: false,
      error: 'session store is locked',
      code: 'TRAINER_PROTOCOL',
      status: 400,
    });
    getTrainerBridge.mockReturnValue({ open });

    render(<TrainerLauncher />);

    expect(await screen.findByText('打不开训练局')).toBeTruthy();
    expect(screen.getByText('session store is locked')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '盲盘训练' })).toBeNull();

    open.mockResolvedValue({ ok: true, data: { sessionId: 's1', view: {} } });
    screen.getByRole('button', { name: '重试' }).click();
    expect(await screen.findByText('chart:s1')).toBeTruthy();
  });

  it('says so plainly when the trainer bridge is absent', async () => {
    getTrainerBridge.mockReturnValue(null);

    render(<TrainerLauncher />);

    expect(await screen.findByText('盲盘训练只在桌面端可用')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });
});
