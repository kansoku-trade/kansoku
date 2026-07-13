import { useEffect, useState } from "react";

const LOCATION_EVENT = "locationchange";

export interface RouteStore {
  getRoute(): string;
  subscribe(cb: () => void): () => void;
  push(route: string): void;
  replace(route: string): void;
}

function currentWindowRoute(): string {
  return (window.location.pathname || "/") + window.location.search;
}

const windowStore: RouteStore = {
  getRoute: currentWindowRoute,
  subscribe(cb) {
    window.addEventListener("popstate", cb);
    window.addEventListener(LOCATION_EVENT, cb);
    return () => {
      window.removeEventListener("popstate", cb);
      window.removeEventListener(LOCATION_EVENT, cb);
    };
  },
  push(route) {
    window.history.pushState({}, "", route);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  },
  replace(route) {
    window.history.replaceState({}, "", route);
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

export function createMemoryRouteStore(initialRoute: string, opts: { onChange?: (route: string) => void } = {}): RouteStore {
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
  const queryIndex = route.indexOf("?");
  const pathname = queryIndex === -1 ? route : route.slice(0, queryIndex);
  return pathname || "/";
}

export function navigate(route: string, options: { replace?: boolean } = {}): void {
  const store = currentStore();
  if (route === store.getRoute()) return;
  if (options.replace) store.replace(route);
  else store.push(route);
}

export function useQueryParam(name: string): string | null {
  const read = () => {
    const [, search] = currentStore().getRoute().split("?");
    return new URLSearchParams(search ?? "").get(name);
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
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("#")) return;

    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}
