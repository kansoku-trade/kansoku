import type { ReplicaChart } from '../replica/chart';
import { signedPct, signedR, trainerStatsAt } from '../replica/trainerPlan';

const SPEED_INTERVAL_MS: Record<number, number> = { 1: 620, 2: 320, 4: 160 };

export interface TrainerControls {
  destroy: () => void;
}

export const mountTrainerControls = (
  root: ParentNode,
  chart: ReplicaChart | null,
): TrainerControls | null => {
  const step = root.querySelector<HTMLButtonElement>('[data-trainer-step]');
  const play = root.querySelector<HTMLButtonElement>('[data-trainer-play]');
  const speeds = root.querySelector<HTMLElement>('[data-trainer-speeds]');
  if (!chart || !step || !play) return null;

  const remaining = root.querySelector<HTMLElement>('[data-trainer-remaining]');
  const tradeR = root.querySelector<HTMLElement>('[data-trainer-trade-r]');
  const tradePct = root.querySelector<HTMLElement>('[data-trainer-trade-pct]');
  const sessionR = root.querySelector<HTMLElement>('[data-trainer-session-r]');
  const toast = root.querySelector<HTMLElement>('[data-trainer-toast]');

  let speed = 1;
  let timer = 0;

  const render = (): boolean => {
    const stats = trainerStatsAt(chart.cursor());
    if (remaining) remaining.textContent = String(stats.remaining);
    if (tradeR) {
      tradeR.textContent = signedR(stats.tradeR);
      tradeR.dataset.tone = stats.tradeR >= 0 ? 'up' : 'down';
    }
    if (tradePct) tradePct.textContent = signedPct(stats.tradePct);
    if (sessionR) {
      sessionR.textContent = signedR(stats.sessionR);
      sessionR.dataset.tone = stats.sessionR >= 0 ? 'up' : 'down';
    }
    if (stats.done && toast) toast.textContent = '这一局走完了 · 揭盲后按 R 结算';
    step.disabled = stats.done;
    return stats.done;
  };

  const stop = (): void => {
    window.clearInterval(timer);
    timer = 0;
    play.setAttribute('aria-pressed', 'false');
  };

  const advance = (): void => {
    chart.advance();
    if (render()) stop();
  };

  const onStep = (): void => {
    stop();
    advance();
  };

  const onPlay = (): void => {
    if (timer) {
      stop();
      return;
    }
    if (render()) return;
    play.setAttribute('aria-pressed', 'true');
    timer = window.setInterval(advance, SPEED_INTERVAL_MS[speed] ?? 620);
  };

  const onSpeed = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-speed]');
    if (!button || !speeds) return;
    speed = Number(button.dataset.speed) || 1;
    for (const other of speeds.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    if (timer) {
      window.clearInterval(timer);
      timer = window.setInterval(advance, SPEED_INTERVAL_MS[speed] ?? 620);
    }
  };

  step.addEventListener('click', onStep);
  play.addEventListener('click', onPlay);
  speeds?.addEventListener('click', onSpeed);
  render();

  return {
    destroy: () => {
      stop();
      step.removeEventListener('click', onStep);
      play.removeEventListener('click', onPlay);
      speeds?.removeEventListener('click', onSpeed);
    },
  };
};
