import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, AnnotationKind, AnnotationStyle } from '@kansoku/shared/types';
import type { DrawingTool } from '../charts/drawings/drawingsMachine';
import type { PreviewShape } from '../charts/drawings/drawingsPrimitive';
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
}

type Current<K extends keyof DrawingsInteractionContext> = DrawingsInteractionContext[K] extends {
  current: infer T;
}
  ? T
  : never;

const NO_STYLE: AnnotationStyle = {};
const noop = () => {};

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

  const primitiveRef = useRef<Current<'primitiveRef'>>(null);
  const barTimesRef = useRef(barTimes);
  barTimesRef.current = barTimes;
  const toolRef = useRef<DrawingTool>('off');
  const draftStyleRef = useRef<AnnotationStyle>(NO_STYLE);
  const dragRef = useRef<Current<'dragRef'>>(null);
  const drawingRef = useRef<Current<'drawingRef'>>(null);
  const hoverRef = useRef<Current<'hoverRef'>>(null);
  const hoverLabelRef = useRef<Current<'hoverLabelRef'>>(null);
  const measureRef = useRef<Current<'measureRef'>>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  const [drawnCaseId, setDrawnCaseId] = useState(caseId);
  if (drawnCaseId !== caseId) {
    setDrawnCaseId(caseId);
    setAnnotationsState([]);
    setToolState('off');
    annotationsRef.current = [];
    toolRef.current = 'off';
    selectedIdRef.current = null;
    dragRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    hoverLabelRef.current = null;
    measureRef.current = null;
  }

  const pushState = useCallback(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const drawing = drawingRef.current;
    const hover = hoverRef.current;
    const preview: PreviewShape | null =
      drawing && hover
        ? { kind: drawing.tool as AnnotationKind, points: [...drawing.points, hover] }
        : null;
    primitive.setState({
      annotations: annotationsRef.current,
      selectedId: selectedIdRef.current,
      preview,
      measure: null,
      hoverLabel: hoverLabelRef.current,
      barTimes: barTimesRef.current,
    });
  }, []);

  const setSelected = useCallback((id: string | null) => {
    selectedIdRef.current = id;
  }, []);

  const commitAnnotations = useCallback(
    (next: Annotation[]) => {
      annotationsRef.current = next;
      setAnnotationsState(next);
      pushState();
    },
    [pushState],
  );

  const setTool = useCallback(
    (next: DrawingTool) => {
      toolRef.current = next;
      setToolState(next);
      drawingRef.current = null;
      hoverRef.current = null;
      hoverLabelRef.current = null;
      if (next === 'off') selectedIdRef.current = null;
      pushState();
    },
    [pushState],
  );

  // The interaction layer resets itself to 'cursor' on Escape. In 'off' the order tools own the
  // pointer, so that reset must not quietly take it back — only the toolbar hands it over.
  const applyTool = useCallback(
    (next: DrawingTool) => {
      if (toolRef.current === 'off') return;
      setTool(next);
    },
    [setTool],
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
    scheduleSave: noop,
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

  return { tool, setTool, clear, count: annotations.length };
}
