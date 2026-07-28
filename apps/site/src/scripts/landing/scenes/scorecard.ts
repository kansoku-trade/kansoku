import { mountReveal } from '../reveal';
import type { Tier } from '../tier';

export interface ScorecardScene {
  destroy: () => void;
}

const ROW_STEP_MS = 260;

const finalRateOf = (rateEl: HTMLElement | null): number => Number(rateEl?.dataset.final ?? '0');

const settleFinal = (rows: HTMLElement[], rateEl: HTMLElement | null): void => {
  for (const row of rows) row.classList.add('is-flipped');
  if (rateEl) rateEl.textContent = `${finalRateOf(rateEl)}%`;
};

const runCountUp = (rows: HTMLElement[], rateEl: HTMLElement | null): (() => void) => {
  const timers: number[] = [];
  const finalRate = finalRateOf(rateEl);
  let runningHits = 0;

  if (rateEl) rateEl.textContent = '0%';

  rows.forEach((row, index) => {
    timers.push(
      window.setTimeout(() => {
        row.classList.add('is-flipped');
        if (row.dataset.outcome === 'hit') runningHits += 1;
        if (rateEl) {
          const runningRate = Math.round((runningHits / (index + 1)) * 100);
          rateEl.textContent = `${runningRate}%`;
        }
      }, index * ROW_STEP_MS),
    );
  });

  timers.push(
    window.setTimeout(
      () => {
        if (rateEl) rateEl.textContent = `${finalRate}%`;
      },
      rows.length * ROW_STEP_MS + 120,
    ),
  );

  return () => {
    for (const timer of timers) window.clearTimeout(timer);
  };
};

export const mountScorecardScene = (root: HTMLElement, tier: Tier): ScorecardScene | null => {
  try {
    const scene = root.querySelector<HTMLElement>('[data-scorecard-scene]');
    if (!scene) return null;

    const rows = Array.from(scene.querySelectorAll<HTMLElement>('[data-sc-row]'));
    const rateEl = scene.querySelector<HTMLElement>('[data-sc-rate-value]');

    if (tier === 'still') return null;

    const stopReveal = mountReveal(root);

    if (tier === 'lite') {
      settleFinal(rows, rateEl);
      return { destroy: stopReveal };
    }

    let stopSequence: (() => void) | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          stopSequence = runCountUp(rows, rateEl);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(scene);

    return {
      destroy: () => {
        observer.disconnect();
        stopSequence?.();
        stopReveal();
      },
    };
  } catch {
    return null;
  }
};
