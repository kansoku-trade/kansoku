import type { ReactNode } from "react";

export interface SidebarTab {
  key: string;
  label: string;
  hidden?: boolean;
  content: ReactNode;
}

interface SidebarTabsProps {
  tabs: SidebarTab[];
  active: string;
  onChange: (key: string) => void;
}

export function SidebarTabs({ tabs, active, onChange }: SidebarTabsProps) {
  const visible = tabs.filter((t) => !t.hidden);
  const activeTab = visible.find((t) => t.key === active) ?? visible[0];

  return (
    <div className="sidebar-tabs">
      <div className="sidebar-tab-bar" role="tablist">
        {visible.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === activeTab?.key}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sidebar-tab-panel">{activeTab?.content}</div>
    </div>
  );
}
