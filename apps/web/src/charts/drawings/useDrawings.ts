import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Annotation, AnnotationKind, AnnotationPoint, AnnotationStyle } from "@kansoku/shared/types";
import type { HitRegion, Pt } from "@kansoku/shared/drawings";
import { client } from "@web/client";
import { subscribeChannel } from "@web/wsHub";
import { DrawingsPrimitive, type HoverLabel, type MeasureShape, type PreviewShape } from "./drawingsPrimitive";
import { type DrawingTool, type MultiPointTool } from "./drawingsMachine";
import { useDrawingsInteraction } from "./useDrawingsInteraction";

export function decodeAnnotationsFrame(payload: unknown, ownClientId: string): Annotation[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const frame = payload as { type?: unknown; annotations?: unknown; clientId?: unknown };
  if (frame.type !== "init" && frame.type !== "update") return null;
  if (!Array.isArray(frame.annotations)) return null;
  if (frame.type === "update" && frame.clientId === ownClientId) return null;
  return frame.annotations as Annotation[];
}

export function mergePendingRemote(remote: Annotation[], local: Annotation[]): Annotation[] {
  const remoteIds = new Set(remote.map((a) => a.id));
  return [...remote, ...local.filter((a) => !remoteIds.has(a.id))];
}

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
  clearAi: () => void;
  hasAi: boolean;
  count: number;
  selected: Annotation | null;
  updateStyle: (id: string, patch: Partial<AnnotationStyle>) => void;
  draftStyle: AnnotationStyle;
  updateDraftStyle: (patch: Partial<AnnotationStyle>) => void;
}

const toolMemory = new Map<string, DrawingTool>();
const draftStyleMemory = new Map<string, AnnotationStyle>();

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
  tool: MultiPointTool;
  points: AnnotationPoint[];
}

interface PendingSave {
  symbol: string;
  annotations: Annotation[];
}

const SAVE_DEBOUNCE_MS = 1000;

