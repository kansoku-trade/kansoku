import { mountReveal } from '../reveal';
import type { Tier } from '../tier';

export interface NoRetractScene {
  destroy: () => void;
}

const ITEM_STEP_MS = 900;

const settleFinal = (items: HTMLElement[]): void => {
  for (const item of items) item.classList.add('is-hit');
};

const runSequence = (items: HTMLElement[]): (() => void) => {
  const timers: number[] = [];

  items.forEach((item, index) => {
    timers.push(
      window.setTimeout(() => {
        item.classList.add('is-hit');
      }, index * ITEM_STEP_MS),
    );
  });

  return () => {
    for (const timer of timers) window.clearTimeout(timer);
  };
};

export const mountNoRetractScene = (root: HTMLElement, tier: Tier): NoRetractScene | null => {
  try {
    const scene = root.querySelector<HTMLElement>('[data-noretract-scene]');
    if (!scene) return null;

    const items = Array.from(scene.querySelectorAll<HTMLElement>('[data-challenge-item]'));

    if (tier === 'still') return null;

    const stopReveal = mountReveal(root);

    if (tier === 'lite') {
      settleFinal(items);
      return { destroy: stopReveal };
    }

    let stopSequence: (() => void) | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          stopSequence = runSequence(items);
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
