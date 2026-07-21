import { useEffect } from 'react';
import { Router } from '../../PageRouter';
import { GlobalNotifications } from '../notifications/GlobalNotifications';
import { symbolFromRoute } from '../../lib/symbol';
import { CommandPalette } from '../palette/CommandPalette';
import { RestrictedBanner } from '../edition/RestrictedBanner';
import { ContextMenuHost, ModalHost } from '../../ui';
import { clearActiveSymbol, setActiveSymbol } from '../cockpit/analystRunsStore';
import { DesktopTitlebar } from './DesktopTitlebar';
import { LinkHoverStatus } from './LinkHoverStatus';
import { useTabsController } from './tabsController';

export function DesktopShell() {
  const controller = useTabsController();
  const activeRoute = controller.activeTab.route;
  const activeSymbol = symbolFromRoute(activeRoute);

  useEffect(() => {
    setActiveSymbol(activeSymbol);
  }, [activeSymbol]);

  useEffect(() => clearActiveSymbol, []);

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