export function useDrawings(handle: DrawingsHandle | null, symbol: string, barTimes: number[]): DrawingsApi {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveToolState] = useState<DrawingTool>(() => toolMemory.get(symbol) ?? "cursor");
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [draftStyle, setDraftStyle] = useState<AnnotationStyle>(() => draftStyleMemory.get(symbol) ?? {});

  const handleRef = useRef<DrawingsHandle | null>(handle);
  handleRef.current = handle;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const barTimesRef = useRef(barTimes);
  barTimesRef.current = barTimes;

  const annotationsRef = useRef<Annotation[]>([]);
  const toolRef = useRef<DrawingTool>(toolMemory.get(symbol) ?? "cursor");
  const draftStyleRef = useRef<AnnotationStyle>(draftStyleMemory.get(symbol) ?? {});
  const selectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const drawingRef = useRef<InProgress | null>(null);
  const hoverRef = useRef<AnnotationPoint | null>(null);
  const hoverLabelRef = useRef<HoverLabel | null>(null);
  const measureRef = useRef<MeasureShape | null>(null);

  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const pendingRemoteRef = useRef<Annotation[] | null>(null);

  const clientIdRef = useRef<string | null>(null);
  if (clientIdRef.current === null) clientIdRef.current = crypto.randomUUID();

  const isInteracting = useCallback(() => drawingRef.current !== null || dragRef.current !== null, []);

  const pushState = useCallback(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const drawing = drawingRef.current;
    const hover = hoverRef.current;
    let preview: PreviewShape | null = null;
    let measure: MeasureShape | null = measureRef.current;
    if (drawing && hover) {
      if (drawing.tool === "measure") {
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
    void client.annotations
      .replace({ symbol: pending.symbol, annotations: pending.annotations, clientId: clientIdRef.current ?? undefined })
      .catch((err: unknown) => {
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

  const replaceFromRemote = useCallback(
    (next: Annotation[]) => {
      if (selectedIdRef.current && !next.some((a) => a.id === selectedIdRef.current)) {
        setSelected(null);
      }
      annotationsRef.current = next;
      setAnnotations(next);
      pushState();
    },
    [pushState, setSelected],
  );

  const applyRemoteWithMerge = useCallback(
    (next: Annotation[]) => {
      if (!pendingSaveRef.current) {
        replaceFromRemote(next);
        return;
      }
      const merged = mergePendingRemote(next, annotationsRef.current);
      replaceFromRemote(merged);
      pendingSaveRef.current = { symbol: pendingSaveRef.current.symbol, annotations: merged };
    },
    [replaceFromRemote],
  );

  const flushPendingRemote = useCallback(() => {
    if (isInteracting()) return;
    const pending = pendingRemoteRef.current;
    if (!pending) return;
    pendingRemoteRef.current = null;
    applyRemoteWithMerge(pending);
  }, [isInteracting, applyRemoteWithMerge]);

  const handleAnnotationsFrame = useCallback(
    (payload: unknown) => {
      const next = decodeAnnotationsFrame(payload, clientIdRef.current ?? "");
      if (!next) return;
      if (isInteracting()) {
        pendingRemoteRef.current = next;
        return;
      }
      pendingRemoteRef.current = null;
      applyRemoteWithMerge(next);
    },
    [isInteracting, applyRemoteWithMerge],
  );

  const applyTool = useCallback(
    (next: DrawingTool, keepMeasure: boolean) => {
      toolRef.current = next;
      toolMemory.set(symbolRef.current, next);
      setActiveToolState(next);
      drawingRef.current = null;
      hoverRef.current = null;
      hoverLabelRef.current = null;
      if (!keepMeasure) measureRef.current = null;
      updateScrollLock();
      pushState();
    },
    [pushState, updateScrollLock],
  );

  const setActiveTool = useCallback((t: DrawingTool) => applyTool(t, false), [applyTool]);

  const clearAll = useCallback(() => {
    setSelected(null);
    measureRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    hoverLabelRef.current = null;
    commitAnnotations([], true);
  }, [commitAnnotations, setSelected]);

  const clearAi = useCallback(() => {
    const next = annotationsRef.current.filter((a) => a.source !== "ai");
    if (selectedIdRef.current && !next.some((a) => a.id === selectedIdRef.current)) {
      setSelected(null);
    }
    commitAnnotations(next, true);
  }, [commitAnnotations, setSelected]);

  const updateStyle = useCallback(
    (id: string, patch: Partial<AnnotationStyle>) => {
      const next = annotationsRef.current.map((a) => (a.id === id ? { ...a, style: { ...a.style, ...patch } } : a));
      commitAnnotations(next, true);
    },
    [commitAnnotations],
  );

  const updateDraftStyle = useCallback((patch: Partial<AnnotationStyle>) => {
    const next = { ...draftStyleRef.current, ...patch };
    draftStyleRef.current = next;
    draftStyleMemory.set(symbolRef.current, next);
    setDraftStyle(next);
  }, []);

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
    setAnnotations,
    setSelected,
    updateScrollLock,
    pushState,
    commitAnnotations,
    flushPendingRemote,
    scheduleSave,
    applyTool,
  });

  useEffect(() => {
    if (!handle) return;
    let active = true;
    const target = symbol;

    setSelected(null);
    dragRef.current = null;
    drawingRef.current = null;
    hoverRef.current = null;
    hoverLabelRef.current = null;
    measureRef.current = null;
    pendingRemoteRef.current = null;
    annotationsRef.current = [];
    setAnnotations([]);
    const rememberedDraft = draftStyleMemory.get(symbol) ?? {};
    draftStyleRef.current = rememberedDraft;
    setDraftStyle(rememberedDraft);
    applyTool(toolMemory.get(symbol) ?? "cursor", false);
    pushState();

    client.annotations
      .list({ symbol })
      .then((loaded) => {
        if (!active || target !== symbolRef.current) return;
        setSelected(null);
        dragRef.current = null;
        drawingRef.current = null;
        hoverRef.current = null;
        hoverLabelRef.current = null;
        measureRef.current = null;
        annotationsRef.current = loaded;
        setAnnotations(loaded);
        pushState();
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.error("failed to load annotations", err);
      });

    const unsubscribe = subscribeChannel({ kind: "annotations", symbol }, handleAnnotationsFrame, () => {});

    return () => {
      active = false;
      unsubscribe();
      flushSave();
    };
  }, [handle, symbol, applyTool, flushSave, handleAnnotationsFrame, pushState, setSelected]);

  useEffect(() => {
    pushState();
  }, [barTimes, pushState]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const selected = selectedId ? (annotations.find((a) => a.id === selectedId) ?? null) : null;
  const hasAi = annotations.some((a) => a.source === "ai");

  return {
    activeTool,
    setActiveTool,
    clearAll,
    clearAi,
    hasAi,
    count: annotations.length,
    selected,
    updateStyle,
    draftStyle,
    updateDraftStyle,
  };
}
