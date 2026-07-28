import { mountReveal } from './reveal';
import type { Tier } from './tier';

export interface DensityWallScene {
  destroy: () => void;
}

interface ExperimentalCanvasContext extends CanvasRenderingContext2D {
  drawElementImage: (element: Element, dx: number, dy: number, dw: number, dh: number) => void;
}

const asElementImageContext = (
  ctx: CanvasRenderingContext2D,
): ExperimentalCanvasContext | null => {
  const candidate = ctx as ExperimentalCanvasContext;
  return typeof candidate.drawElementImage === 'function' ? candidate : null;
};

// drawElementImage ships behind chrome://flags/#canvas-draw-element and a Chrome
// 148-150 origin trial as of 2026-07-28; no browser exposes it in stable yet, so
// this branch is unreachable today by design. It stays wired so Chrome users
// upgrade automatically the day the API ships stable, with zero code changes.
const mountElementImageEnhancement = (root: HTMLElement): (() => void) | null => {
  try {
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe || !asElementImageContext(probe)) return null;

    const scene = root.querySelector<HTMLElement>('[data-density-scene]');
    const tiles = Array.from(root.querySelectorAll<HTMLElement>('.density-tile'));
    if (!scene || tiles.length === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.className = 'density-live-canvas';
    scene.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const experimental = ctx && asElementImageContext(ctx);
    if (!ctx || !experimental) {
      canvas.remove();
      return null;
    }
    const drawElementImage = experimental.drawElementImage.bind(experimental);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let rafId = 0;
    let disposed = false;

    const degrade = (): void => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', layout);
      canvas.remove();
    };

    const layout = (): void => {
      try {
        const rect = scene.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } catch {
        degrade();
      }
    };

    const tick = (): void => {
      try {
        ctx.clearRect(0, 0, width, height);
        const sceneRect = scene.getBoundingClientRect();
        ctx.globalAlpha = 0.16;
        for (const tile of tiles) {
          const tileRect = tile.getBoundingClientRect();
          drawElementImage(
            tile,
            tileRect.left - sceneRect.left,
            tileRect.top - sceneRect.top + 6,
            tileRect.width,
            tileRect.height,
          );
        }
        ctx.globalAlpha = 1;
      } catch {
        degrade();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    layout();
    if (disposed) return null;
    window.addEventListener('resize', layout);
    rafId = window.requestAnimationFrame(tick);

    return degrade;
  } catch {
    return null;
  }
};

export const mountDensityWall = (root: HTMLElement, tier: Tier): DensityWallScene | null => {
  try {
    if (tier === 'still') return null;

    const stopReveal = mountReveal(root);
    const stopEnhancement = tier === 'full' ? mountElementImageEnhancement(root) : null;

    return {
      destroy: () => {
        stopReveal();
        stopEnhancement?.();
      },
    };
  } catch {
    return null;
  }
};
