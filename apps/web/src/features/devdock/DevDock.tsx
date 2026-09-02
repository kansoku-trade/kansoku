import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { DevDockBar } from './DevDockBar';
import { useDevDock } from './devDockStore';

const Mesurer = lazy(() => import('mesurer').then((module) => ({ default: module.Mesurer })));

// Mesurer injects its stylesheet into the portal target; a shadow root keeps
// that sheet and our global CSS from reaching each other.
function MesurerPortal() {
  const [portalTarget, setPortalTarget] = useState<ShadowRoot | null>(null);
  const setPortalHost = useCallback((host: HTMLDivElement | null) => {
    if (host) setPortalTarget(host.shadowRoot ?? host.attachShadow({ mode: 'open' }));
  }, []);
  return (
    <>
      <div ref={setPortalHost} />
      {portalTarget && (
        <Suspense fallback={null}>
          <Mesurer portalTarget={portalTarget} />
        </Suspense>
      )}
    </>
  );
}

let reactScanTouched = false;

function ReactScanController() {
  const enabled = useDevDock((s) => s.reactScan);
  useEffect(() => {
    if (!enabled && !reactScanTouched) return;
    reactScanTouched = true;
    let cancelled = false;
    void import('react-scan').then(({ scan }) => {
      if (!cancelled) scan({ enabled, showToolbar: enabled });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return null;
}

export function DevDock() {
  const mesurer = useDevDock((s) => s.mesurer);
  return (
    <>
      {mesurer && <MesurerPortal />}
      <ReactScanController />
      <DevDockBar />
    </>
  );
}
