import {
  clampPolyline,
  MAX_POLYLINE_POINTS,
  shapeIsComplete,
  type Annotation,
  type AnnotationKind,
  type DrawingTool,
  type Point,
} from './drawingShapes';

export interface SessionState {
  tool: DrawingTool;
  annotations: Annotation[];
  pending: Point[];
  cursor: Point | null;
  dragging: boolean;
  nextId: number;
}

export const emptySession = (): SessionState => ({
  tool: 'cursor',
  annotations: [],
  pending: [],
  cursor: null,
  dragging: false,
  nextId: 0,
});

const idle = (state: SessionState): SessionState => ({
  ...state,
  pending: [],
  cursor: null,
  dragging: false,
});

const isDrawable = (tool: DrawingTool): tool is AnnotationKind =>
  tool !== 'off' && tool !== 'cursor' && tool !== 'measure';

const append = (state: SessionState, kind: AnnotationKind, points: Point[]): SessionState => {
  if (!shapeIsComplete(kind, points)) return idle(state);
  return {
    ...idle(state),
    annotations: [
      ...state.annotations,
      { id: `d${state.nextId}`, kind, points: clampPolyline(points) },
    ],
    nextId: state.nextId + 1,
  };
};

export const setTool = (state: SessionState, tool: DrawingTool): SessionState => ({
  ...idle(state),
  tool,
});

export const clear = (state: SessionState): SessionState => ({
  ...idle(state),
  annotations: [],
});

export const begin = (state: SessionState, point: Point): SessionState => {
  const { tool } = state;
  if (tool === 'off' || tool === 'cursor') return state;
  if (tool === 'hline') return append(state, 'hline', [point]);
  if (tool === 'polyline') {
    const pending = clampPolyline([...state.pending, point]);
    if (pending.length >= MAX_POLYLINE_POINTS) return append(state, 'polyline', pending);
    return { ...state, pending, cursor: point, dragging: false };
  }
  return { ...state, pending: [point], cursor: point, dragging: true };
};

export const move = (state: SessionState, point: Point): SessionState =>
  state.pending.length === 0 ? state : { ...state, cursor: point };

export const end = (state: SessionState, point: Point | null): SessionState => {
  if (!state.dragging) return state;
  const anchor = state.pending[0];
  const tip = point ?? state.cursor;
  // The measure ruler is a live read-out, never a saved shape: releasing clears it.
  if (state.tool === 'measure' || !anchor || !tip) return idle(state);
  if (!isDrawable(state.tool)) return idle(state);
  return append(state, state.tool, [anchor, tip]);
};

export const finishPolyline = (state: SessionState): SessionState => {
  if (state.tool !== 'polyline' || state.pending.length < 2) return idle(state);
  return append(state, 'polyline', state.pending);
};

export const cancel = (state: SessionState): SessionState => idle(state);

export const previewShape = (
  state: SessionState,
): { kind: AnnotationKind; points: Point[] } | null => {
  if (!isDrawable(state.tool) || state.pending.length === 0) return null;
  const points = state.cursor ? [...state.pending, state.cursor] : [...state.pending];
  if (state.tool !== 'hline' && points.length < 2) return null;
  return { kind: state.tool, points };
};

export const measureShape = (state: SessionState): { p1: Point; p2: Point } | null =>
  state.tool === 'measure' && state.pending.length === 1 && state.cursor
    ? { p1: state.pending[0], p2: state.cursor }
    : null;
