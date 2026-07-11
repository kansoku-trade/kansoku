import { Router } from "../PageRouter";
import { RestrictedBanner } from "../RestrictedBanner";
import { ModalHost } from "../ui";
import { DesktopTitlebar } from "./DesktopTitlebar";
import { useTabsController } from "./tabsController";

export function DesktopShell() {
  const controller = useTabsController();

  return (
    <>
      <DesktopTitlebar controller={controller} />
      <div className="desktop-content" key={controller.activeTab.id}>
        <RestrictedBanner />
        <Router />
      </div>
      <ModalHost />
    </>
  );
}
