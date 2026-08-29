import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  panel: {
    minHeight: 0,
  },
  bar: {
    backgroundColor: colors.backgroundSurface,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '4px',
    marginBottom: '12px',
    overflowX: 'auto',
    paddingTop: '8px',
    position: 'sticky',
    scrollbarWidth: 'none',
    top: '-16px',
    zIndex: 5,
  },
  tab: {
    'backgroundColor': 'transparent',
    'border': 0,
    'borderBottom': '2px solid transparent',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'flex': '0 0 auto',
    'fontSize': fontSizes.base,
    'marginBottom': '-1px',
    'padding': '6px 10px',
    'whiteSpace': 'nowrap',
    ':hover': {
      color: colors.textPrimary,
    },
    "[aria-selected='true']": {
      borderBottomColor: colors.accent,
      color: colors.textPrimary,
    },
  },
});

export interface SidebarTab {
  key: string;
  label: ReactNode;
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
    <div className={`sidebar-tabs ${stylex.props(styles.root).className}`}>
      <div className={`sidebar-tab-bar ${stylex.props(styles.bar).className}`} role="tablist">
        {visible.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === activeTab?.key}
            className={stylex.props(styles.tab).className}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={`sidebar-tab-panel ${stylex.props(styles.panel).className}`}>
        {activeTab?.content}
      </div>
    </div>
  );
}
