import { AppSkeleton } from './AppSkeleton';
import { DesktopShell } from './features/desktop/DesktopShell';
import { Onboarding } from './features/onboarding/Onboarding';
import { useCredentialsGate } from './features/onboarding/useCredentialsGate';
import { CommandPalette } from './features/palette/CommandPalette';
import { Router } from './PageRouter';
import { RestrictedBanner } from './features/edition/RestrictedBanner';
import { isDesktopRealtime } from './lib/portTransport';
import { matchPopoutSymbolRoute, navigate, routePathname, useRoute } from './router';
import { ContextMenuHost, ModalHost } from './ui';
import { RoutedGlobalNotifications } from './features/notifications/GlobalNotifications';

export function App() {
  const gate = useCredentialsGate();
  const route = useRoute();
  const isPopout = matchPopoutSymbolRoute(routePathname(route)) !== null;

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
    return <Router />;
  }

  if (isDesktopRealtime()) {
    return <DesktopShell />;
  }

  return (
    <>
      <RestrictedBanner />
      <RoutedGlobalNotifications />
      <Router />
      <CommandPalette onOpenRoute={navigate} />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
