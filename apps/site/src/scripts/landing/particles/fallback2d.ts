import type { ParticleFrame, ParticleRenderer, RendererConfig } from './types';

export const createCanvas2dRenderer = (
  canvas: HTMLCanvasElement,
  config: RendererConfig,
): ParticleRenderer => {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context unavailable');
  }

  let width = 0;
  let height = 0;

  const applySize = (nextWidth: number, nextHeight: number): void => {
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(nextWidth * config.dpr);
    canvas.height = Math.round(nextHeight * config.dpr);
    context.setTransform(config.dpr, 0, 0, config.dpr, 0, 0);
  };

  applySize(canvas.clientWidth, canvas.clientHeight);

  const resize = (nextWidth: number, nextHeight: number): void => {
    applySize(nextWidth, nextHeight);
  };

  const render = (frame: ParticleFrame): void => {
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';

    const count = Math.min(frame.count, config.capacity);
    for (let i = 0; i < count; i++) {
      const heat = frame.heats[i];
      const r = config.baseColor[0] + (config.hotColor[0] - config.baseColor[0]) * heat;
      const g = config.baseColor[1] + (config.hotColor[1] - config.baseColor[1]) * heat;
      const b = config.baseColor[2] + (config.hotColor[2] - config.baseColor[2]) * heat;
      const alpha = 0.35 + heat * 0.65;
      const size = frame.sizes[i] * (0.6 + heat * 0.8);
      const x = frame.positions[i * 2];
      const y = frame.positions[i * 2 + 1];

      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }

    context.globalCompositeOperation = 'source-over';
  };

  const dispose = (): void => {
    context.clearRect(0, 0, width, height);
  };

  return { resize, render, dispose };
};
