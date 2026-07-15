import { Library, MessageCircle, Settings } from "lucide-react";
import { AppSkeleton } from "./AppSkeleton";
import { DesktopShell } from "./desktop/DesktopShell";
import { Onboarding } from "./onboarding/Onboarding";
import { useCredentialsGate } from "./onboarding/useCredentialsGate";
import { Router } from "./PageRouter";
import { RestrictedBanner } from "./RestrictedBanner";
import { isDesktopRealtime } from "./portTransport";
import { routePathname, useRoute } from "./router";
import { ContextMenuHost, ModalHost } from "./ui";
import { RoutedGlobalNotifications } from "./GlobalNotifications";

function GlobalTopbar() {
  const route = useRoute();
  const pathname = routePathname(route);
  if (pathname === "/settings" || pathname === "/logs") return null;
  return (
    <div className="global-topbar">
      <a
        className={`global-settings-link${pathname === "/research" ? " active" : ""}`}
        href="/research?view=journal"
        aria-label="研究库"
        aria-current={pathname === "/research" ? "page" : undefined}
      >
        <Library size={16} />
      </a>
      <a
        className={`global-settings-link${pathname === "/chat" ? " active" : ""}`}
        href="/chat"
        aria-label="AI 对话"
        aria-current={pathname === "/chat" ? "page" : undefined}
      >
        <MessageCircle size={16} />
      </a>
      <a className="global-settings-link" href="/settings" aria-label="设置">
        <Settings size={16} />
      </a>
    </div>
  );
}

export function App() {
  const gate = useCredentialsGate();

  if (gate.status === "loading") {
    return <AppSkeleton />;
  }

  if (gate.status === "onboarding" && gate.bridge && gate.step) {
    return <Onboarding step={gate.step} status={gate.details} onRecheck={gate.recheck} onComplete={gate.completeOnboarding} />;
  }

  if (isDesktopRealtime()) {
    return <DesktopShell />;
  }

  return (
    <>
      <RestrictedBanner />
      <RoutedGlobalNotifications />
      <GlobalTopbar />
      <Router />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
