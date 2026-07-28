import { createParticleRenderer } from '../particles';
import { mountReveal } from '../reveal';
import type { Tier } from '../tier';

export interface OutroScene {
  destroy: () => void;
}

const STATUS_TEXT = '有出处 · 不改口 · 有战绩';
const SAMPLE_W = 640;
const SAMPLE_H = 110;
const FULL_CAPACITY = 360;
const LITE_CAPACITY = 140;
const SCATTER_SECONDS = 0.4;
const CONVERGE_SECONDS = 1.6;
const HOLD_SECONDS = 1.4;
const TOTAL_SECONDS = SCATTER_SECONDS + CONVERGE_SECONDS + HOLD_SECONDS;
const FADE_HOLD_MS = 700;
const RENDERER_TIMEOUT_MS = 3000;
const BASE_COLOR: [number, number, number] = [120, 62, 8];
const HOT_COLOR: [number, number, number] = [255, 176, 0];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });

const sampleTextPoints = (text: string, capacity: number): Float32Array => {
  const points = new Float32Array(capacity * 2);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return points;

  ctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 32px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(text, SAMPLE_W / 2, SAMPLE_H / 2);

  const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
  const candidates: number[] = [];
  for (let y = 0; y < SAMPLE_H; y += 2) {
    for (let x = 0; x < SAMPLE_W; x += 2) {
      if (data[(y * SAMPLE_W + x) * 4 + 3] > 128) candidates.push(x / SAMPLE_W, y / SAMPLE_H);
    }
  }

  const candidateCount = candidates.length / 2;
  if (candidateCount === 0) return points;

  const stride = candidateCount / capacity;
  for (let i = 0; i < capacity; i++) {
    const index = Math.floor((i * stride) % candidateCount);
    points[i * 2] = candidates[index * 2];
    points[i * 2 + 1] = candidates[index * 2 + 1];
  }
  return points;
};

const buildScatter = (count: number, seed: number): Float32Array => {
  const positions = new Float32Array(count * 2);
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.32 + random() * 0.6;
    positions[i * 2] = 0.5 + Math.cos(angle) * radius;
    positions[i * 2 + 1] = 0.5 + Math.sin(angle) * radius * 0.7;
  }
  return positions;
};

const mountFull = async (
  scene: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<OutroScene | null> => {
  const setup = async () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = await createParticleRenderer(canvas, {
      tier: 'full',
      capacity: FULL_CAPACITY,
      dpr,
      baseColor: BASE_COLOR,
      hotColor: HOT_COLOR,
    });
    if (!renderer) throw new Error('particle renderer unavailable');
    return renderer;
  };

  const renderer = await withTimeout(setup(), RENDERER_TIMEOUT_MS);
  if (!renderer) return null;

  const targets = sampleTextPoints(STATUS_TEXT, FULL_CAPACITY);
  const starts = buildScatter(FULL_CAPACITY, 20260728);
  const positions = new Float32Array(FULL_CAPACITY * 2);
  const heats = new Float32Array(FULL_CAPACITY);
  const sizes = new Float32Array(FULL_CAPACITY);
  for (let i = 0; i < FULL_CAPACITY; i++) sizes[i] = 1.1 + (i % 5) * 0.2;

  let width = 0;
  let height = 0;
  const layout = (): void => {
    const rect = scene.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    renderer.resize(width, height);
  };
  layout();

  let rafId = 0;
  let startTime: number | null = null;
  let disposed = false;
  const timers: number[] = [];

  const finish = (): void => {
    scene.classList.add('is-formed');
    timers.push(window.setTimeout(() => scene.classList.add('is-faded'), 20));
    timers.push(
      window.setTimeout(() => {
        if (!disposed) {
          disposed = true;
          renderer.dispose();
        }
      }, FADE_HOLD_MS),
    );
  };

  const tick = (now: number): void => {
    startTime ??= now;
    const clock = (now - startTime) / 1000;
    const eased = easeOutCubic(clamp01((clock - SCATTER_SECONDS) / CONVERGE_SECONDS));

    for (let i = 0; i < FULL_CAPACITY; i++) {
      const sx = starts[i * 2] * width;
      const sy = starts[i * 2 + 1] * height;
      const tx = targets[i * 2] * width;
      const ty = targets[i * 2 + 1] * height;
      positions[i * 2] = sx + (tx - sx) * eased;
      positions[i * 2 + 1] = sy + (ty - sy) * eased;
      heats[i] = 0.3 + eased * 0.7;
    }
    renderer.render({ positions, heats, sizes, count: FULL_CAPACITY });

    if (clock >= TOTAL_SECONDS) {
      finish();
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  };

  window.addEventListener('resize', layout);
  rafId = window.requestAnimationFrame(tick);

  return {
    destroy: () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', layout);
      for (const timer of timers) window.clearTimeout(timer);
      if (!disposed) {
        disposed = true;
        renderer.dispose();
      }
    },
  };
};

const mountLite = (scene: HTMLElement, canvas: HTMLCanvasElement): OutroScene => {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { destroy: () => {} };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targets = sampleTextPoints(STATUS_TEXT, LITE_CAPACITY);

    const draw = (): void => {
      const rect = scene.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255, 176, 0, 0.85)';
      for (let i = 0; i < LITE_CAPACITY; i++) {
        const x = targets[i * 2] * width;
        const y = targets[i * 2 + 1] * height;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    };

    draw();
    scene.classList.add('is-formed');
    const timer = window.setTimeout(() => scene.classList.add('is-faded'), FADE_HOLD_MS);
    window.addEventListener('resize', draw);

    return {
      destroy: () => {
        window.clearTimeout(timer);
        window.removeEventListener('resize', draw);
      },
    };
  } catch {
    return { destroy: () => {} };
  }
};

export const mountOutroScene = (root: HTMLElement, tier: Tier): OutroScene | null => {
  try {
    const scene = root.querySelector<HTMLElement>('[data-outro-scene]');
    const canvas = root.querySelector<HTMLCanvasElement>('[data-outro-canvas]');
    if (!scene || !canvas) return null;

    if (tier === 'still') return null;

    const stopReveal = mountReveal(root);

    if (tier === 'lite') {
      const liteScene = mountLite(scene, canvas);
      return {
        destroy: () => {
          stopReveal();
          liteScene.destroy();
        },
      };
    }

    let active: OutroScene | null = null;
    let disposed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          void mountFull(scene, canvas).then((result) => {
            if (disposed) {
              result?.destroy();
              return;
            }
            active = result;
          });
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(scene);

    return {
      destroy: () => {
        stopReveal();
        disposed = true;
        observer.disconnect();
        active?.destroy();
      },
    };
  } catch {
    return null;
  }
};
