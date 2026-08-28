import { useCallback, useState } from 'react';
import type { CanvasPaneView } from './CanvasPane';

export function useCanvasWorkspace() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [view, setView] = useState<CanvasPaneView>('canvas');

  const open = useCallback((slug: string, nextView: CanvasPaneView = 'canvas') => {
    setOpenSlug(slug);
    setView(nextView);
  }, []);

  const close = useCallback(() => {
    setOpenSlug(null);
    setView('canvas');
  }, []);

  return { openSlug, view, open, close, setView };
}
