import { ChartCandlestick, Circle, House, Plus, ScrollText, Settings, TrendingUp, X } from "lucide-react";
import { openNewChartDialog } from "../newChart/NewChartDialog";
import { ScrollArea, showContextMenu, type ContextMenuItem } from "../ui";
import { tabKind, type TabState } from "./tabsStore";
import type { TabsController } from "./tabsController";

const TAB_ICONS: Record<ReturnType<typeof tabKind>, typeof House> = {
  home: House,
  settings: Settings,
  logs: ScrollText,
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
  onContextMenu,
}: {
  tab: TabState;
  active: boolean;
  closable: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: () => void;
}) {
  return (
    <button
      type="button"
      className={`desktop-tab${active ? " desktop-tab--active" : ""}`}
      onClick={onActivate}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu();
      }}
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
  const { snapshot, activateTab, closeTabById, closeOtherTabs, closeTabsToRight, openHomeTab, focusOrOpenSettings } =
    controller;

  const openTabMenu = (tabId: string, index: number) => {
    const multi = snapshot.tabs.length > 1;
    const isLast = index === snapshot.tabs.length - 1;
    const items: ContextMenuItem[] = [
      {
        key: "close",
        label: "关闭标签页",
        accelerator: "CmdOrCtrl+W",
        disabled: !multi,
        onClick: () => closeTabById(tabId),
      },
      {
        key: "close-others",
        label: "关闭其他标签页",
        disabled: !multi,
        onClick: () => closeOtherTabs(tabId),
      },
      {
        key: "close-right",
        label: "关闭右侧标签页",
        disabled: isLast,
        onClick: () => closeTabsToRight(tabId),
      },
      { type: "divider" },
      {
        key: "new",
        label: "新建标签页",
        accelerator: "CmdOrCtrl+T",
        onClick: openHomeTab,
      },
    ];
    showContextMenu(items);
  };

  return (
    <div className="desktop-titlebar">
      <div className="desktop-titlebar-traffic-spacer" />
      <ScrollArea
        className="desktop-tabstrip"
        viewportClassName="desktop-tabstrip-viewport"
        contentClassName="desktop-tabstrip-content"
        orientation="horizontal"
      >
        {snapshot.tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === snapshot.activeTabId}
            closable={snapshot.tabs.length > 1}
            onActivate={() => activateTab(tab.id)}
            onClose={() => closeTabById(tab.id)}
            onContextMenu={() => openTabMenu(tab.id, index)}
          />
        ))}
        <button type="button" className="desktop-tab-new" aria-label="新建标签页" onClick={openHomeTab}>
          <Plus size={13} />
        </button>
      </ScrollArea>
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
