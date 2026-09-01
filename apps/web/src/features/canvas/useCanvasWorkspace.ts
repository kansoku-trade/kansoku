import { useCallback, useEffect, useState } from 'react';

export function useCanvasWorkspace(initialSlug: string | null = null) {
  const [openSlug, setOpenSlug] = useState<string | null>(initialSlug);

  useEffect(() => {
    setOpenSlug(initialSlug);
  }, [initialSlug]);

  const open = useCallback((slug: string) => {
    setOpenSlug(slug);
  }, []);

  const close = useCallback(() => {
    setOpenSlug(null);
  }, []);

  return { openSlug, open, close };
}
