import { ChartCandlestick, Settings } from "lucide-react";
import { AppSkeleton } from "./AppSkeleton";
import { DesktopShell } from "./desktop/DesktopShell";
import { openNewChartDialog } from "./newChart/NewChartDialog";
import { Onboarding } from "./onboarding/Onboarding";
import { useCredentialsGate } from "./onboarding/useCredentialsGate";
import { Router } from "./PageRouter";
import { RestrictedBanner } from "./RestrictedBanner";
import { isDesktopRealtime } from "./portTransport";
import { useRoute } from "./router";
import { ModalHost } from "./ui";

function GlobalTopbar() {
  const route = useRoute();
  if (route === "/settings") return null;
  return (
    <div className="global-topbar">
      <button className="global-new-chart" onClick={openNewChartDialog} aria-label="新建图表">
        <ChartCandlestick size={16} />
        新建图表
      </button>
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

  if (gate.status === "onboarding" && gate.bridge) {
    return <Onboarding bridge={gate.bridge} onDone={gate.recheck} onSkip={gate.skip} />;
  }

  if (isDesktopRealtime()) {
    return <DesktopShell />;
  }

  return (
    <>
      <RestrictedBanner />
      <GlobalTopbar />
      <Router />
      <ModalHost />
    </>
  );
}
