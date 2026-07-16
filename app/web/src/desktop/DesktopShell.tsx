import { useEffect } from "react";
import { Router } from "../PageRouter";
import { GlobalNotifications } from "../GlobalNotifications";
import { CommandPalette } from "../palette/CommandPalette";
import { RestrictedBanner } from "../RestrictedBanner";
import { ContextMenuHost, ModalHost } from "../ui";
import { markSeen, setActiveSymbolProvider } from "../analystRunsStore";
import { DesktopTitlebar } from "./DesktopTitlebar";
import { LinkHoverStatus } from "./LinkHoverStatus";
import { useTabsController } from "./tabsController";
import { symbolFromRoute } from "./tabsStore";

export function DesktopShell() {
  const controller = useTabsController();
  const activeRoute = controller.activeTab.route;

  useEffect(() => {
    setActiveSymbolProvider(() => symbolFromRoute(activeRoute));
    return () => setActiveSymbolProvider(null);
  }, [activeRoute]);

  useEffect(() => {
    const symbol = symbolFromRoute(activeRoute);
    if (symbol) markSeen(symbol);
  }, [activeRoute]);

  return (
    <>
      <DesktopTitlebar controller={controller} />
      <GlobalNotifications route={controller.activeTab.route} />
      <div className="desktop-content" key={controller.activeTab.id}>
        <RestrictedBanner />
        <Router />
      </div>
      <CommandPalette onOpenRoute={controller.openTab} />
      <LinkHoverStatus />
      <ModalHost />
      <ContextMenuHost />
    </>
  );
}
