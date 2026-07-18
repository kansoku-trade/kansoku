import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "chat-panel-rect";
const MIN_W = 320;
const MIN_H = 240;
const MARGIN = 16;
const KEEP_VISIBLE = 100;
const DEFAULT_W = 420;
const DEFAULT_H = 460;

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeEdge = "w" | "n" | "nw";

export function clampRect(rect: FloatRect, vw: number, vh: number): FloatRect {
  const w = Math.min(Math.max(rect.w, MIN_W), Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(Math.max(rect.h, MIN_H), Math.max(MIN_H, vh - MARGIN * 2));
  const minX = KEEP_VISIBLE - w;
  const maxX = Math.max(minX, vw - KEEP_VISIBLE);
  const maxY = Math.max(0, vh - KEEP_VISIBLE);
  return {
    w,
    h,
    x: Math.min(Math.max(rect.x, minX), maxX),
    y: Math.min(Math.max(rect.y, 0), maxY),
  };
}

export function defaultRect(vw: number, vh: number): FloatRect {
  const w = Math.min(DEFAULT_W, Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(DEFAULT_H, Math.max(MIN_H, vh - MARGIN * 2));
  return clampRect({ x: vw - w - MARGIN, y: vh - h - MARGIN, w, h }, vw, vh);
}

function isRect(value: unknown): value is FloatRect {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((k) => typeof r[k] === "number" && Number.isFinite(r[k]));
}

function loadRect(vw: number, vh: number): FloatRect {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRect(vw, vh);
    const parsed: unknown = JSON.parse(raw);
    return isRect(parsed) ? clampRect(parsed, vw, vh) : defaultRect(vw, vh);
  } catch {
    return defaultRect(vw, vh);
  }
}

function saveRect(rect: FloatRect): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    return;
  }
}

export interface FloatingRectHandle {
  rect: FloatRect;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (edge: ResizeEdge) => (e: React.PointerEvent) => void;
  dragging: boolean;
}

export function useFloatingRect(): FloatingRectHandle {
  const [rect, setRect] = useState<FloatRect>(() => loadRect(window.innerWidth, window.innerHeight));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onResize = () => {
      setRect((prev) => clampRect(prev, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const track = useCallback((compute: (dx: number, dy: number) => FloatRect, startX: number, startY: number) => {
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      const next = compute(ev.clientX - startX, ev.clientY - startY);
      setRect(clampRect(next, window.innerWidth, window.innerHeight));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      setDragging(false);
      setRect((current) => {
        saveRect(current);
        return current;
      });
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  }, []);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const start = rect;
      track((dx, dy) => ({ ...start, x: start.x + dx, y: start.y + dy }), e.clientX, e.clientY);
    },
    [rect, track],
  );

  const onResizeStart = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const start = rect;
      const right = start.x + start.w;
      const bottom = start.y + start.h;
      track(
        (dx, dy) => {
          const next = { ...start };
          if (edge === "w" || edge === "nw") {
            next.w = Math.max(MIN_W, start.w - dx);
            next.x = right - next.w;
          }
          if (edge === "n" || edge === "nw") {
            next.h = Math.max(MIN_H, start.h - dy);
            next.y = bottom - next.h;
          }
          return next;
        },
        e.clientX,
        e.clientY,
      );
    },
    [rect, track],
  );

  return { rect, onDragStart, onResizeStart, dragging };
}
