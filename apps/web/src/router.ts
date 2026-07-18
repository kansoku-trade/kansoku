import { useEffect, useState } from 'react';
import { parseAppDeepLink } from '@kansoku/shared/appDeepLink';

const LOCATION_EVENT = 'locationchange';

export interface RouteStore {
  getRoute(): string;
  subscribe(cb: () => void): () => void;
  push(route: string): void;
  replace(route: string): void;
}

function currentWindowRoute(): string {
  return (window.location.pathname || '/') + window.location.search;
}

const windowStore: RouteStore = {
  getRoute: currentWindowRoute,
  subscribe(cb) {
    window.addEventListener('popstate', cb);
    window.addEventListener(LOCATION_EVENT, cb);
    return () => {
      window.removeEventListener('popstate', cb);
      window.removeEventListener(LOCATION_EVENT, cb);
    };
  },
  push(route) {
    window.history.pushState({}, '', route);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  },
  replace(route) {
    window.history.replaceState({}, '', route);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  },
};

let activeStore: RouteStore | null = null;

// Desktop tab mode points this at a per-tab in-memory store before mounting
// that tab's page tree, so useRoute/navigate/useQueryParam resolve against
// the active tab instead of window.location without changing their public
// signatures. Only TabsProvider (web/src/desktop) calls this.
export function __setActiveRouteStore(store: RouteStore | null): void {
  activeStore = store;
}

function currentStore(): RouteStore {
  return activeStore ?? windowStore;
}

export function createMemoryRouteStore(
  initialRoute: string,
  opts: { onChange?: (route: string) => void } = {},
): RouteStore {
  let route = initialRoute;
  const listeners = new Set<() => void>();
  const set = (next: string) => {
    if (next === route) return;
    route = next;
    opts.onChange?.(next);
    for (const cb of listeners) cb();
  };
  return {
    getRoute: () => route,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    push: set,
    replace: set,
  };
}

export function useRoute(): string {
  const [route, setRoute] = useState(() => currentStore().getRoute());
  useEffect(() => {
    const store = currentStore();
    setRoute(store.getRoute());
    return store.subscribe(() => setRoute(store.getRoute()));
  }, []);
  return route;
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

export function navigate(route: string, options: { replace?: boolean } = {}): void {
  const store = currentStore();
  if (route === store.getRoute()) return;
  if (options.replace) store.replace(route);
  else store.push(route);
}

export function useQueryParam(name: string): string | null {
  const read = () => {
    const [, search] = currentStore().getRoute().split('?');
    return new URLSearchParams(search ?? '').get(name);
  };
  const [value, setValue] = useState(read);
  useEffect(() => {
    const store = currentStore();
    const onChange = () => setValue(read());
    onChange();
    return store.subscribe(onChange);
  }, [name]);
  return value;
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
