import { heroCases } from '../cases';
import type { HeroCase } from '../cases';
import { buildCandles } from '../kline';
import type { Candle } from '../kline';
import { createParticleRenderer } from '../particles';
import { seedFlow } from '../shapes';
import type { Tier } from '../tier';

export interface HeroScene {
  destroy: () => void;
}

const CYCLE_SECONDS = 7.5;
const NODE_START = 0.7;
const NODE_STEP = 0.24;
const NODE_COUNT = 7;
const BARS_AT = 2.9;
const BARS_RISE = 1.0;
const STAMP_AT = 5.4;
const FADE_START = 6.9;
const RENDERER_TIMEOUT_MS = 3000;
const PARTICLE_CAPACITY = 420;
const BASE_COLOR: [number, number, number] = [120, 62, 8];
const HOT_COLOR: [number, number, number] = [255, 176, 0];

const BAR_KEYS = ['bull', 'base', 'bear'] as const;
type BarKey = (typeof BAR_KEYS)[number];

const TRACK_COLORS: Record<BarKey, string> = {
  bull: '#26a69a',
  base: '#ffb000',
  bear: '#ef5350',
};

interface NodePoint {
  x: number;
  y: number;
  angle: number;
}

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawState {
  nodePoints: NodePoint[];
  activations: Float32Array;
  barProgress: number;
  caseData: HeroCase;
  barRects: BarRect[];
  cardCenter: { x: number; y: number };
  time: number;
}

interface CardRefs {
  root: HTMLElement;
  sym: HTMLElement;
  dir: HTMLElement;
  trig: HTMLElement;
  stamp: HTMLElement;
  tracks: Record<BarKey, HTMLElement>;
  values: Record<BarKey, HTMLElement>;
}

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

const computeNodePoints = (width: number, height: number): NodePoint[] => {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.44;
  const points: NodePoint[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = -Math.PI / 2 + (i / NODE_COUNT) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle });
  }
  return points;
};

const buildBackdrop = (): Candle[] =>
  buildCandles(48, { seed: 20260728, start: 100, volatility: 3.4 });

const resolveCardRefs = (card: HTMLElement): CardRefs | null => {
  const sym = card.querySelector<HTMLElement>('[data-card-sym]');
  const dir = card.querySelector<HTMLElement>('[data-card-dir]');
  const trig = card.querySelector<HTMLElement>('[data-card-trig]');
  const stamp = card.querySelector<HTMLElement>('[data-card-stamp]');
  const bullTrack = card.querySelector<HTMLElement>('[data-bar-track="bull"]');
  const baseTrack = card.querySelector<HTMLElement>('[data-bar-track="base"]');
  const bearTrack = card.querySelector<HTMLElement>('[data-bar-track="bear"]');
  const bullValue = card.querySelector<HTMLElement>('[data-bar-value="bull"]');
  const baseValue = card.querySelector<HTMLElement>('[data-bar-value="base"]');
  const bearValue = card.querySelector<HTMLElement>('[data-bar-value="bear"]');

  if (
    !sym ||
    !dir ||
    !trig ||
    !stamp ||
    !bullTrack ||
    !baseTrack ||
    !bearTrack ||
    !bullValue ||
    !baseValue ||
    !bearValue
  ) {
    return null;
  }

  return {
    root: card,
    sym,
    dir,
    trig,
    stamp,
    tracks: { bull: bullTrack, base: baseTrack, bear: bearTrack },
    values: { bull: bullValue, base: baseValue, bear: bearValue },
  };
};

const measureBarRects = (root: HTMLElement, card: CardRefs, rootRect: DOMRect): BarRect[] =>
  BAR_KEYS.map((key) => {
    const trackRect = card.tracks[key].getBoundingClientRect();
    return {
      x: trackRect.left - rootRect.left,
      y: trackRect.top - rootRect.top,
      width: trackRect.width,
      height: trackRect.height,
    };
  });

const drawBackdropCandles = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: Candle[],
): void => {
  let high = -Infinity;
  let low = Infinity;
  for (const candle of backdrop) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  const range = high - low || 1;
  const top = height * 0.62;
  const bottom = height * 0.96;
  const slotWidth = width / backdrop.length;
  const yOf = (value: number): number => bottom - ((value - low) / range) * (bottom - top);

  for (let i = 0; i < backdrop.length; i++) {
    const candle = backdrop[i];
    const x = i * slotWidth + slotWidth * 0.5;
    ctx.strokeStyle = candle.up ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)';
    ctx.fillStyle = candle.up ? 'rgba(38, 166, 154, 0.07)' : 'rgba(239, 83, 80, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(candle.high));
    ctx.lineTo(x, yOf(candle.low));
    ctx.stroke();
    const bodyTop = yOf(Math.max(candle.open, candle.close));
    const bodyHeight = Math.max(1, Math.abs(yOf(candle.open) - yOf(candle.close)));
    ctx.fillRect(x - slotWidth * 0.28, bodyTop, slotWidth * 0.56, bodyHeight);
  }
};

