import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import type { Annotation, AnnotationKind, AnnotationPoint } from "../../../../shared/types";
import { logicalToTime, timeToLogical, type HitRegion, type Pt } from "../../../../shared/drawings";
import { DrawingsPrimitive, type MeasureShape, type PreviewShape } from "./drawingsPrimitive";
import {
  dragPoints,
  isTwoPointTool,
  makeAnnotation,
  pickHit,
  pixelDistance,
  type DrawingTool,
  type TwoPointTool,
} from "./drawingsMachine";

export type { DrawingTool } from "./drawingsMachine";

export interface DrawingsHandle {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  container: HTMLElement;
}

export interface DrawingsApi {
  activeTool: DrawingTool;
  setActiveTool: (t: DrawingTool) => void;
  clearAll: () => void;
  count: number;
}

interface DragState {
  id: string;
  region: HitRegion;
  origPoints: AnnotationPoint[];
  startTime: number;
  startPrice: number;
  startPx: Pt;
  moved: boolean;
}

interface InProgress {
  tool: TwoPointTool;
  p1: AnnotationPoint;
}

interface PendingSave {
  symbol: string;
  annotations: Annotation[];
}

const DRAG_THRESHOLD_PX = 3;
const SAVE_DEBOUNCE_MS = 1000;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
};

