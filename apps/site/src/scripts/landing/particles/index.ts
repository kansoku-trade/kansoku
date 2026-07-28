import type { Tier } from '../tier';
import { createCanvas2dRenderer } from './fallback2d';
import type { ParticleRenderer, RendererConfig } from './types';

export interface CreateRendererOptions extends RendererConfig {
  tier: Tier;
  onDegrade?: (reason: string) => void;
}

const MAX_REBUILD_FAILURES = 2;

const toReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// a canvas's context type is fixed for its lifetime once acquired; getContext('2d')
// on a canvas that already vended a webgl context returns null, so degrading to the
// 2D fallback requires swapping in a fresh element rather than reusing this one
const resetCanvas = (previous: HTMLCanvasElement): HTMLCanvasElement => {
  const next = previous.cloneNode(false) as HTMLCanvasElement;
  previous.replaceWith(next);
  return next;
};

export const createParticleRenderer = async (
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions,
): Promise<ParticleRenderer | null> => {
  if (options.tier === 'still') return null;
  if (options.tier === 'lite') return createCanvas2dRenderer(canvas, options);

  let activeCanvas = canvas;
  let active: ParticleRenderer;
  try {
    const { createWebglRenderer } = await import('./webgl');
    active = await createWebglRenderer(activeCanvas, options);
  } catch (error) {
    options.onDegrade?.(toReason(error));
    activeCanvas = resetCanvas(activeCanvas);
    return createCanvas2dRenderer(activeCanvas, options);
  }

  let degraded = false;
  let failureCount = 0;

  const rebuild = async (): Promise<void> => {
    const previous = active;
    try {
      const { createWebglRenderer } = await import('./webgl');
      const next = await createWebglRenderer(activeCanvas, options);
      previous.dispose();
      active = next;
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      if (failureCount >= MAX_REBUILD_FAILURES) {
        degraded = true;
        previous.dispose();
        activeCanvas = resetCanvas(activeCanvas);
        active = createCanvas2dRenderer(activeCanvas, options);
        options.onDegrade?.(toReason(error));
      }
    }
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
  };

  const handleContextRestored = (): void => {
    if (degraded) return;
    void rebuild();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  return {
    resize: (width, height) => active.resize(width, height),
    render: (frame) => active.render(frame),
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      active.dispose();
    },
  };
};
