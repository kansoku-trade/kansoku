import type { SeriesAttachedParameter, Time } from 'lightweight-charts';
import { describe, expect, it, vi } from 'vitest';
import { PositionBoxPrimitive, type PositionBoxData } from './positionBoxPrimitive';

type FillCall = { style: string; x: number; y: number; w: number; h: number };
type StrokeCall = { style: string; x: number; y: number; w: number; h: number };
type LineCall = { style: string; from: [number, number]; to: [number, number] };

interface Recording {
  fills: FillCall[];
  strokes: StrokeCall[];
  lines: LineCall[];
  texts: { style: string; text: string; x: number; y: number }[];
}

function draw(primitive: PositionBoxPrimitive): Recording {
  const rec: Recording = { fills: [], strokes: [], lines: [], texts: [] };
  let currentPath: { from: [number, number] | null; to: [number, number] | null } = {
    from: null,
    to: null,
  };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textBaseline: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
      rec.fills.push({ style: ctx.fillStyle, x, y, w, h }),
    ),
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) =>
      rec.strokes.push({ style: ctx.strokeStyle, x, y, w, h }),
    ),
    fillText: vi.fn((text: string, x: number, y: number) =>
      rec.texts.push({ style: ctx.fillStyle, text, x, y }),
    ),
    beginPath: vi.fn(() => {
      currentPath = { from: null, to: null };
    }),
    moveTo: vi.fn((x: number, y: number) => {
      currentPath.from = [x, y];
    }),
    lineTo: vi.fn((x: number, y: number) => {
      currentPath.to = [x, y];
    }),
    stroke: vi.fn(() => {
      if (currentPath.from && currentPath.to) {
        rec.lines.push({
          style: ctx.strokeStyle,
          from: currentPath.from,
          to: currentPath.to,
        });
      }
    }),
    save: vi.fn(),
    restore: vi.fn(),
  };
  const target = {
    useMediaCoordinateSpace: (fn: (scope: { context: typeof ctx }) => void) => fn({ context: ctx }),
  };
  const paneView = primitive.paneViews()[0]!;
  paneView.renderer()!.draw(target as never);
  return rec;
}

function makePrimitive(
  data: PositionBoxData | null,
  priceScale: (p: number) => number,
  barSpacing = 6,
) {
  const primitive = new PositionBoxPrimitive();
  const chart = {
    paneSize: () => ({ width: 500, height: 300 }),
    timeScale: () => ({
      getVisibleRange: () => ({ from: 0, to: 1000 }),
      // 0 mirrors what lightweight-charts reports for a hidden time axis; the primitive must not
      // read its drawing width from here.
      width: () => 0,
      timeToCoordinate: (t: Time) => Number(t),
      options: () => ({ barSpacing }),
    }),
  };
  const series = { priceToCoordinate: priceScale };
  primitive.attached({
    chart,
    series,
    requestUpdate: vi.fn(),
  } as unknown as SeriesAttachedParameter<Time>);
  primitive.setData(data);
  primitive.updateAllViews();
  return primitive;
}

describe('PositionBoxPrimitive', () => {
  const longData: PositionBoxData = {
    startTime: 100,
    endTime: 400,
    entry: 100,
    stop: 95,
    target1: 105,
    target2: 110,
    dimmed: false,
  };

  it('renders three blocks with stop-red / near-green / far-green fills in draw order (long)', () => {
    const p = makePrimitive(longData, (price) => 200 - price);
    const rec = draw(p);
    expect(rec.fills).toHaveLength(3);
    expect(rec.fills[0].style).toBe('rgba(239, 83, 80, 0.18)');
    expect(rec.fills[1].style).toBe('rgba(38, 166, 154, 0.12)');
    expect(rec.fills[2].style).toBe('rgba(38, 166, 154, 0.22)');
    // stop block sits at higher y (below entry) — priceToCoordinate = 200-price
    // y(entry=100)=100, y(stop=95)=105, y(T1=105)=95, y(T2=110)=90
    expect(rec.fills[0].y).toBe(100);
    expect(rec.fills[0].h).toBe(5);
    expect(rec.fills[1].y).toBe(95);
    expect(rec.fills[1].h).toBe(5);
    expect(rec.fills[2].y).toBe(90);
    expect(rec.fills[2].h).toBe(5);
  });

  it('lays out blocks correctly for a short position (T1/T2 below entry)', () => {
    const shortData: PositionBoxData = {
      startTime: 100,
      endTime: 400,
      entry: 100,
      stop: 105,
      target1: 95,
      target2: 90,
      dimmed: false,
    };
    const rec = draw(makePrimitive(shortData, (price) => 200 - price));
    // y(entry=100)=100, y(stop=105)=95, y(T1=95)=105, y(T2=90)=110
    // stop block spans [95, 100], near [100, 105], far [105, 110]
    expect(rec.fills[0].y).toBe(95);
    expect(rec.fills[0].h).toBe(5);
    expect(rec.fills[1].y).toBe(100);
    expect(rec.fills[1].h).toBe(5);
    expect(rec.fills[2].y).toBe(105);
    expect(rec.fills[2].h).toBe(5);
  });

  it('draws a divider line at target1', () => {
    const rec = draw(makePrimitive(longData, (price) => 200 - price));
    expect(rec.lines).toHaveLength(1);
    expect(rec.lines[0].style).toBe('rgba(38, 166, 154, 0.9)');
    expect(rec.lines[0].from[1]).toBe(95.5);
    expect(rec.lines[0].to[1]).toBe(95.5);
  });

  it('halves alphas and writes 已止损 tag when dimmed', () => {
    const rec = draw(makePrimitive({ ...longData, dimmed: true }, (price) => 200 - price));
    expect(rec.fills[0].style).toBe('rgba(239, 83, 80, 0.09)');
    expect(rec.fills[1].style).toBe('rgba(38, 166, 154, 0.06)');
    expect(rec.fills[2].style).toBe('rgba(38, 166, 154, 0.11)');
    expect(rec.texts).toHaveLength(1);
    expect(rec.texts[0].text).toBe('已止损');
  });

  it('widens a same-bar trade to one bar spacing instead of collapsing it away', () => {
    const rec = draw(
      makePrimitive({ ...longData, startTime: 200, endTime: 200 }, (price) => 200 - price, 8),
    );
    expect(rec.fills).toHaveLength(3);
    expect(rec.fills[0].x).toBe(196);
    expect(rec.fills[0].w).toBe(8);
  });

  it('leaves a box already wider than one bar spacing where it is', () => {
    const rec = draw(makePrimitive(longData, (price) => 200 - price, 8));
    expect(rec.fills[0].x).toBe(100);
    expect(rec.fills[0].w).toBe(300);
  });

  it('produces nothing when data is null', () => {
    const rec = draw(makePrimitive(null, (price) => 200 - price));
    expect(rec.fills).toHaveLength(0);
    expect(rec.strokes).toHaveLength(0);
    expect(rec.lines).toHaveLength(0);
    expect(rec.texts).toHaveLength(0);
  });
});
