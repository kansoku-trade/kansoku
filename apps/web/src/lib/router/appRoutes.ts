import type { RouteObject } from 'react-router';
import { RouteErrorBoundary } from '@web/features/errors/RouteErrorBoundary';
import { routes } from '../../generated-routes';

// Every route carries the boundary rather than one root route holding it for all of them: a crash
// inside a desktop tab then takes down that tab's page and leaves the titlebar, the tab strip, and
// every sibling tab standing.
function withBoundary(route: RouteObject): RouteObject {
  // An index route's `children` is typed as strictly undefined, so spreading both halves of the
  // union through one object literal makes the result assignable to neither.
  if (route.index) return { ...route, ErrorBoundary: RouteErrorBoundary };
  return {
    ...route,
    ErrorBoundary: RouteErrorBoundary,
    ...(route.children ? { children: route.children.map(withBoundary) } : {}),
  };
}

let cached: RouteObject[] | null = null;

// Deliberately lazy. generated-routes imports every page, pages import this module's neighbours in
// lib/router, so wrapping at module scope reads `routes` mid-cycle and gets undefined.
export function getAppRoutes(): RouteObject[] {
  cached ??= routes.map(withBoundary);
  return cached;
}
