import type { SeriesAttachedParameter, Time } from 'lightweight-charts';
import { describe, expect, it, vi } from 'vitest';
import { OrderZonePrimitive, type OrderZoneData } from './orderZonePrimitive';

type FillCall = { style: string; x: number; y: number; w: number; h: number };
type StrokeCall = { style: string; x: number; y: number; w: number; h: number; dashed: boolean };
type TextCall = { style: string; text: string; x: number; y: number };

interface Recording {
  fills: FillCall[];
  strokes: StrokeCall[];
  texts: TextCall[];
  hatchRects: number;
}

function draw(primitive: OrderZonePrimitive): Recording {
  const rec: Recording = { fills: [], strokes: [], texts: [], hatchRects: 0 };
  let dash: number[] = [];
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
      rec.strokes.push({ style: ctx.strokeStyle, x, y, w, h, dashed: dash.length > 0 }),
    ),
    fillText: vi.fn((text: string, x: number, y: number) =>
      rec.texts.push({ style: ctx.fillStyle, text, x, y }),
    ),
    setLineDash: vi.fn((pattern: number[]) => {
      dash = pattern;
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(() => {
      rec.hatchRects++;
    }),
    clip: vi.fn(),
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
  data: OrderZoneData | null,
  priceScale: (p: number) => number | null,
  timeToCoordinate: (t: Time) => number | null = (t) => Number(t),
  visibleFrom = 0,
  times: number[] = [100],
) {
  const primitive = new OrderZonePrimitive();
  const chart = {
    paneSize: () => ({ width: 500, height: 300 }),
    timeScale: () => ({
      getVisibleRange: () => ({ from: visibleFrom, to: 1000 }),
      // 0 mirrors what lightweight-charts reports for a hidden time axis; the primitive must not
      // read its drawing width from here.
      width: () => 0,
      timeToCoordinate,
      options: () => ({ barSpacing: 6 }),
    }),
  };
  const series = { priceToCoordinate: priceScale, data: () => times.map((time) => ({ time })) };
  primitive.attached({
    chart,
    series,
    requestUpdate: vi.fn(),
  } as unknown as SeriesAttachedParameter<Time>);
  primitive.setData(data);
  primitive.updateAllViews();
  return primitive;
}

const priceScale = (price: number) => 300 - price;

describe('OrderZonePrimitive', () => {
  const longData: OrderZoneData = {
    startTime: 100,
    entry: 100,
    stop: 80,
    target: 140,
    filled: true,
    rewardR: 2,
    riskR: -1,
    belowFloor: false,
  };

  it('draws risk and reward blocks with correct top/bottom for a long setup', () => {
    const rec = draw(makePrimitive(longData, priceScale));
    // y(entry=100)=200, y(stop=80)=220, y(target=140)=160
    expect(rec.fills).toHaveLength(2);
    expect(rec.fills[0].style).toBe('rgba(239, 83, 80, 0.2)');
    expect(rec.fills[0].y).toBe(200);
    expect(rec.fills[0].h).toBe(20);
    expect(rec.fills[1].style).toBe('rgba(38, 166, 154, 0.2)');
    expect(rec.fills[1].y).toBe(160);
    expect(rec.fills[1].h).toBe(40);
    expect(rec.texts[0]).toMatchObject({ text: '-1.0R' });
    expect(rec.texts[1]).toMatchObject({ text: '+2.0R' });
  });

  it('mirrors block positions for a short setup', () => {
    const shortData: OrderZoneData = {
      startTime: 100,
      entry: 100,
      stop: 120,
      target: 60,
      filled: true,
      rewardR: 2,
      riskR: -1,
      belowFloor: false,
    };
    const rec = draw(makePrimitive(shortData, priceScale));
    // y(entry=100)=200, y(stop=120)=180, y(target=60)=240
    expect(rec.fills[0].y).toBe(180);
    expect(rec.fills[0].h).toBe(20);
    expect(rec.fills[1].y).toBe(200);
    expect(rec.fills[1].h).toBe(40);
  });

  it('produces exactly one block when target is null', () => {
    const rec = draw(makePrimitive({ ...longData, target: null, rewardR: null }, priceScale));
    expect(rec.fills).toHaveLength(1);
    expect(rec.strokes).toHaveLength(1);
    expect(rec.texts).toHaveLength(1);
    expect(rec.texts[0].text).toBe('-1.0R');
  });

  it('skips the reward text but still draws the block when rewardR is null', () => {
    const rec = draw(makePrimitive({ ...longData, rewardR: null }, priceScale));
    expect(rec.fills).toHaveLength(2);
    expect(rec.texts).toHaveLength(1);
    expect(rec.texts[0].text).toBe('-1.0R');
  });

  it('spans from startTime coordinate to the pane width', () => {
    const rec = draw(makePrimitive(longData, priceScale));
    expect(rec.fills[0].x).toBe(100);
    expect(rec.fills[0].w).toBe(400);
    expect(rec.fills[1].x).toBe(100);
    expect(rec.fills[1].w).toBe(400);
  });

  it('clamps the left edge to 0 when startTime is before the visible range', () => {
    const rec = draw(makePrimitive(longData, priceScale, () => null, 500));
    expect(rec.fills[0].x).toBe(0);
    expect(rec.fills[1].x).toBe(0);
  });

  // A 15m grid: the anchor is a base-period timestamp, so two times in three it falls between the
  // displayed bars and timeToCoordinate answers null for it.
  const grid = [0, 900, 1800];
  const onGridOnly = (t: Time) => {
    const at = grid.indexOf(Number(t));
    return at < 0 ? null : at * 100;
  };

  it('anchors to the aggregated bar containing startTime instead of dropping the zone', () => {
    const rec = draw(
      makePrimitive({ ...longData, startTime: 1500 }, priceScale, onGridOnly, 0, grid),
    );
    expect(rec.fills).toHaveLength(2);
    expect(rec.fills[0].x).toBe(100);
    expect(rec.fills[0].w).toBe(400);
  });

  it('keeps an anchor that is already a bar time exactly where it is', () => {
    const rec = draw(
      makePrimitive({ ...longData, startTime: 900 }, priceScale, onGridOnly, 0, grid),
    );
    expect(rec.fills[0].x).toBe(100);
  });

  it('falls back to the first bar for an anchor older than the whole series', () => {
    const rec = draw(
      makePrimitive({ ...longData, startTime: -60 }, priceScale, onGridOnly, 0, grid),
    );
    expect(rec.fills[0].x).toBe(0);
  });

  it('draws nothing at all when the target price has no coordinate', () => {
    const noTargetCoordinate = (price: number) => (price === 140 ? null : 300 - price);
    const rec = draw(makePrimitive(longData, noTargetCoordinate));
    expect(rec.fills).toHaveLength(0);
    expect(rec.strokes).toHaveLength(0);
  });

  it('produces nothing when the series holds no bars', () => {
    const rec = draw(makePrimitive(longData, priceScale, (t) => Number(t), 0, []));
    expect(rec.fills).toHaveLength(0);
  });

  it('turns the reward block grey and hatched when belowFloor, leaving the risk block alone', () => {
    const rec = draw(makePrimitive({ ...longData, belowFloor: true }, priceScale));
    expect(rec.fills[0].style).toBe('rgba(239, 83, 80, 0.2)');
    expect(rec.strokes[0].style).toBe('rgba(239, 83, 80, 0.75)');
    expect(rec.fills[1].style).toBe('rgba(154, 154, 154, 0.2)');
    expect(rec.strokes[1].style).toBe('rgba(154, 154, 154, 0.75)');
    expect(rec.texts[1]).toMatchObject({ style: 'rgba(239, 83, 80, 0.95)', text: '+2.0R' });
    expect(rec.hatchRects).toBe(1);
  });

  it('does not hatch the reward block when belowFloor is false', () => {
    const rec = draw(makePrimitive(longData, priceScale));
    expect(rec.hatchRects).toBe(0);
  });

  // Secured gets its own hue (violet, #8b5cf6) rather than the entry line's #4a8cff, and no stroke
  // of its own: the entry price is always one edge of this block, and the entry/stop DOM lines
  // already mark both edges, so a second, competing outline colour right on the entry line would
  // recreate the exact confusion a shared hue caused. The one stroke left in this recording is the
  // reward block's, unaffected by riskR.
  it('renders the risk block as secured once riskR is positive: its own hue, no stroke of its own', () => {
    const rec = draw(makePrimitive({ ...longData, riskR: 0.4 }, priceScale));
    expect(rec.fills[0].style).toBe('rgba(139, 92, 246, 0.2)');
    expect(rec.texts[0]).toMatchObject({ style: 'rgba(139, 92, 246, 0.95)', text: '+0.4R' });
    expect(rec.strokes).toHaveLength(1);
    expect(rec.strokes[0].style).toBe('rgba(38, 166, 154, 0.75)');
  });

  it('treats a riskR of exactly zero as secured rather than at-risk', () => {
    const rec = draw(makePrimitive({ ...longData, riskR: 0 }, priceScale));
    expect(rec.fills[0].style).toBe('rgba(139, 92, 246, 0.2)');
    expect(rec.texts[0]).toMatchObject({ text: '+0.0R' });
  });

  it('keeps the risk block in the risk colour, with its usual stroke, while riskR stays negative', () => {
    const rec = draw(makePrimitive({ ...longData, riskR: -0.5 }, priceScale));
    expect(rec.fills[0].style).toBe('rgba(239, 83, 80, 0.2)');
    expect(rec.strokes[0].style).toBe('rgba(239, 83, 80, 0.75)');
    expect(rec.texts[0]).toMatchObject({ text: '-0.5R' });
  });

  it('toggles the stroke between dashed and solid based on filled', () => {
    const draft = draw(makePrimitive({ ...longData, filled: false }, priceScale));
    const filled = draw(makePrimitive({ ...longData, filled: true }, priceScale));
    expect(draft.strokes[0].dashed).toBe(true);
    expect(draft.strokes[1].dashed).toBe(true);
    expect(filled.strokes[0].dashed).toBe(false);
    expect(filled.strokes[1].dashed).toBe(false);
  });

  it('produces nothing when data is null', () => {
    const rec = draw(makePrimitive(null, priceScale));
    expect(rec.fills).toHaveLength(0);
    expect(rec.strokes).toHaveLength(0);
    expect(rec.texts).toHaveLength(0);
  });
});
