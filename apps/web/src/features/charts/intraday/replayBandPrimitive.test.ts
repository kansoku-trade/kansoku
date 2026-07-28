import type { SeriesAttachedParameter, Time } from 'lightweight-charts';
import { describe, expect, it, vi } from 'vitest';
import {
  ReplayBandPrimitive,
  REPLAY_BAND_FILL,
  type ReplayBand,
  type ReplayDivider,
} from './replayBandPrimitive';

interface Fill {
  style: string;
  x: number;
  w: number;
}

function draw(primitive: ReplayBandPrimitive): Fill[] {
  const fills: Fill[] = [];
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn((x: number, _y: number, w: number) =>
      fills.push({ style: ctx.fillStyle, x, w }),
    ),
    save: vi.fn(),
    restore: vi.fn(),
  };
  const target = {
    useMediaCoordinateSpace: (
      fn: (scope: { context: typeof ctx; mediaSize: { height: number } }) => void,
    ) => fn({ context: ctx, mediaSize: { height: 100 } }),
  };
  primitive
    .paneViews()[0]!
    .renderer()!
    .draw(target as never);
  return fills;
}

// One bar every 10 seconds, one pixel of coordinate per second, 10px bar spacing — so a bar's
// coordinate is readable straight off its time and every expected pixel below is hand-checkable.
const TIMES = Array.from({ length: 10 }, (_, i) => 1000 + i * 10);

function makePrimitive(
  bands: ReplayBand[],
  opts: { visibleFrom?: number; visibleTo?: number; width?: number } = {},
) {
  const { visibleFrom = 1000, visibleTo = 1090, width = 500 } = opts;
  const primitive = new ReplayBandPrimitive();
  const chart = {
    paneSize: () => ({ width, height: 100 }),
    timeScale: () => ({
      getVisibleRange: () => ({ from: visibleFrom, to: visibleTo }),
      // 0 mirrors what lightweight-charts reports for a hidden time axis; the primitive must not
      // read its drawing width from here.
      width: () => 0,
      options: () => ({ barSpacing: 10 }),
      timeToCoordinate: (t: Time) => {
        const time = Number(t);
        if (time < visibleFrom || time > visibleTo) return null;
        return time - 1000;
      },
    }),
  };
  const series = { data: () => TIMES.map((time) => ({ time })) };
  primitive.attached({
    chart,
    series,
    requestUpdate: vi.fn(),
  } as unknown as SeriesAttachedParameter<Time>);
  primitive.setData(bands);
  primitive.updateAllViews();
  return primitive;
}

describe('ReplayBandPrimitive', () => {
  it('spans a band from half a bar before its first bar to half a bar after its last', () => {
    const fills = draw(makePrimitive([{ kind: 'played', startTime: 1020, endTime: 1050 }]));
    expect(fills).toHaveLength(1);
    expect(fills[0].style).toBe(REPLAY_BAND_FILL.played);
    expect(fills[0].x).toBe(15);
    expect(fills[0].w).toBe(40);
  });

  // A band boundary is a wall clock time, not a bar index: it lands mid-bar whenever the chart is
  // showing an aggregated tier. 1023 pulls forward to the 1030 bar and 1057 falls back to 1050.
  it('snaps band edges that fall between bars onto the bars that bound them', () => {
    const fills = draw(makePrimitive([{ kind: 'given', startTime: 1023, endTime: 1057 }]));
    expect(fills[0].x).toBe(25);
    expect(fills[0].w).toBe(30);
  });

  it('paints each band with its own fill, in order', () => {
    const fills = draw(
      makePrimitive([
        { kind: 'given', startTime: 1000, endTime: 1020 },
        { kind: 'played', startTime: 1030, endTime: 1060 },
        { kind: 'epilogue', startTime: 1070, endTime: 1090 },
      ]),
    );
    expect(fills.map((f) => f.style)).toEqual([
      REPLAY_BAND_FILL.given,
      REPLAY_BAND_FILL.played,
      REPLAY_BAND_FILL.epilogue,
    ]);
  });

  // Scrolling either edge out of view used to drop the entire band, which is exactly when the
  // reader most needs to know which段 they are looking at.
  it('clips to the pane instead of vanishing when an edge is scrolled out of view', () => {
    const fills = draw(
      makePrimitive([{ kind: 'played', startTime: 1000, endTime: 1090 }], {
        visibleFrom: 1030,
        visibleTo: 1060,
        width: 40,
      }),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0].x).toBe(0);
    expect(fills[0].w).toBe(40);
  });

  it('draws nothing without bands, and nothing for a band with no bars in it', () => {
    expect(draw(makePrimitive([]))).toHaveLength(0);
    expect(
      draw(makePrimitive([{ kind: 'epilogue', startTime: 1091, endTime: 1200 }])),
    ).toHaveLength(0);
  });
});