const drawNodes = (ctx: CanvasRenderingContext2D, state: DrawState): void => {
  ctx.font = '10px ui-monospace, Menlo, monospace';
  for (let i = 0; i < state.nodePoints.length; i++) {
    const node = state.nodePoints[i];
    const evidence = state.caseData.nodes[i];
    const activation = state.activations[i];
    if (!evidence) continue;

    const endX = node.x + (state.cardCenter.x - node.x) * activation;
    const endY = node.y + (state.cardCenter.y - node.y) * activation;
    ctx.strokeStyle = `rgba(255, 176, 0, ${(0.08 + activation * 0.2).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = -state.time * 26;
    ctx.beginPath();
    ctx.moveTo(node.x, node.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(node.x, node.y, 3.6 + activation * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 176, 0, ${(0.25 + activation * 0.7).toFixed(3)})`;
    ctx.fill();

    const faceRight = Math.cos(node.angle) > -0.15;
    ctx.textAlign = faceRight ? 'left' : 'right';
    const offsetX = faceRight ? 12 : -12;

    ctx.fillStyle = `rgba(236, 236, 236, ${(0.3 + activation * 0.55).toFixed(3)})`;
    ctx.fillText(evidence.tool, node.x + offsetX, node.y - 2);
    ctx.fillStyle = `rgba(120, 120, 120, ${(0.28 + activation * 0.45).toFixed(3)})`;
    ctx.fillText(evidence.arg, node.x + offsetX, node.y + 11);
    if (activation > 0.35) {
      ctx.fillStyle = `rgba(255, 176, 0, ${((activation - 0.35) * 1.4).toFixed(3)})`;
      ctx.fillText(evidence.value, node.x + offsetX, node.y + 23);
    }
  }
  ctx.textAlign = 'left';
};

const drawBars = (ctx: CanvasRenderingContext2D, state: DrawState): void => {
  for (let i = 0; i < BAR_KEYS.length; i++) {
    const rect = state.barRects[i];
    if (!rect) continue;
    const key = BAR_KEYS[i];
    const percent = state.caseData.probabilities[key];
    const fillWidth = rect.width * (percent / 100) * state.barProgress;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = TRACK_COLORS[key];
    ctx.fillRect(rect.x, rect.y, fillWidth, rect.height);
  }
};

const drawScene = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: Candle[],
  state: DrawState,
): void => {
  ctx.clearRect(0, 0, width, height);
  drawBackdropCandles(ctx, width, height, backdrop);
  drawNodes(ctx, state);
  drawBars(ctx, state);
};

const applyCaseText = (card: CardRefs, data: HeroCase): void => {
  card.sym.textContent = data.symbol;
  card.dir.textContent = data.direction;
  card.dir.dataset.tone = data.tone;
  card.trig.textContent = `触发：${data.trigger}`;
};

const mountLite = (root: HTMLElement, canvas: HTMLCanvasElement, card: CardRefs): HeroScene | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backdrop = buildBackdrop();
  const data = heroCases[0];
  const activations = new Float32Array(NODE_COUNT).fill(1);

  const applyStatic = (): void => {
    const rect = root.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nodePoints = computeNodePoints(width, height);
    const cardCenter = { x: width / 2, y: height / 2 };
    const barRects = measureBarRects(root, card, rect);

    drawScene(ctx, width, height, backdrop, {
      nodePoints,
      activations,
      barProgress: 1,
      caseData: data,
      barRects,
      cardCenter,
      time: 0,
    });
  };

  applyCaseText(card, data);
  card.values.bull.textContent = `${data.probabilities.bull}%`;
  card.values.base.textContent = `${data.probabilities.base}%`;
  card.values.bear.textContent = `${data.probabilities.bear}%`;
  card.stamp.classList.add('is-visible');
  card.root.classList.add('is-visible');

  applyStatic();
  root.classList.add('is-live');
  window.addEventListener('resize', applyStatic);

  return {
    destroy: () => {
      window.removeEventListener('resize', applyStatic);
    },
  };
};

