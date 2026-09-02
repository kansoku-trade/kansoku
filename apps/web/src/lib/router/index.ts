import { useSyncExternalStore } from 'react';
import { createBrowserRouter } from 'react-router';
import type { DataRouter } from 'react-router';
import { parseAppDeepLink } from '@kansoku/shared/appDeepLink';
import { getAppRoutes } from './appRoutes';

let browserRouter: DataRouter | null = null;

export function getBrowserRouter(): DataRouter {
  browserRouter ??= createBrowserRouter(getAppRoutes());
  return browserRouter;
}

let activeRouter: DataRouter | null = null;
const listeners = new Set<() => void>();
let unsubscribeActive: (() => void) | null = null;

function resolveActive(): DataRouter {
  return activeRouter ?? getBrowserRouter();
}

function resubscribe(): void {
  unsubscribeActive?.();
  unsubscribeActive = resolveActive().subscribe(() => {
    for (const cb of [...listeners]) cb();
  });
}

export function setActiveRouter(router: DataRouter | null, notify = true): void {
  activeRouter = router;
  if (listeners.size > 0) resubscribe();
  if (!notify) return;
  for (const cb of [...listeners]) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) resubscribe();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      unsubscribeActive?.();
      unsubscribeActive = null;
    }
  };
}

function currentRoute(): string {
  const { pathname, search } = resolveActive().state.location;
  return pathname + search;
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentRoute, currentRoute);
}

interface NavigationOptions {
  replace?: boolean;
  newTab?: boolean;
}

type NavigationInterceptor = (route: string, options: NavigationOptions) => boolean;

let navigationInterceptor: NavigationInterceptor | null = null;

export function setNavigationInterceptor(interceptor: NavigationInterceptor | null): void {
  navigationInterceptor = interceptor;
}

export function navigate(route: string, options: NavigationOptions = {}): void {
  const router = resolveActive();
  const { pathname, search } = router.state.location;
  if (route === pathname + search) return;
  if (navigationInterceptor?.(route, options)) return;
  void router.navigate(route, { replace: options.replace });
}

export function useQueryParam(name: string): string | null {
  const route = useRoute();
  const [, search] = route.split('?');
  return new URLSearchParams(search ?? '').get(name);
}

export function routePathname(route: string): string {
  const queryIndex = route.indexOf('?');
  const pathname = queryIndex === -1 ? route : route.slice(0, queryIndex);
  return pathname || '/';
}

const POPOUT_SYMBOL_ROUTE_RE = /^\/popout\/symbol\/([^/]+)$/;

export function matchPopoutSymbolRoute(pathname: string): string | null {
  const match = POPOUT_SYMBOL_ROUTE_RE.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function installRouter(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    const href = anchor.getAttribute('href');
    const route = resolveAnchorRoute(href, anchor.href, window.location.origin);
    if (!route) return;

    event.preventDefault();
    navigate(route);
  });
}

const ABSOLUTE_SCHEME_RE = /^[A-Za-z][\d+.A-Za-z-]*:/;

export function resolveAnchorRoute(
  rawHref: string | null,
  resolvedHref: string,
  currentOrigin: string,
): string | null {
  if (!rawHref) return null;
  const appLink = parseAppDeepLink(rawHref);
  if (appLink) return appLink.route;
  if (rawHref.startsWith('//') || rawHref.startsWith('#') || ABSOLUTE_SCHEME_RE.test(rawHref))
    return null;

  try {
    const url = new URL(resolvedHref);
    if (url.origin !== currentOrigin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
