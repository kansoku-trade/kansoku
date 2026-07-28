import { mountReveal } from '../reveal';
import type { Tier } from '../tier';

export interface SourcedScene {
  destroy: () => void;
}

const CELL_STEP_MS = 220;
const EXPAND_DELAY_MS = 360;

const settleFinal = (cells: HTMLElement[], detail: HTMLElement | null): void => {
  for (const cell of cells) cell.classList.add('is-shown');
  detail?.classList.add('is-expanded');
};

const runSequence = (cells: HTMLElement[], detail: HTMLElement | null): (() => void) => {
  const timers: number[] = [];

  cells.forEach((cell, index) => {
    timers.push(
      window.setTimeout(() => {
        cell.classList.add('is-shown');
      }, index * CELL_STEP_MS),
    );
  });

  if (detail) {
    timers.push(
      window.setTimeout(
        () => {
          detail.classList.add('is-expanded');
        },
        cells.length * CELL_STEP_MS + EXPAND_DELAY_MS,
      ),
    );
  }

  return () => {
    for (const timer of timers) window.clearTimeout(timer);
  };
};

export const mountSourcedScene = (root: HTMLElement, tier: Tier): SourcedScene | null => {
  try {
    const scene = root.querySelector<HTMLElement>('[data-sourced-scene]');
    if (!scene) return null;

    const cells = Array.from(scene.querySelectorAll<HTMLElement>('[data-tl-cell]'));
    const detail = scene.querySelector<HTMLElement>('[data-tl-detail]');

    if (tier === 'still') return null;

    const stopReveal = mountReveal(root);

    if (tier === 'lite') {
      settleFinal(cells, detail);
      return { destroy: stopReveal };
    }

    let stopSequence: (() => void) | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          stopSequence = runSequence(cells, detail);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
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
