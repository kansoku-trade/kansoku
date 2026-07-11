import { ChartCandlestick, Circle, House, Plus, Settings, TrendingUp, X } from "lucide-react";
import { openNewChartDialog } from "../newChart/NewChartDialog";
import { tabKind, type TabState } from "./tabsStore";
import type { TabsController } from "./tabsController";

const TAB_ICONS: Record<ReturnType<typeof tabKind>, typeof House> = {
  home: House,
  settings: Settings,
  symbol: TrendingUp,
  other: Circle,
};

function TabIcon({ route }: { route: string }) {
  const Icon = TAB_ICONS[tabKind(route)];
  return (
    <span className="desktop-tab-icon-wrap">
      <Icon className="desktop-tab-icon" size={12} />
    </span>
  );
}

function Tab({
  tab,
  active,
  closable,
  onActivate,
  onClose,
}: {
  tab: TabState;
  active: boolean;
  closable: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className={`desktop-tab${active ? " desktop-tab--active" : ""}`}
      onClick={onActivate}
    >
      <TabIcon route={tab.route} />
      <span className="desktop-tab-title">{tab.title}</span>
      {closable && (
        <span
          className="desktop-tab-close"
          role="button"
          aria-label="关闭标签页"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X size={11} />
        </span>
      )}
    </button>
  );
}

export function DesktopTitlebar({ controller }: { controller: TabsController }) {
  const { snapshot, activateTab, closeTabById, openHomeTab, focusOrOpenSettings } = controller;

  return (
    <div className="desktop-titlebar">
      <div className="desktop-titlebar-traffic-spacer" />
      <div className="desktop-tabstrip">
        {snapshot.tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === snapshot.activeTabId}
            closable={snapshot.tabs.length > 1}
            onActivate={() => activateTab(tab.id)}
            onClose={() => closeTabById(tab.id)}
          />
        ))}
        <button type="button" className="desktop-tab-new" aria-label="新建标签页" onClick={openHomeTab}>
          <Plus size={13} />
        </button>
      </div>
      <div className="desktop-titlebar-actions">
        <button className="global-new-chart" type="button" onClick={openNewChartDialog}>
          <ChartCandlestick size={16} />
          新建图表
        </button>
        <button className="global-settings-link" type="button" aria-label="设置" onClick={focusOrOpenSettings}>
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
