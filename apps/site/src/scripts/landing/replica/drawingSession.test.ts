import { describe, expect, it } from 'vitest';
import { MAX_POLYLINE_POINTS, type Point } from './drawingShapes';
import {
  begin,
  cancel,
  clear,
  emptySession,
  end,
  finishPolyline,
  measureShape,
  move,
  previewShape,
  setTool,
  type SessionState,
} from './drawingSession';

const at = (time: number, price: number): Point => ({ time, price });

const withTool = (tool: Parameters<typeof setTool>[1]): SessionState =>
  setTool(emptySession(), tool);

const drag = (state: SessionState, a: Point, b: Point): SessionState =>
  end(move(begin(state, a), b), b);

describe('cursor and off', () => {
  it('never draws', () => {
    for (const tool of ['cursor', 'off'] as const) {
      const state = drag(withTool(tool), at(0, 1), at(5, 9));
      expect(state.annotations).toHaveLength(0);
      expect(state.pending).toHaveLength(0);
    }
  });
});

describe('two-point tools', () => {
  it('commits a trendline on release', () => {
    const state = drag(withTool('trendline'), at(0, 100), at(10, 120));
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].kind).toBe('trendline');
    expect(state.annotations[0].points).toEqual([at(0, 100), at(10, 120)]);
    expect(state.pending).toHaveLength(0);
    expect(state.dragging).toBe(false);
  });

  it('commits a rect and a fib the same way', () => {
    expect(drag(withTool('rect'), at(0, 1), at(4, 8)).annotations[0].kind).toBe('rect');
    expect(drag(withTool('fib'), at(0, 1), at(4, 8)).annotations[0].kind).toBe('fib');
  });

  it('keeps a press without a release uncommitted, and previews it', () => {
    const state = move(begin(withTool('trendline'), at(0, 100)), at(6, 108));
    expect(state.annotations).toHaveLength(0);
    expect(previewShape(state)).toEqual({
      kind: 'trendline',
      points: [at(0, 100), at(6, 108)],
    });
  });

  it('gives every shape a distinct id', () => {
    let state = drag(withTool('trendline'), at(0, 1), at(2, 3));
    state = drag(state, at(4, 5), at(6, 7));
    expect(new Set(state.annotations.map((a) => a.id)).size).toBe(2);
  });
});

describe('measure', () => {
  it('shows a live ruler but saves nothing', () => {
    const dragging = move(begin(withTool('measure'), at(0, 100)), at(8, 110));
    expect(measureShape(dragging)).toEqual({ p1: at(0, 100), p2: at(8, 110) });
    const released = end(dragging, at(8, 110));
    expect(released.annotations).toHaveLength(0);
    expect(measureShape(released)).toBeNull();
  });
});

describe('hline', () => {
  it('commits on the press itself', () => {
    const state = begin(withTool('hline'), at(3, 250));
    expect(state.annotations).toEqual([
      { id: 'd0', kind: 'hline', points: [at(3, 250)] },
    ]);
  });
});

describe('polyline', () => {
  it('accumulates points and commits when finished', () => {
    let state = begin(withTool('polyline'), at(0, 1));
    expect(state.annotations).toHaveLength(0);
    state = begin(state, at(2, 3));
    state = begin(state, at(4, 2));
    state = finishPolyline(state);
    expect(state.annotations[0].points).toHaveLength(3);
    expect(state.pending).toHaveLength(0);
  });

  it('discards a single-point polyline', () => {
    const state = finishPolyline(begin(withTool('polyline'), at(0, 1)));
    expect(state.annotations).toHaveLength(0);
  });

  it('auto-commits at the point cap', () => {
    let state = withTool('polyline');
    for (let i = 0; i < MAX_POLYLINE_POINTS; i++) state = begin(state, at(i, i));
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].points).toHaveLength(MAX_POLYLINE_POINTS);
    expect(state.pending).toHaveLength(0);
  });
});

describe('cancel, setTool and clear', () => {
  it('drops an in-flight shape on cancel', () => {
    const state = cancel(move(begin(withTool('rect'), at(0, 1)), at(4, 5)));
    expect(state.pending).toHaveLength(0);
    expect(state.annotations).toHaveLength(0);
  });

  it('drops an in-flight shape when the tool changes but keeps committed ones', () => {
    const drawn = drag(withTool('trendline'), at(0, 1), at(2, 3));
    const midDraw = move(begin(drawn, at(4, 5)), at(6, 7));
    const switched = setTool(midDraw, 'hline');
    expect(switched.annotations).toHaveLength(1);
    expect(switched.pending).toHaveLength(0);
    expect(switched.tool).toBe('hline');
  });

  it('wipes everything on clear', () => {
    const state = clear(drag(withTool('rect'), at(0, 1), at(2, 3)));
    expect(state.annotations).toHaveLength(0);
  });
});

describe('previewShape', () => {
  it('is null for cursor, measure and an empty pending list', () => {
    expect(previewShape(withTool('cursor'))).toBeNull();
    expect(previewShape(move(begin(withTool('measure'), at(0, 1)), at(2, 3)))).toBeNull();
    expect(previewShape(withTool('rect'))).toBeNull();
  });

  it('previews a polyline including the point under the pointer', () => {
    const state = move(begin(withTool('polyline'), at(0, 1)), at(3, 4));
    expect(previewShape(state)?.points).toEqual([at(0, 1), at(3, 4)]);
  });
});
