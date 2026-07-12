import { Settings } from "lucide-react";
import { AppSkeleton } from "./AppSkeleton";
import { DesktopShell } from "./desktop/DesktopShell";
import { Onboarding } from "./onboarding/Onboarding";
import { CommandPalette } from "./palette/CommandPalette";
import { useCredentialsGate } from "./onboarding/useCredentialsGate";
import { Router } from "./PageRouter";
import { RestrictedBanner } from "./RestrictedBanner";
import { isDesktopRealtime } from "./portTransport";
import { useRoute } from "./router";
import { ContextMenuHost, ModalHost } from "./ui";

function GlobalTopbar() {
  const route = useRoute();
  if (route === "/settings") return null;
  return (
    <div className="global-topbar">
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
      <GlobalTopbar />
      <Router />
      <CommandPalette />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
