import { useEffect, useState } from "react";

const LOCATION_EVENT = "locationchange";

function currentRoute(): string {
  return window.location.pathname || "/";
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("popstate", onChange);
    window.addEventListener(LOCATION_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(LOCATION_EVENT, onChange);
    };
  }, []);
  return route;
}

export function navigate(route: string): void {
  if (route === currentRoute() + window.location.search) return;
  window.history.pushState({}, "", route);
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

export function useQueryParam(name: string): string | null {
  const read = () => new URLSearchParams(window.location.search).get(name);
  const [value, setValue] = useState(read);
  useEffect(() => {
    const onChange = () => setValue(read());
    onChange();
    window.addEventListener("popstate", onChange);
    window.addEventListener(LOCATION_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(LOCATION_EVENT, onChange);
    };
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
