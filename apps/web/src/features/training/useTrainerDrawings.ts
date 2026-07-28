import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, AnnotationKind, AnnotationStyle } from '@kansoku/shared/types';
import type { DrawingTool } from '../charts/drawings/drawingsMachine';
import type { MeasureShape, PreviewShape } from '../charts/drawings/drawingsPrimitive';
import {
  useDrawingsInteraction,
  type DrawingsInteractionContext,
} from '../charts/drawings/useDrawingsInteraction';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

export interface TrainerDrawingsApi {
  tool: DrawingTool;
  setTool: (tool: DrawingTool) => void;
  clear: () => void;
  count: number;
  selected: Annotation | null;
  updateStyle: (id: string, patch: Partial<AnnotationStyle>) => void;
  draftStyle: AnnotationStyle;
  updateDraftStyle: (patch: Partial<AnnotationStyle>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type Current<K extends keyof DrawingsInteractionContext> = DrawingsInteractionContext[K] extends {
  current: infer T;
}
  ? T
  : never;

const noop = () => {};
const HISTORY_LIMIT = 100;

const sameAnnotations = (a: Annotation[], b: Annotation[]): boolean =>
  a === b || (a.length === b.length && a.every((item, i) => item === b[i]));

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

// The trainer draws on an anonymised alias symbol, so nothing here may reach the annotation store:
// persisting would write junk under a symbol that does not exist, and importing the store's client
// would drag its websocket/query chunk into the trainer's static bundle. Shapes live for the case
// and go with it.
export function useTrainerDrawings(
  handle: DrawingChartHandle | null,
  barTimes: number[],
  caseId: string,
): TrainerDrawingsApi {
  const [annotations, setAnnotationsState] = useState<Annotation[]>([]);
  const [tool, setToolState] = useState<DrawingTool>('off');
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [draftStyle, setDraftStyleState] = useState<AnnotationStyle>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const primitiveRef = useRef<Current<'primitiveRef'>>(null);
  const barTimesRef = useRef(barTimes);
  barTimesRef.current = barTimes;
  const toolRef = useRef<DrawingTool>('off');
  const draftStyleRef = useRef<AnnotationStyle>({});
  const dragRef = useRef<Current<'dragRef'>>(null);
  const drawingRef = useRef<Current<'drawingRef'>>(null);
  const hoverRef = useRef<Current<'hoverRef'>>(null);
  const hoverLabelRef = useRef<Current<'hoverLabelRef'>>(null);
  const measureRef = useRef<Current<'measureRef'>>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const historyRef = useRef<Annotation[][]>([[]]);
  const historyCursorRef = useRef(0);

  const [drawnCaseId, setDrawnCaseId] = useState(caseId);
  if (drawnCaseId !== caseId) {
    setDrawnCaseId(caseId);
    setAnnotationsState([]);
    setToolState('off');
    setSelectedIdState(null);
    setDraftStyleState({});
    setCanUndo(false);
    setCanRedo(false);
    annotationsRef.current = [];
    toolRef.current = 'off';
    selectedIdRef.current = null;
    dragRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    hoverLabelRef.current = null;
    measureRef.current = null;
    draftStyleRef.current = {};
    historyRef.current = [[]];
    historyCursorRef.current = 0;
  }

  const pushState = useCallback(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const drawing = drawingRef.current;
    const hover = hoverRef.current;
    let preview: PreviewShape | null = null;
    let measure: MeasureShape | null = measureRef.current;
    if (drawing && hover) {
      if (drawing.tool === 'measure') {
        measure = { p1: drawing.points[0], p2: hover };
      } else {
        preview = { kind: drawing.tool as AnnotationKind, points: [...drawing.points, hover] };
      }
    }
    primitive.setState({
      annotations: annotationsRef.current,
      selectedId: selectedIdRef.current,
      preview,
      measure,
      hoverLabel: hoverLabelRef.current,
      barTimes: barTimesRef.current,
    });
  }, []);

  const setSelected = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedIdState(id);
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyCursorRef.current > 0);
    setCanRedo(historyCursorRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(
    (next: Annotation[]) => {
      const history = historyRef.current;
      const cursor = historyCursorRef.current;
      if (sameAnnotations(history[cursor], next)) return;
      const branch = history.slice(0, cursor + 1);
      branch.push(next);
      const overflow = branch.length - HISTORY_LIMIT;
      historyRef.current = overflow > 0 ? branch.slice(overflow) : branch;
      historyCursorRef.current = historyRef.current.length - 1;
      syncHistoryFlags();
    },
    [syncHistoryFlags],
  );

  const commitAnnotations = useCallback(
    (next: Annotation[]) => {
      annotationsRef.current = next;
      setAnnotationsState(next);
      pushState();
      pushHistory(next);
    },
    [pushState, pushHistory],
  );

  const updateStyle = useCallback(
    (id: string, patch: Partial<AnnotationStyle>) => {
      const next = annotationsRef.current.map((a) =>
        a.id === id ? { ...a, style: { ...a.style, ...patch } } : a,
      );
      commitAnnotations(next);
    },
    [commitAnnotations],
  );

  const updateDraftStyle = useCallback((patch: Partial<AnnotationStyle>) => {
    const next = { ...draftStyleRef.current, ...patch };
    draftStyleRef.current = next;
    setDraftStyleState(next);
  }, []);

  const changeTool = useCallback(
    (next: DrawingTool, keepMeasure: boolean) => {
      toolRef.current = next;
      setToolState(next);
      drawingRef.current = null;
      hoverRef.current = null;
      hoverLabelRef.current = null;
      if (!keepMeasure) measureRef.current = null;
      if (next === 'off') selectedIdRef.current = null;
      pushState();
    },
    [pushState],
  );

  const setTool = useCallback((next: DrawingTool) => changeTool(next, false), [changeTool]);

  // The interaction layer resets itself to 'cursor' on Escape. In 'off' the order tools own the
  // pointer, so that reset must not quietly take it back — only the toolbar hands it over.
  const applyTool = useCallback(
    (next: DrawingTool, keepMeasure: boolean) => {
      if (toolRef.current === 'off') return;
      changeTool(next, keepMeasure);
    },
    [changeTool],
  );

  useDrawingsInteraction(handle, {
    primitiveRef,
    barTimesRef,
    toolRef,
    draftStyleRef,
    dragRef,
    drawingRef,
    hoverRef,
    hoverLabelRef,
    measureRef,
    annotationsRef,
    selectedIdRef,
    setAnnotations: setAnnotationsState,
    setSelected,
    // Scroll locking is decided by the panel that can see both pointer consumers at once
    // (useChartScrollLock); a second writer here would race it on every mode switch.
    updateScrollLock: noop,
    pushState,
    commitAnnotations,
    flushPendingRemote: noop,
    scheduleSave: pushHistory,
    applyTool,
  });

  useEffect(() => {
    pushState();
  }, [annotations, barTimes, pushState]);

  const clear = useCallback(() => {
    selectedIdRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    hoverLabelRef.current = null;
    commitAnnotations([]);
  }, [commitAnnotations]);

  const restoreFromHistory = useCallback(
    (index: number) => {
      const snapshot = historyRef.current[index];
      if (!snapshot) return;
      historyCursorRef.current = index;
      annotationsRef.current = snapshot;
      setAnnotationsState(snapshot);
      drawingRef.current = null;
      hoverRef.current = null;
      hoverLabelRef.current = null;
      if (selectedIdRef.current && !snapshot.some((a) => a.id === selectedIdRef.current)) {
        setSelected(null);
      }
      syncHistoryFlags();
      pushState();
    },
    [pushState, setSelected, syncHistoryFlags],
  );

  const undo = useCallback(() => {
    if (historyCursorRef.current <= 0) return;
    restoreFromHistory(historyCursorRef.current - 1);
  }, [restoreFromHistory]);

  const redo = useCallback(() => {
    if (historyCursorRef.current >= historyRef.current.length - 1) return;
    restoreFromHistory(historyCursorRef.current + 1);
  }, [restoreFromHistory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const selected = selectedId ? (annotations.find((a) => a.id === selectedId) ?? null) : null;

  return {
    tool,
    setTool,
    clear,
    count: annotations.length,
    selected,
    updateStyle,
    draftStyle,
    updateDraftStyle,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
