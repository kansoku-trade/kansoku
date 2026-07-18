import { AppSkeleton } from "./AppSkeleton";
import { DesktopShell } from "./desktop/DesktopShell";
import { Onboarding } from "./onboarding/Onboarding";
import { useCredentialsGate } from "./onboarding/useCredentialsGate";
import { CommandPalette } from "./palette/CommandPalette";
import { Router } from "./PageRouter";
import { RestrictedBanner } from "./RestrictedBanner";
import { isDesktopRealtime } from "./portTransport";
import { matchPopoutSymbolRoute, navigate, routePathname, useRoute } from "./router";
import { ContextMenuHost, ModalHost } from "./ui";
import { RoutedGlobalNotifications } from "./GlobalNotifications";

export function App() {
  const gate = useCredentialsGate();
  const route = useRoute();
  const isPopout = matchPopoutSymbolRoute(routePathname(route)) !== null;

  if (gate.status === "loading") {
    return <AppSkeleton />;
  }

  if (gate.status === "onboarding" && gate.bridge && gate.step) {
    return <Onboarding step={gate.step} status={gate.details} onRecheck={gate.recheck} onComplete={gate.completeOnboarding} />;
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
