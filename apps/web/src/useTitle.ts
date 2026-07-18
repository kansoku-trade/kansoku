import { useEffect } from "react";

const BRAND = "Kansoku";

let activeTitleSink: ((title: string) => void) | null = null;

// Desktop tab mode points this at the active tab's title setter before
// mounting that tab's page tree, mirroring __setActiveRouteStore in
// router.ts. Only TabsProvider (web/src/desktop) calls this.
export function __setActiveTitleSink(sink: ((title: string) => void) | null): void {
  activeTitleSink = sink;
}

export function useTitle(pageName: string | null | undefined): void {
  useEffect(() => {
    if (pageName === undefined) return;
    document.title = pageName ? `${pageName} · ${BRAND}` : BRAND;
    activeTitleSink?.(pageName || BRAND);
  }, [pageName]);
}
