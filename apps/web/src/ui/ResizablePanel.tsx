import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export type ResizablePanelSide = "start" | "end";

export function clampPanelSize(size: number, minSize: number, maxSize: number): number {
  return Math.min(maxSize, Math.max(minSize, size));
}

export function panelSizeFromPointer({
  side,
  startSize,
  startPosition,
  currentPosition,
  minSize,
  maxSize,
}: {
  side: ResizablePanelSide;
  startSize: number;
  startPosition: number;
  currentPosition: number;
  minSize: number;
  maxSize: number;
}): number {
  const delta = currentPosition - startPosition;
  return clampPanelSize(startSize + (side === "start" ? delta : -delta), minSize, maxSize);
}

export function panelSizeFromKey({
  key,
  side,
  size,
  minSize,
  maxSize,
  step = 16,
}: {
  key: string;
  side: ResizablePanelSide;
  size: number;
  minSize: number;
  maxSize: number;
  step?: number;
}): number | null {
  if (key === "Home") return minSize;
  if (key === "End") return maxSize;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const direction = key === "ArrowRight" ? 1 : -1;
  return clampPanelSize(size + direction * step * (side === "start" ? 1 : -1), minSize, maxSize);
}

function readStoredSize(storageKey: string | undefined, fallback: number, minSize: number, maxSize: number): number {
  if (!storageKey || typeof window === "undefined") return clampPanelSize(fallback, minSize, maxSize);
  try {
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0
      ? clampPanelSize(stored, minSize, maxSize)
      : clampPanelSize(fallback, minSize, maxSize);
  } catch {
    return clampPanelSize(fallback, minSize, maxSize);
  }
}

function storeSize(storageKey: string | undefined, size: number): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(Math.round(size)));
  } catch {
    // Resizing remains available when storage is unavailable.
  }
}

interface DragState {
  pointerId: number;
  startPosition: number;
  startSize: number;
}

export function ResizablePanel({
  children,
  className,
  contentClassName,
  side = "start",
  defaultSize,
  minSize = 220,
  maxSize = 560,
  storageKey,
  handleLabel = "调整面板宽度",
  onSizeChange,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  side?: ResizablePanelSide;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  storageKey?: string;
  handleLabel?: string;
  onSizeChange?: (size: number) => void;
}) {
  const initialSizeRef = useRef(clampPanelSize(defaultSize, minSize, maxSize));
  const [size, setSize] = useState(() => readStoredSize(storageKey, defaultSize, minSize, maxSize));
  const sizeRef = useRef(size);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  const updateSize = (nextSize: number, persist = false) => {
    const next = clampPanelSize(nextSize, minSize, maxSize);
    sizeRef.current = next;
    setSize(next);
    onSizeChange?.(next);
    if (persist) storeSize(storageKey, next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startPosition: event.clientX, startSize: sizeRef.current };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateSize(
      panelSizeFromPointer({
        side,
        startSize: drag.startSize,
        startPosition: drag.startPosition,
        currentPosition: event.clientX,
        minSize,
        maxSize,
      }),
    );
  };

  const finishPointerResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    storeSize(storageKey, sizeRef.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = panelSizeFromKey({ key: event.key, side, size: sizeRef.current, minSize, maxSize });
    if (next === null) return;
    event.preventDefault();
    updateSize(next, true);
  };

  const resetSize = () => updateSize(initialSizeRef.current, true);
  const handle = (
    <div
      className={`resize-panel-handle${dragging ? " dragging" : ""}`}
      role="separator"
      aria-label={handleLabel}
      aria-orientation="vertical"
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      title="拖动调整宽度，双击恢复默认值"
      onDoubleClick={resetSize}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
    />
  );
  const style = { width: size, minWidth: minSize, maxWidth: maxSize } satisfies CSSProperties;

  return (
    <div
      className={`resize-panel resize-panel--${side}${dragging ? " resize-panel--dragging" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {side === "end" ? handle : null}
      <div className={`resize-panel-content${contentClassName ? ` ${contentClassName}` : ""}`}>{children}</div>
      {side === "start" ? handle : null}
    </div>
  );
}
