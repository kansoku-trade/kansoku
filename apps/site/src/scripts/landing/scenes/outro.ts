import { mountReveal } from '../reveal';
import type { Tier } from '../tier';

export interface OutroScene {
  destroy: () => void;
}

const SWEEP_SECONDS = 2.2;
const HOLD_SECONDS = 1.6;
const CYCLE_SECONDS = SWEEP_SECONDS + HOLD_SECONDS;
const EDGE_WIDTH = 46;

interface ElementCanvasContext extends CanvasRenderingContext2D {
  drawElementImage?: (element: Element, dx: number, dy: number) => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const mountOutroScene = (root: ParentNode, tier: Tier): OutroScene | null => {
  try {
    const scene = root.querySelector<HTMLElement>('[data-outro-scene]');
    if (!scene) return null;

    const stopReveal = mountReveal(root);
    const teardown: Array<() => void> = [stopReveal];

    const canvas = scene.querySelector<HTMLCanvasElement>('[data-outro-canvas]');
    const source = scene.querySelector<HTMLElement>('[data-outro-src]');
    const ctx = canvas ? (canvas.getContext('2d') as ElementCanvasContext | null) : null;
    const drawElementImage = ctx?.drawElementImage;

    if (tier === 'still' || !canvas || !source || !ctx || typeof drawElementImage !== 'function') {
      scene.dataset.mode = 'plain';
      return { destroy: () => teardown.forEach((fn) => fn()) };
    }

    scene.dataset.mode = 'canvas';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const layout = (): void => {
      const rect = scene.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (dx: number, dy: number): void => {
      drawElementImage.call(ctx, source, dx, dy);
    };

    let rafId = 0;
    let elapsed = 0;
    let previous = performance.now();
    let running = false;
    let degraded = false;

    const degrade = (): void => {
      if (degraded) return;
      degraded = true;
      running = false;
      window.cancelAnimationFrame(rafId);
      scene.dataset.mode = 'plain';
    };

    const frame = (now: number): void => {
      try {
        const delta = Math.min(0.05, (now - previous) / 1000);
        previous = now;
        elapsed = (elapsed + delta) % CYCLE_SECONDS;
        const sweep = clamp01(elapsed / SWEEP_SECONDS);
        const revealX = sweep * (width + EDGE_WIDTH);

        ctx.clearRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = 0.14;
        paint(0, 0);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, revealX, height);
        ctx.clip();
        paint(0, 0);
        ctx.restore();

        if (sweep < 1) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const gradient = ctx.createLinearGradient(revealX - EDGE_WIDTH, 0, revealX, 0);
          gradient.addColorStop(0, 'rgba(255, 176, 0, 0)');
          gradient.addColorStop(1, 'rgba(255, 176, 0, 0.45)');
          ctx.fillStyle = gradient;
          ctx.fillRect(revealX - EDGE_WIDTH, 0, EDGE_WIDTH, height);
          ctx.restore();
        }

        rafId = window.requestAnimationFrame(frame);
      } catch {
        degrade();
      }
    };

    const start = (): void => {
      if (running || degraded) return;
      running = true;
      previous = performance.now();
      rafId = window.requestAnimationFrame(frame);
    };

    const stop = (): void => {
      running = false;
      window.cancelAnimationFrame(rafId);
    };

    const renderResting = (): void => {
      ctx.clearRect(0, 0, width, height);
      paint(0, 0);
    };

    layout();
    try {
      renderResting();
    } catch {
      degrade();
    }

    const onResize = (): void => {
      try {
        layout();
        if (!running) renderResting();
      } catch {
        degrade();
      }
    };
    window.addEventListener('resize', onResize);
    teardown.push(() => window.removeEventListener('resize', onResize));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) start();
          else stop();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(scene);
    teardown.push(() => observer.disconnect());
    teardown.push(stop);

    return {
      destroy: () => teardown.forEach((fn) => fn()),
    };
  } catch {
    return null;
  }
};
