import { useEffect, type MutableRefObject } from "react";
import type { Logical } from "lightweight-charts";
import type { Annotation, AnnotationPoint, AnnotationStyle } from "@kansoku/shared/types";
import { logicalToTime, timeToLogical, type HitRegion, type Pt } from "@kansoku/shared/drawings";
import { DrawingsPrimitive, type HoverLabel, type MeasureShape } from "./drawingsPrimitive";
import { dragPoints, isMultiPointTool, makeAnnotation, MAX_POLYLINE_POINTS, pickHit, pixelDistance, type DrawingTool } from "./drawingsMachine";
import type { DrawingsHandle } from "./useDrawings";

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
  tool: import("./drawingsMachine").MultiPointTool;
  points: AnnotationPoint[];
}

const DRAG_THRESHOLD_PX = 3;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
};

export interface DrawingsInteractionContext {
  primitiveRef: MutableRefObject<DrawingsPrimitive | null>;
  barTimesRef: MutableRefObject<number[]>;
  toolRef: MutableRefObject<DrawingTool>;
  draftStyleRef: MutableRefObject<AnnotationStyle>;
  dragRef: MutableRefObject<DragState | null>;
  drawingRef: MutableRefObject<InProgress | null>;
  hoverRef: MutableRefObject<AnnotationPoint | null>;
  hoverLabelRef: MutableRefObject<HoverLabel | null>;
  measureRef: MutableRefObject<MeasureShape | null>;
  annotationsRef: MutableRefObject<Annotation[]>;
  selectedIdRef: MutableRefObject<string | null>;
  setAnnotations: (next: Annotation[]) => void;
  setSelected: (id: string | null) => void;
  updateScrollLock: () => void;
  pushState: () => void;
  commitAnnotations: (next: Annotation[], save: boolean) => void;
  flushPendingRemote: () => void;
  scheduleSave: (next: Annotation[]) => void;
  applyTool: (next: DrawingTool, keepMeasure: boolean) => void;
}

export function useDrawingsInteraction(handle: DrawingsHandle | null, ctx: DrawingsInteractionContext): void {
  const {
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
    setAnnotations,
    setSelected,
    updateScrollLock,
    pushState,
    commitAnnotations,
    flushPendingRemote,
    scheduleSave,
    applyTool,
  } = ctx;

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

    const withDraftStyle = (ann: Annotation): Annotation => {
      const draft = draftStyleRef.current;
      return Object.keys(draft).length > 0 ? { ...ann, style: { ...draft } } : ann;
    };

    const endPolyline = (points: AnnotationPoint[]) => {
      drawingRef.current = null;
      hoverRef.current = null;
      if (points.length >= 2) {
        const ann = withDraftStyle(makeAnnotation("polyline", points, crypto.randomUUID(), Date.now()));
        setSelected(ann.id);
        commitAnnotations([...annotationsRef.current, ann], true);
      } else {
        pushState();
      }
      flushPendingRemote();
    };

    const onPointerDown = (e: PointerEvent) => {
      const pt = toPoint(e);
      if (!pt) return;
      if (measureRef.current) measureRef.current = null;
      const tool = toolRef.current;

      if (tool === "cursor") {
        const hit = pickHit(annotationsRef.current, toPx, pointerPx(e));
        if (hit) {
          setSelected(hit.id);
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
          setSelected(null);
        }
        pushState();
        return;
      }

      if (tool === "hline") {
        const ann = withDraftStyle(makeAnnotation("hline", [pt], crypto.randomUUID(), Date.now()));
        setSelected(ann.id);
        commitAnnotations([...annotationsRef.current, ann], true);
        flushPendingRemote();
        return;
      }

      if (!isMultiPointTool(tool)) return;

      const drawing = drawingRef.current;
      if (!drawing) {
        drawingRef.current = { tool, points: [pt] };
        hoverRef.current = pt;
        pushState();
        return;
      }

      if (drawing.tool === "polyline") {
        const points = [...drawing.points, pt];
        if (points.length >= MAX_POLYLINE_POINTS) {
          endPolyline(points);
          return;
        }
        drawingRef.current = { tool: "polyline", points };
        hoverRef.current = pt;
        pushState();
        return;
      }

      const { tool: startedTool, points } = drawing;
      const p1 = points[0];
      drawingRef.current = null;
      hoverRef.current = null;
      if (startedTool === "measure") {
        measureRef.current = { p1, p2: pt };
        applyTool("cursor", true);
        flushPendingRemote();
        return;
      }
      const ann = withDraftStyle(makeAnnotation(startedTool, [p1, pt], crypto.randomUUID(), Date.now()));
      setSelected(ann.id);
      commitAnnotations([...annotationsRef.current, ann], true);
      flushPendingRemote();
    };

    const onDoubleClick = (e: MouseEvent) => {
      const drawing = drawingRef.current;
      if (!drawing || drawing.tool !== "polyline") return;
      e.preventDefault();
      endPolyline(drawing.points.slice(0, -1));
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
        return;
      }
      if (toolRef.current !== "cursor") {
        if (hoverLabelRef.current) {
          hoverLabelRef.current = null;
          pushState();
        }
        return;
      }
      const rect = container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        if (hoverLabelRef.current) {
          hoverLabelRef.current = null;
          pushState();
        }
        return;
      }
      const p = pointerPx(e);
      const hit = pickHit(annotationsRef.current, toPx, p);
      const hitAnn = hit ? annotationsRef.current.find((a) => a.id === hit.id) : undefined;
      const nextHover: HoverLabel | null = hitAnn?.label ? { x: p.x, y: p.y, text: hitAnn.label } : null;
      const prevHover = hoverLabelRef.current;
      const hoverChanged =
        (prevHover === null) !== (nextHover === null) ||
        prevHover?.text !== nextHover?.text ||
        prevHover?.x !== nextHover?.x ||
        prevHover?.y !== nextHover?.y;
      hoverLabelRef.current = nextHover;
      if (hoverChanged) pushState();
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
      flushPendingRemote();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const drawing = drawingRef.current;
        if (drawing && drawing.tool === "polyline") {
          endPolyline(drawing.points);
          applyTool("cursor", false);
          return;
        }
        const drag = dragRef.current;
        if (drag && drag.moved) {
          annotationsRef.current = annotationsRef.current.map((a) =>
            a.id === drag.id ? { ...a, points: drag.origPoints } : a,
          );
          setAnnotations(annotationsRef.current);
        }
        setSelected(null);
        dragRef.current = null;
        applyTool("cursor", false);
        flushPendingRemote();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isEditableTarget(e.target)) return;
        const id = selectedIdRef.current;
        if (!id) return;
        e.preventDefault();
        setSelected(null);
        commitAnnotations(
          annotationsRef.current.filter((a) => a.id !== id),
          true,
        );
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    updateScrollLock();
    pushState();

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      primitiveRef.current = null;
    };
  }, [handle, applyTool, commitAnnotations, flushPendingRemote, pushState, scheduleSave, setSelected, updateScrollLock]);
}
