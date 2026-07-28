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

export const createParticleRenderer = async (
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions,
): Promise<ParticleRenderer | null> => {
  if (options.tier === 'still') return null;
  if (options.tier === 'lite') return createCanvas2dRenderer(canvas, options);

  let active: ParticleRenderer;
  try {
    const { createWebglRenderer } = await import('./webgl');
    active = await createWebglRenderer(canvas, options);
  } catch (error) {
    options.onDegrade?.(toReason(error));
    return createCanvas2dRenderer(canvas, options);
  }

  let degraded = false;
  let failureCount = 0;

  const rebuild = async (): Promise<void> => {
    const previous = active;
    try {
      const { createWebglRenderer } = await import('./webgl');
      const next = await createWebglRenderer(canvas, options);
      previous.dispose();
      active = next;
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      if (failureCount >= MAX_REBUILD_FAILURES) {
        degraded = true;
        previous.dispose();
        active = createCanvas2dRenderer(canvas, options);
        options.onDegrade?.(toReason(error));
      }
    }
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (degraded) return;
    void rebuild();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost);

  return {
    resize: (width, height) => active.resize(width, height),
    render: (frame) => active.render(frame),
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      active.dispose();
    },
  };
};
