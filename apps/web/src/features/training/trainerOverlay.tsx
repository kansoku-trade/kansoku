import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TrainerOverlaySlot = 'rail' | 'stack' | 'pinned';

interface OverlayApi {
  slots: Partial<Record<TrainerOverlaySlot, HTMLElement>>;
  frame: HTMLElement | null;
  register: (slot: TrainerOverlaySlot | 'frame', element: HTMLElement | null) => void;
}

const OverlayContext = createContext<OverlayApi | null>(null);

export function TrainerOverlayProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Partial<Record<string, HTMLElement>>>({});
  const register = useCallback((slot: string, element: HTMLElement | null) => {
    setNodes((prev) => {
      const next = element ?? undefined;
      if (prev[slot] === next) return prev;
      return { ...prev, [slot]: next };
    });
  }, []);
  const api = useMemo<OverlayApi>(
    () => ({ slots: nodes, frame: nodes.frame ?? null, register }),
    [nodes, register],
  );
  return <OverlayContext value={api}>{children}</OverlayContext>;
}

export function TrainerOverlayLayer() {
  const register = use(OverlayContext)?.register;
  // The ref callbacks must keep a stable identity: React re-runs a changed ref callback on every
  // commit (detach with null, re-attach with the element), and each of those calls register, whose
  // setState commits again — an inline arrow here loops until React's update-depth limit trips.
  const refs = useMemo(() => {
    if (!register) return null;
    const bind = (slot: TrainerOverlaySlot | 'frame') => (element: HTMLElement | null) => {
      register(slot, element);
    };
    return {
      frame: bind('frame'),
      rail: bind('rail'),
      stack: bind('stack'),
      pinned: bind('pinned'),
    };
  }, [register]);
  if (!refs) return null;
  return (
    <div className="trainer-overlay" ref={refs.frame}>
      <div className="trainer-overlay-rail" ref={refs.rail} />
      <div className="trainer-overlay-stack" ref={refs.stack} />
      <div className="trainer-overlay-pinned" ref={refs.pinned} />
    </div>
  );
}

export function TrainerOverlayPortal({
  slot,
  children,
}: {
  slot: TrainerOverlaySlot;
  children: ReactNode;
}) {
  const host = use(OverlayContext)?.slots[slot];
  return host ? createPortal(children, host) : null;
}

// The frame is the element the pinned slot spans, so a price coordinate measured against the chart
// canvas becomes a `top` for a pinned chip by adding the offset between the two.
export function useTrainerOverlayFrame(): HTMLElement | null {
  return use(OverlayContext)?.frame ?? null;
}