export function useDrawings(handle: DrawingsHandle | null, symbol: string, barTimes: number[]): DrawingsApi {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveToolState] = useState<DrawingTool>("cursor");

  const handleRef = useRef<DrawingsHandle | null>(handle);
  handleRef.current = handle;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const barTimesRef = useRef(barTimes);
  barTimesRef.current = barTimes;

  const annotationsRef = useRef<Annotation[]>([]);
  const toolRef = useRef<DrawingTool>("cursor");
  const selectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const drawingRef = useRef<InProgress | null>(null);
  const hoverRef = useRef<AnnotationPoint | null>(null);
  const measureRef = useRef<MeasureShape | null>(null);

  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<PendingSave | null>(null);

  const pushState = useCallback(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const drawing = drawingRef.current;
    const hover = hoverRef.current;
    let preview: PreviewShape | null = null;
    let measure: MeasureShape | null = measureRef.current;
    if (drawing && hover) {
      if (drawing.tool === "measure") {
        measure = { p1: drawing.p1, p2: hover };
      } else {
        preview = { kind: drawing.tool as AnnotationKind, points: [drawing.p1, hover] };
      }
    }
    primitive.setState({
      annotations: annotationsRef.current,
      selectedId: selectedIdRef.current,
      preview,
      measure,
      barTimes: barTimesRef.current,
    });
  }, []);

  const updateScrollLock = useCallback(() => {
    const chart = handleRef.current?.chart;
    if (!chart) return;
    const locked = toolRef.current !== "cursor" || dragRef.current !== null;
    try {
      chart.applyOptions({ handleScroll: !locked, handleScale: !locked });
    } catch {
      return;
    }
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    void fetch(`/api/annotations/${encodeURIComponent(pending.symbol)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ annotations: pending.annotations }),
    }).catch((err: unknown) => {
      console.error("failed to save annotations", err);
    });
  }, []);

  const scheduleSave = useCallback(
    (next: Annotation[]) => {
      pendingSaveRef.current = { symbol: symbolRef.current, annotations: next };
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const commitAnnotations = useCallback(
    (next: Annotation[], save: boolean) => {
      annotationsRef.current = next;
      setAnnotations(next);
      pushState();
      if (save) scheduleSave(next);
    },
    [pushState, scheduleSave],
  );

  const applyTool = useCallback(
    (next: DrawingTool, keepMeasure: boolean) => {
      toolRef.current = next;
      setActiveToolState(next);
      drawingRef.current = null;
      hoverRef.current = null;
      if (!keepMeasure) measureRef.current = null;
      updateScrollLock();
      pushState();
    },
    [pushState, updateScrollLock],
  );

  const setActiveTool = useCallback((t: DrawingTool) => applyTool(t, false), [applyTool]);

  const clearAll = useCallback(() => {
    selectedIdRef.current = null;
    measureRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    commitAnnotations([], true);
  }, [commitAnnotations]);

  useEffect(() => {
    if (!handle) return;
    const { chart, series, container } = handle;

    const primitive = new DrawingsPrimitive();
    series.attachPrimitive(primitive);
    primitiveRef.current = primitive;

    const pointerPx = (e: PointerEvent): Pt => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const toPoint = (e: PointerEvent): AnnotationPoint | null => {
      const { x, y } = pointerPx(e);
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;
      const price = series.coordinateToPrice(y);
      if (price === null) return null;
      const time = logicalToTime(barTimesRef.current, logical);
      if (!Number.isFinite(time)) return null;
      return { time, price };
    };
    const toPx = (point: AnnotationPoint): Pt | null => {
      const logical = timeToLogical(barTimesRef.current, point.time);
      if (!Number.isFinite(logical)) return null;
      const x = chart.timeScale().logicalToCoordinate(logical as Logical);
      const y = series.priceToCoordinate(point.price);
      if (x === null || y === null) return null;
      return { x, y };
    };

    const onPointerDown = (e: PointerEvent) => {
      const pt = toPoint(e);
      if (!pt) return;
      if (measureRef.current) measureRef.current = null;
      const tool = toolRef.current;

      if (tool === "cursor") {
        const hit = pickHit(annotationsRef.current, toPx, pointerPx(e));
        if (hit) {
          selectedIdRef.current = hit.id;
          const ann = annotationsRef.current.find((a) => a.id === hit.id);
          if (ann) {
            dragRef.current = {
              id: hit.id,
              region: hit.region,
              origPoints: ann.points,
              startTime: pt.time,
              startPrice: pt.price,
              startPx: pointerPx(e),
              moved: false,
            };
            updateScrollLock();
          }
        } else {
          selectedIdRef.current = null;
        }
        pushState();
        return;
      }

      if (tool === "hline") {
        const ann = makeAnnotation("hline", [pt], crypto.randomUUID(), Date.now());
        selectedIdRef.current = ann.id;
        commitAnnotations([...annotationsRef.current, ann], true);
        applyTool("cursor", false);
        return;
      }

      if (!isTwoPointTool(tool)) return;

      const drawing = drawingRef.current;
      if (!drawing) {
        drawingRef.current = { tool, p1: pt };
        hoverRef.current = pt;
        pushState();
        return;
      }

      const { tool: startedTool, p1 } = drawing;
      drawingRef.current = null;
      hoverRef.current = null;
      if (startedTool === "measure") {
        measureRef.current = { p1, p2: pt };
        applyTool("cursor", true);
        return;
      }
      const ann = makeAnnotation(startedTool, [p1, pt], crypto.randomUUID(), Date.now());
      selectedIdRef.current = ann.id;
      commitAnnotations([...annotationsRef.current, ann], true);
      applyTool("cursor", false);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const pt = toPoint(e);
        if (!pt) return;
        if (!drag.moved) {
          if (pixelDistance(pointerPx(e), drag.startPx) <= DRAG_THRESHOLD_PX) return;
          drag.moved = true;
        }
        const nextPoints = dragPoints(drag.origPoints, drag.region, drag.startTime, drag.startPrice, pt);
        annotationsRef.current = annotationsRef.current.map((a) =>
          a.id === drag.id ? { ...a, points: nextPoints } : a,
        );
        pushState();
        return;
      }
      const drawing = drawingRef.current;
      if (drawing) {
        const pt = toPoint(e);
        if (!pt) return;
        hoverRef.current = pt;
        pushState();
      }
    };

    const onPointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      updateScrollLock();
      if (drag.moved) {
        setAnnotations(annotationsRef.current);
        scheduleSave(annotationsRef.current);
      }
      pushState();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const drag = dragRef.current;
        if (drag && drag.moved) {
          annotationsRef.current = annotationsRef.current.map((a) =>
            a.id === drag.id ? { ...a, points: drag.origPoints } : a,
          );
          setAnnotations(annotationsRef.current);
        }
        selectedIdRef.current = null;
        dragRef.current = null;
        applyTool("cursor", false);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isEditableTarget(e.target)) return;
        const id = selectedIdRef.current;
        if (!id) return;
        e.preventDefault();
        selectedIdRef.current = null;
        commitAnnotations(
          annotationsRef.current.filter((a) => a.id !== id),
          true,
        );
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    updateScrollLock();
    pushState();

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      try {
        chart.applyOptions({ handleScroll: true, handleScale: true });
      } catch {
        void 0;
      }
      try {
        series.detachPrimitive(primitive);
      } catch {
        void 0;
      }
      primitiveRef.current = null;
    };
  }, [handle, applyTool, commitAnnotations, pushState, scheduleSave, updateScrollLock]);

  useEffect(() => {
    if (!handle) return;
    const controller = new AbortController();
    let active = true;
    const target = symbol;

    selectedIdRef.current = null;
    dragRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    measureRef.current = null;
    annotationsRef.current = [];
    setAnnotations([]);
    pushState();

    fetch(`/api/annotations/${encodeURIComponent(symbol)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ ok: boolean; data: Annotation[] }>;
      })
      .then((json) => {
        if (!active || target !== symbolRef.current) return;
        const loaded = json.ok && Array.isArray(json.data) ? json.data : [];
        selectedIdRef.current = null;
        dragRef.current = null;
        drawingRef.current = null;
        hoverRef.current = null;
        measureRef.current = null;
        annotationsRef.current = loaded;
        setAnnotations(loaded);
        pushState();
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        console.error("failed to load annotations", err);
      });

    return () => {
      active = false;
      controller.abort();
      flushSave();
    };
  }, [handle, symbol, flushSave, pushState]);

  useEffect(() => {
    pushState();
  }, [barTimes, pushState]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  return { activeTool, setActiveTool, clearAll, count: annotations.length };
}
