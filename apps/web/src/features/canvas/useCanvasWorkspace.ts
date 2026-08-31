import { useCallback, useState } from 'react';

export function useCanvasWorkspace() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const open = useCallback((slug: string) => {
    setOpenSlug(slug);
  }, []);

  const close = useCallback(() => {
    setOpenSlug(null);
  }, []);

  return { openSlug, open, close };
}