interface DividerLine {
  x: number;
  height: number;
  label: string;
}

// The divider view is the second pane view; the first paints the bands above.
function drawDividers(primitive: ReplayBandPrimitive): DividerLine[] {
  const lines: DividerLine[] = [];
  let from: [number, number] | null = null;
  let to: [number, number] | null = null;
  let pendingLabel = '';
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    setLineDash: vi.fn(),
    beginPath: vi.fn(() => {
      from = null;
      to = null;
    }),
    moveTo: vi.fn((x: number, y: number) => {
      from = [x, y];
    }),
    lineTo: vi.fn((x: number, y: number) => {
      to = [x, y];
    }),
    stroke: vi.fn(() => {
      if (from && to) lines.push({ x: from[0], height: to[1] - from[1], label: pendingLabel });
    }),
    measureText: vi.fn(() => ({ width: 60 })),
    fillText: vi.fn((text: string) => {
      pendingLabel = text;
      const last = lines.at(-1);
      if (last) last.label = text;
    }),
    save: vi.fn(),
    restore: vi.fn(),
  };
  const target = {
    useMediaCoordinateSpace: (
      fn: (scope: { context: typeof ctx; mediaSize: { width: number; height: number } }) => void,
    ) => fn({ context: ctx, mediaSize: { width: 500, height: 100 } }),
  };
  primitive
    .paneViews()[1]!
    .renderer()!
    .draw(target as never);
  return lines;
}

function withDividers(dividers: ReplayDivider[]) {
  const primitive = makePrimitive([]);
  primitive.setData([], dividers);
  primitive.updateAllViews();
  return primitive;
}

describe('ReplayBandPrimitive dividers', () => {
  it('draws a full-height line at the leading edge of its anchor bar', () => {
    const lines = drawDividers(withDividers([{ time: 1030, edge: 'before', label: '题目到此' }]));
    expect(lines).toHaveLength(1);
    // The 1030 bar sits at x=30; its leading edge is half a bar earlier.
    expect(lines[0].x).toBe(25.5);
    expect(lines[0].height).toBe(100);
    expect(lines[0].label).toBe('题目到此');
  });

  it('draws off the trailing edge when the boundary sits after its anchor bar', () => {
    const lines = drawDividers(withDividers([{ time: 1030, edge: 'after', label: 'x' }]));
    expect(lines[0].x).toBe(35.5);
  });

  // The regression this exists for. The divider names a bar on the case's base period, and the 15m
  // and 1h tiers hold none of those timestamps — asking timeToCoordinate for one returns null,
  // which silently dropped the whole line the moment the trader switched timeframe.
  it('still draws when its time is not a bar the series holds', () => {
    const lines = drawDividers(withDividers([{ time: 1034, edge: 'before', label: 'x' }]));
    expect(lines).toHaveLength(1);
    expect(lines[0].x).toBe(25.5);
  });

  // An aggregated bar straddling the boundary holds replayed prices, so the line goes ahead of it.
  // Landing it after would mark a bar the trader stepped through as part of the given setup.
  it('puts a straddling boundary ahead of the bar that contains it', () => {
    const lines = drawDividers(withDividers([{ time: 1039, edge: 'before', label: 'x' }]));
    expect(lines[0].x).toBe(25.5);
  });

  it('draws nothing without dividers, and nothing for one sitting before every bar', () => {
    expect(drawDividers(withDividers([]))).toHaveLength(0);
    expect(drawDividers(withDividers([{ time: 900, edge: 'before', label: 'x' }]))).toHaveLength(0);
  });
});
