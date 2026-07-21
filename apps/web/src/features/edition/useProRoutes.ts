import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

let cached: Promise<Record<string, ComponentType> | null> | null = null;

// This import must stay dynamic: a static edge here would pull the pro chunk
// into the public bundle, defeating the __pro__ encryption boundary.
function resolveProRoutes(): Promise<Record<string, ComponentType> | null> {
  cached ??= import('./pro')
    .then((m) => m.loadProComposition())
    .then((composition) => (composition ? { ...composition.routes } : null))
    .catch(() => null);
  return cached;
}

export function useProRoutes(): Record<string, ComponentType> | null {
  const [routes, setRoutes] = useState<Record<string, ComponentType> | null>(null);

  useEffect(() => {
    let active = true;
    void resolveProRoutes().then((resolved) => {
      if (active) setRoutes(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  return routes;
}

export function resetProRoutesForTests(): void {
  cached = null;
}