const mountFull = async (
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  particleCanvas: HTMLCanvasElement,
  card: CardRefs,
): Promise<HeroScene | null> => {
  const setup = async () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particleRenderer = await createParticleRenderer(particleCanvas, {
      tier: 'full',
      capacity: PARTICLE_CAPACITY,
      dpr,
      baseColor: BASE_COLOR,
      hotColor: HOT_COLOR,
    });
    if (!particleRenderer) throw new Error('particle renderer unavailable');
    return { ctx, dpr, particleRenderer };
  };

  const prepared = await withTimeout(setup(), RENDERER_TIMEOUT_MS);
  if (!prepared) return null;

  const { ctx, dpr, particleRenderer } = prepared;
  const backdrop = buildBackdrop();
  const seeds = seedFlow(PARTICLE_CAPACITY, NODE_COUNT, 20260728);

  const positions = new Float32Array(PARTICLE_CAPACITY * 2);
  const heats = new Float32Array(PARTICLE_CAPACITY);
  const sizes = new Float32Array(PARTICLE_CAPACITY);
  const tValues = new Float32Array(PARTICLE_CAPACITY);
  for (let i = 0; i < PARTICLE_CAPACITY; i++) {
    sizes[i] = 1.1 + (i % 5) * 0.22;
    tValues[i] = seeds[i].t;
  }

  const activations = new Float32Array(NODE_COUNT);

  let width = 0;
  let height = 0;
  let nodePoints: NodePoint[] = [];
  let cardCenter = { x: 0, y: 0 };
  let barRects: BarRect[] = [];

  const layout = (): void => {
    const rect = root.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodePoints = computeNodePoints(width, height);
    cardCenter = { x: width / 2, y: height / 2 };
    barRects = measureBarRects(root, card, rect);
    particleRenderer.resize(width, height);
  };

  let caseIndex = 0;
  let clock = 0;
  let stamped = false;
  let barsStarted = false;

  const applyCase = (): void => {
    const data = heroCases[caseIndex];
    applyCaseText(card, data);
    card.values.bull.textContent = '0%';
    card.values.base.textContent = '0%';
    card.values.bear.textContent = '0%';
    card.stamp.classList.remove('is-visible');
    card.root.classList.remove('is-visible');
    activations.fill(0);
    stamped = false;
    barsStarted = false;
  };

  const stepParticles = (dt: number): void => {
    for (let i = 0; i < PARTICLE_CAPACITY; i++) {
      const seed = seeds[i];
      const activation = activations[seed.link];
      const node = nodePoints[seed.link];
      if (!node || activation < 0.02) {
        heats[i] = 0;
        continue;
      }
      tValues[i] += seed.speed * dt;
      if (tValues[i] > 1) tValues[i] -= 1;
      const eased = 1 - Math.pow(1 - tValues[i], 1.7);
      const baseX = node.x + (cardCenter.x - node.x) * eased;
      const baseY = node.y + (cardCenter.y - node.y) * eased;
      const perp = Math.sin(tValues[i] * 11 + i) * 5 * (1 - eased) * seed.offset;
      positions[i * 2] = baseX + Math.cos(node.angle + Math.PI / 2) * perp;
      positions[i * 2 + 1] = baseY + Math.sin(node.angle + Math.PI / 2) * perp;
      heats[i] = activation * (0.35 + 0.65 * eased);
    }
  };

  applyCase();
  layout();

  let rafId = 0;
  let lastTime = performance.now();

  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    clock += dt;
    if (clock >= CYCLE_SECONDS) {
      clock -= CYCLE_SECONDS;
      caseIndex = (caseIndex + 1) % heroCases.length;
      applyCase();
    }

    if (clock < FADE_START) card.root.classList.add('is-visible');
    else card.root.classList.remove('is-visible');

    for (let i = 0; i < NODE_COUNT; i++) {
      const startAt = NODE_START + i * NODE_STEP;
      const target = clock >= startAt && clock < FADE_START ? 1 : 0;
      const rate = target > activations[i] ? 3.2 : 4.4;
      activations[i] += (target - activations[i]) * Math.min(1, dt * rate);
    }

    if (clock >= BARS_AT) barsStarted = true;
    const barProgress = barsStarted ? easeOutCubic(clamp01((clock - BARS_AT) / BARS_RISE)) : 0;
    if (barsStarted) {
      const data = heroCases[caseIndex];
      card.values.bull.textContent = `${Math.round(data.probabilities.bull * barProgress)}%`;
      card.values.base.textContent = `${Math.round(data.probabilities.base * barProgress)}%`;
      card.values.bear.textContent = `${Math.round(data.probabilities.bear * barProgress)}%`;
    }

    if (clock >= STAMP_AT && !stamped) {
      stamped = true;
      card.stamp.classList.add('is-visible');
    }

    stepParticles(dt);
    drawScene(ctx, width, height, backdrop, {
      nodePoints,
      activations,
      barProgress,
      caseData: heroCases[caseIndex],
      barRects,
      cardCenter,
      time: now / 1000,
    });
    particleRenderer.render({ positions, heats, sizes, count: PARTICLE_CAPACITY });

    rafId = window.requestAnimationFrame(tick);
  };

  window.addEventListener('resize', layout);
  root.classList.add('is-live');
  rafId = window.requestAnimationFrame(tick);

  return {
    destroy: () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', layout);
      particleRenderer.dispose();
    },
  };
};

export const mountHeroScene = async (root: HTMLElement, tier: Tier): Promise<HeroScene | null> => {
  if (tier === 'still') return null;

  try {
    const canvas = root.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
    const particleCanvas = root.querySelector<HTMLCanvasElement>('[data-hero-particles]');
    const cardEl = root.querySelector<HTMLElement>('[data-hero-card]');
    if (!canvas || !particleCanvas || !cardEl) return null;

    const card = resolveCardRefs(cardEl);
    if (!card) return null;

    if (tier === 'lite') return mountLite(root, canvas, card);
    return await mountFull(root, canvas, particleCanvas, card);
  } catch {
    return null;
  }
};
