import type { Tier } from '../tier';

export interface HeroAtmosphere {
  destroy: () => void;
}

interface Node {
  x: number;
  y: number;
  r: number;
  phase: number;
  label: string;
}

interface Link {
  a: number;
  b: number;
}

const LABELS = [
  'kline',
  'flow',
  'quote',
  'news',
  'tech',
  'calendar',
  'positions',
  'macro',
  'peers',
  'sec',
  'options',
  'temp',
];

const ACCENT = { r: 255, g: 176, b: 0 };

const rgba = (a: number): string => `rgba(${ACCENT.r}, ${ACCENT.g}, ${ACCENT.b}, ${a})`;

const mulberry32 = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const buildGraph = (
  width: number,
  height: number,
  count: number,
  seed: number,
): { nodes: Node[]; links: Link[]; hub: number } => {
  const rand = mulberry32(seed);
  const hubX = width * 0.68;
  const hubY = height * 0.48;
  const nodes: Node[] = [
    {
      x: hubX,
      y: hubY,
      r: 3.2,
      phase: 0,
      label: '',
    },
  ];

  for (let i = 0; i < count; i++) {
    const ang = -Math.PI * 0.15 + (i / Math.max(1, count - 1)) * Math.PI * 1.35 + (rand() - 0.5) * 0.35;
    const radius = Math.min(width, height) * (0.22 + rand() * 0.2);
    const ox = Math.cos(ang) * radius * (width > height ? 1.15 : 1);
    const oy = Math.sin(ang) * radius * 0.9;
    nodes.push({
      x: hubX + ox + (rand() - 0.5) * 28,
      y: hubY + oy + (rand() - 0.5) * 22,
      r: 2.2 + rand() * 1.2,
      phase: rand() * Math.PI * 2,
      label: LABELS[i % LABELS.length],
    });
  }

  const links: Link[] = [];
  for (let i = 1; i < nodes.length; i++) links.push({ a: 0, b: i });

  for (let i = 1; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist < Math.min(width, height) * 0.22 && rand() > 0.45) {
        links.push({ a: i, b: j });
      }
    }
  }

  return { nodes, links, hub: 0 };
};

const drawAmbient = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
): void => {
  const gx = width * 0.7;
  const gy = height * 0.48;
  const radius = Math.max(width, height) * 0.48;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
  glow.addColorStop(0, rgba(0.07 * intensity));
  glow.addColorStop(0.45, rgba(0.025 * intensity));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
};

const drawLink = (
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  alpha: number,
  dashOffset: number,
): void => {
  ctx.beginPath();
  ctx.setLineDash([3, 6]);
  ctx.lineDashOffset = -dashOffset;
  ctx.strokeStyle = rgba(alpha);
  ctx.lineWidth = 1;
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawNode = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  heat: number,
  showLabel: boolean,
): void => {
  const core = 0.35 + heat * 0.55;
  ctx.beginPath();
  ctx.fillStyle = rgba(0.12 + heat * 0.2);
  ctx.arc(node.x, node.y, node.r + 6 + heat * 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = rgba(0.2 + heat * 0.45);
  ctx.lineWidth = 1;
  ctx.arc(node.x, node.y, node.r + 4 + heat * 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = rgba(core);
  ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
  ctx.fill();

  if (showLabel && node.label && heat > 0.15) {
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = rgba(0.25 + heat * 0.4);
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x + node.r + 8, node.y);
  }
};

const drawPacket = (
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
  alpha: number,
): void => {
  const x = ax + (bx - ax) * t;
  const y = ay + (by - ay) * t;
  ctx.beginPath();
  ctx.fillStyle = rgba(alpha);
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = rgba(alpha * 0.35);
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
};

const paintFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: Node[],
  links: Link[],
  time: number,
  intensity: number,
  animated: boolean,
): void => {
  ctx.clearRect(0, 0, width, height);
  drawAmbient(ctx, width, height, intensity);

  const activeIndex =
    animated && nodes.length > 1
      ? 1 + (Math.floor(time * 0.35) % (nodes.length - 1))
      : -1;

  const dash = animated ? time * 18 : 0;

  for (const link of links) {
    const a = nodes[link.a];
    const b = nodes[link.b];
    if (!a || !b) continue;
    const lit = link.a === activeIndex || link.b === activeIndex || link.a === 0;
    const alpha = (lit ? 0.22 : 0.1) * intensity;
    drawLink(ctx, a.x, a.y, b.x, b.y, alpha, dash * (lit ? 1.2 : 0.6));

    if (animated && lit && link.b === activeIndex) {
      const pulse = (time * 0.55) % 1;
      drawPacket(ctx, a.x, a.y, b.x, b.y, pulse, 0.55 * intensity);
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let heat = 0.25 + 0.1 * Math.sin(time * 1.1 + node.phase);
    if (i === 0) heat = 0.45 + 0.12 * Math.sin(time * 0.8);
    if (i === activeIndex) heat = 0.85 + 0.15 * Math.sin(time * 6);
    if (!animated) heat = i === 0 ? 0.5 : 0.3;
    drawNode(ctx, node, heat * intensity, animated && i === activeIndex);
  }
};

export const mountHeroAtmosphere = async (
  root: ParentNode,
  tier: Tier,
): Promise<HeroAtmosphere | null> => {
  const section = root.querySelector<HTMLElement>('[data-hero-section]');
  const host = root.querySelector<HTMLElement>('[data-hero-atmosphere-host]') ?? section;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-hero-atmosphere]');
  if (!section || !host || !canvas) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const intensity = tier === 'full' ? 1 : tier === 'lite' ? 0.78 : 0.6;
  const nodeCount = tier === 'full' ? 11 : tier === 'lite' ? 8 : 7;
  const animated = tier !== 'still';

  section.dataset.atmosphere = animated ? 'chain' : 'chain-static';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let graph = buildGraph(1, 1, nodeCount, 20260729);

  const layout = (): void => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    graph = buildGraph(width, height, nodeCount, 20260729);
  };

  layout();

  if (!animated) {
    paintFrame(ctx, width, height, graph.nodes, graph.links, 0, intensity, false);
    const onResize = (): void => {
      layout();
      paintFrame(ctx, width, height, graph.nodes, graph.links, 0, intensity, false);
    };
    window.addEventListener('resize', onResize);
    return { destroy: () => window.removeEventListener('resize', onResize) };
  }

  let rafId = 0;
  let visible = true;
  let elapsed = 0;
  let last = performance.now();
  let pointer = { x: 0, y: 0 };

  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? true;
    },
    { threshold: 0.05 },
  );
  observer.observe(section);

  const onPointer = (event: PointerEvent): void => {
    const rect = host.getBoundingClientRect();
    pointer = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 24,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 18,
    };
  };
  const onPointerLeave = (): void => {
    pointer = { x: 0, y: 0 };
  };

  if (window.matchMedia('(pointer: fine)').matches) {
    section.addEventListener('pointermove', onPointer);
    section.addEventListener('pointerleave', onPointerLeave);
  }

  const onResize = (): void => layout();
  window.addEventListener('resize', onResize);

  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      elapsed += dt;
      ctx.save();
      ctx.translate(pointer.x * 0.35, pointer.y * 0.35);
      paintFrame(ctx, width, height, graph.nodes, graph.links, elapsed, intensity, true);
      ctx.restore();
    }
    rafId = window.requestAnimationFrame(tick);
  };
  rafId = window.requestAnimationFrame(tick);

  return {
    destroy: () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      section.removeEventListener('pointermove', onPointer);
      section.removeEventListener('pointerleave', onPointerLeave);
      observer.disconnect();
    },
  };
};
