// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainerFillState, TrainerFillTask, TrainerPoolCounts } from '@kansoku/pro-api';

function pool(count: number): TrainerPoolCounts {
  return {
    total: count,
    byBasePeriod: { '1m': 0, '5m': count, '15m': 0, '30m': 0, '1h': 0 },
  };
}

function task(over: Partial<TrainerFillTask> = {}): TrainerFillTask {
  return {
    id: 't1',
    basePeriod: '5m',
    requested: 15,
    trigger: 'manual',
    status: 'done',
    phase: 'audit',
    activity: '补货完成',
    admitted: 5,
    error: null,
    startedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:01:00.000Z',
    finishedAt: '2026-07-28T00:01:00.000Z',
    ...over,
  };
}

const capabilities = { pro: true as boolean | null, licensed: true };
const openTrainer = vi.fn(async () => {});
const startFill = vi.fn(async () => ({ ok: true as const, data: task({ status: 'running' }) }));
const abortFill = vi.fn(async () => ({ ok: true as const, data: task({ status: 'aborted' }) }));
let openBridge: { openTrainer: () => Promise<void> } | null = { openTrainer };
let poolCounts = pool(3);
let fillState: TrainerFillState = {
  task: null,
  autoRefillEnabled: true,
  autoRefillSuspended: false,
};

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/features/desktop/desktopWindowsBridge', () => ({
  getOpenTrainerBridge: () => openBridge,
}));
vi.mock('@web/features/desktop/desktopTrainerBridge', () => ({
  getTrainerBridge: () => ({
    listPool: async () => ({ ok: true, data: poolCounts }),
    getFill: async () => ({ ok: true, data: fillState }),
    startFill,
    abortFill,
  }),
}));
vi.mock('@web/lib/ws/wsHub', () => ({ subscribeChannel: () => () => {} }));

const { TrainerCard } = await import('./TrainerCard');

// The card links to the statistics page, so it needs somewhere for that link to resolve against.
function renderCard() {
  return render(
    <MemoryRouter>
      <TrainerCard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  openTrainer.mockClear();
  startFill.mockClear();
  abortFill.mockClear();
  capabilities.pro = true;
  capabilities.licensed = true;
  openBridge = { openTrainer };
  poolCounts = pool(3);
  fillState = { task: null, autoRefillEnabled: true, autoRefillSuspended: false };
});

describe('TrainerCard', () => {
  it('shows the remaining case count and opens a session', async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText('案例池还有 3 局')).toBeTruthy());
    screen.getByText('开一局').click();
    expect(openTrainer).toHaveBeenCalledTimes(1);
  });

  it('offers a refill instead of an empty dead end when the pool is empty', async () => {
    poolCounts = pool(0);
    renderCard();

    await waitFor(() => expect(screen.getByText('案例池是空的')).toBeTruthy());
    screen.getByText('补货').click();
    expect(startFill).toHaveBeenCalledWith({ basePeriod: '5m', count: 15 });
  });

  it('shows live progress and a cancel action while a refill runs', async () => {
    poolCounts = pool(0);
    fillState = {
      task: task({ status: 'running', activity: '正在采样候选（12/20）', admitted: 3 }),
      autoRefillEnabled: true,
      autoRefillSuspended: false,
    };
    renderCard();

    await waitFor(() => expect(screen.getByText('正在采样候选（12/20） · 已入池 3')).toBeTruthy());
    screen.getByText('取消').click();
    expect(abortFill).toHaveBeenCalledWith({ id: 't1' });
  });

  it('surfaces the reason a refill failed', async () => {
    poolCounts = pool(0);
    fillState = {
      task: task({ status: 'failed', admitted: 0, error: '长桥未登录' }),
      autoRefillEnabled: true,
      autoRefillSuspended: false,
    };
    renderCard();

    await waitFor(() => expect(screen.getByText('上次补货失败：长桥未登录')).toBeTruthy());
    expect(screen.getByText('重试补货')).toBeTruthy();
  });

  it('distinguishes a clean run that admitted nothing from an error', async () => {
    poolCounts = pool(0);
    fillState = {
      task: task({ status: 'done', admitted: 0 }),
      autoRefillEnabled: true,
      autoRefillSuspended: false,
    };
    renderCard();

    await waitFor(() => expect(screen.getByText('上次补货没找到合规案例')).toBeTruthy());
  });

  it('says so when auto refill has stood itself down', async () => {
    poolCounts = pool(0);
    fillState = {
      task: task({ status: 'failed', admitted: 0, error: '长桥未登录' }),
      autoRefillEnabled: true,
      autoRefillSuspended: true,
    };
    renderCard();

    await waitFor(() => expect(screen.getByText('连续两次没补到，自动补货已暂停')).toBeTruthy());
    expect(screen.getByText('手动补货')).toBeTruthy();
  });

  it('offers the subscription prompt instead of a count when unlicensed', () => {
    capabilities.licensed = false;
    renderCard();

    expect(screen.getByText('订阅后可用')).toBeTruthy();
    screen.getByText('了解订阅').click();
    expect(openTrainer).not.toHaveBeenCalled();
  });

  it('renders nothing in a build without the pro module', () => {
    capabilities.pro = false;
    const { container } = renderCard();

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing outside the desktop shell', () => {
    openBridge = null;
    const { container } = renderCard();

    expect(container.innerHTML).toBe('');
  });
});
