import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { AppSkeleton } from './AppSkeleton';
import { getDesktopDeepLinkBridge } from './features/desktop/desktopDeepLinkBridge';
import { DesktopShell } from './features/desktop/DesktopShell';
import { Onboarding } from './features/onboarding/Onboarding';
import { useCredentialsGate } from './features/onboarding/useCredentialsGate';
import { CommandPalette } from './features/palette/CommandPalette';
import { RestrictedBanner } from './features/edition/RestrictedBanner';
import { isDesktopRealtime } from './lib/portTransport';
import { getBrowserRouter, matchPopoutSymbolRoute, navigate, routePathname, useRoute } from './lib/router';
import { ContextMenuHost, ModalHost } from './ui';
import { RoutedGlobalNotifications } from './features/notifications/GlobalNotifications';

const browserRouter = getBrowserRouter();

export function App() {
  const gate = useCredentialsGate();
  const route = useRoute();
  const isPopout = matchPopoutSymbolRoute(routePathname(route)) !== null;

  useEffect(() => {
    const bridge = getDesktopDeepLinkBridge();
    if (!bridge) return;
    return bridge.onNavigate(({ path, search }) => navigate(`${path}${search}`));
  }, []);

  if (gate.status === 'loading') {
    return <AppSkeleton />;
  }

  if (gate.status === 'onboarding' && gate.bridge && gate.step) {
    return (
      <Onboarding
        step={gate.step}
        status={gate.details}
        onRecheck={gate.recheck}
        onComplete={gate.completeOnboarding}
      />
    );
  }

  if (isPopout) {
    return <RouterProvider router={browserRouter} />;
  }

  if (isDesktopRealtime()) {
    return <DesktopShell />;
  }

  return (
    <>
      <RestrictedBanner />
      <RoutedGlobalNotifications />
      <RouterProvider router={browserRouter} />
      <CommandPalette onOpenRoute={navigate} />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
