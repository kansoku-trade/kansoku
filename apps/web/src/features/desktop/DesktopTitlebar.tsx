import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import {
  ArrowUpCircle,
  Circle,
  LayoutDashboard,
  Library,
  MessageCircle,
  PictureInPicture2,
  ScrollText,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { useHubStatus } from '../../lib/ws/useHubStatus';
import type { HubStatus } from '../../lib/ws/wsHub';
import { Dot, ScrollArea, showContextMenu, Tooltip, type ContextMenuItem } from '../../ui';
import { useAnalystRunIndicator } from '../cockpit/analystRunsStore';
import { useCapabilities } from '../edition/capabilitiesStore';
import { requestTrainerWindow } from '../training/requestTrainerWindow';
import { symbolFromRoute } from '../../lib/symbol';
import { getOpenTrainerBridge, getOpenWindowBridge, getPopoutBridge } from './desktopWindowsBridge';
import { getDesktopUpdaterBridge, isAvailableStatus, type UpdaterUiStatus } from './desktopUpdater';
import { tabKind, type TabState } from './tabsStore';
import type { TabsController } from './tabsController';
import { NewTabLauncher } from './NewTabLauncher';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const PINNED_TAB_LABEL = '盘面';

const statusPulse = stylex.keyframes({
  '50%': { opacity: 0.45, transform: 'scale(0.8)' },
});

const tabstripFade = stylex.keyframes({
  // @ts-expect-error StyleX emits the registered runtime scroll geometry custom property.
  '0%': { '--tabstrip-fade-start': '0px', '--tabstrip-fade-end': '14px' },
  // @ts-expect-error StyleX emits the registered runtime scroll geometry custom property.
  '6%': { '--tabstrip-fade-start': '14px', '--tabstrip-fade-end': '14px' },
  // @ts-expect-error StyleX emits the registered runtime scroll geometry custom property.
  '94%': { '--tabstrip-fade-start': '14px', '--tabstrip-fade-end': '14px' },
  // @ts-expect-error StyleX emits the registered runtime scroll geometry custom property.
  '100%': { '--tabstrip-fade-start': '14px', '--tabstrip-fade-end': '0px' },
});

const styles = stylex.create({
  titlebar: {
    alignItems: 'stretch',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '8px',
    height: '40px',
    left: 0,
    position: 'fixed',
    right: 0,
    top: 0,
    WebkitAppRegion: 'drag',
    zIndex: 80,
  },
  trafficSpacer: { flex: '0 0 78px' },
  tabstrip: { flex: 1, height: '100%' },
  viewport: {
    'WebkitAppRegion': 'drag',
    'scrollbarWidth': 'none',
    '::-webkit-scrollbar': { display: 'none' },
    'animationName': tabstripFade,
    'animationTimeline': 'scroll(self inline)',
    'animationTimingFunction': 'linear',
    'maskImage':
      'linear-gradient(to right, transparent 0, black var(--tabstrip-fade-start), black calc(100% - var(--tabstrip-fade-end)), transparent 100%)',
  },
  scrollbar: { display: 'none' },
  content: {
    alignItems: 'center',
    display: 'flex',
    gap: '4px',
    height: '100%',
    minWidth: '100%',
    padding: '0 4px',
    width: 'max-content',
  },
  tab: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radii.md,
    color: { 'default': colors.textMuted, ':hover': colors.textSecondary },
    cursor: 'pointer',
    display: 'inline-flex',
    flex: '0 0 auto',
    fontSize: fontSizes.sm,
    gap: '6px',
    height: '28px',
    maxWidth: '170px',
    minWidth: 0,
    padding: '0 10px',
    position: 'relative',
    transitionDuration: '120ms',
    transitionProperty: 'color, background-color',
    transitionTimingFunction: 'ease',
    WebkitAppRegion: 'no-drag',
  },
  tabActive: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 12%, transparent)`,
    color: colors.accent,
    fontWeight: 600,
  },
  tabPinned: { gap: 0, justifyContent: 'center', maxWidth: '30px', padding: 0, width: '30px' },
  tabAnchor: { alignItems: 'center', flex: '0 0 auto' },
  tabIconWrap: {
    alignItems: 'center',
    display: 'inline-flex',
    flex: '0 0 auto',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIconWrapActive: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${colors.accent} 35%, transparent)`,
    borderRadius: radii.md,
    borderStyle: 'solid',
    borderWidth: '1px',
    height: '18px',
    width: '18px',
  },
  tabIcon: { flex: '0 0 auto', opacity: 0.65 },
  tabIconActive: { color: colors.accent, opacity: 1 },
  statusDot: {
    borderRadius: radii.full,
    height: '5px',
    pointerEvents: 'none',
    position: 'absolute',
    width: '5px',
  },
  statusRunning: {
    'animationDuration': '1.6s',
    'animationIterationCount': 'infinite',
    'animationName': statusPulse,
    'animationTimingFunction': 'ease-in-out',
    'backgroundColor': colors.accent,
    'bottom': '-2px',
    'boxShadow': `0 0 4px 1px ${colors.accent}`,
    'right': '-2px',
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  },
  statusUnseen: { backgroundColor: colors.textSecondary, right: '-2px', top: '-2px' },
  tabTitle: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tabClose: {
    'alignItems': 'center',
    'borderRadius': radii.default,
    'color': colors.textMuted,
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '15px',
    'justifyContent': 'center',
    'marginRight': '-2px',
    'opacity': 0,
    'transitionDuration': '120ms',
    'transitionProperty': 'opacity, color, background-color',
    'transitionTimingFunction': 'ease',
    'width': '15px',
    ':hover': { backgroundColor: colors.backgroundHover, color: colors.textPrimary, opacity: 1 },
  },
  tabCloseActive: { opacity: 0.6 },
  titlebarActions: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: 0,
    paddingRight: '4px',
    WebkitAppRegion: 'no-drag',
  },
  updateBadge: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'border': 'none',
    'borderRadius': radii.default,
    'color': colors.accent,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '26px',
    'justifyContent': 'center',
    'padding': 0,
    'width': '26px',
    ':hover': {
      backgroundColor: `color-mix(in srgb, ${colors.accent} 12%, transparent)`,
      color: colors.textPrimary,
    },
  },
  settings: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'border': 'none',
    'color': { 'default': colors.textMuted, ':hover': colors.textPrimary },
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '40px',
    'justifyContent': 'center',
    'padding': 0,
    'transitionDuration': '120ms',
    'transitionProperty': 'color, scale',
    'transitionTimingFunction': 'ease-out',
    'width': '30px',
    'WebkitAppRegion': 'no-drag',
    ':active': { scale: 0.96 },
  },
  settingsActive: { color: colors.accent },
  actionVisual: {
    'alignItems': 'center',
    'borderRadius': radii.default,
    'display': 'inline-flex',
    'height': '28px',
    'justifyContent': 'center',
    'transitionDuration': '120ms',
    'transitionProperty': 'background-color',
    'transitionTimingFunction': 'ease-out',
    'width': '28px',
    ':hover': { backgroundColor: colors.backgroundHover },
  },
  actionVisualActive: { backgroundColor: `color-mix(in srgb, ${colors.accent} 12%, transparent)` },
  hubStatus: {
    alignItems: 'center',
    display: 'inline-flex',
    height: '26px',
    justifyContent: 'center',
    width: '26px',
    WebkitAppRegion: 'no-drag',
  },
});

function classNames(
  legacy: string,
  ...styleValues: Array<stylex.StyleXStyles | undefined>
): string {
  return clsx(legacy, stylex.props(...styleValues).className);
}

const TAB_ICONS: Record<ReturnType<typeof tabKind>, typeof LayoutDashboard> = {
  home: LayoutDashboard,
  research: Library,
  chat: MessageCircle,
  settings: Settings,
  logs: ScrollText,
  symbol: TrendingUp,
  other: Circle,
};

function TabStatusDots({ symbol }: { symbol: string }) {
  const [running, isUnseen] = useAnalystRunIndicator(symbol);
  if (!running && !isUnseen) return null;
  return (
    <>
      {running && (
        <span
          className={classNames(
            'desktop-tab-status-dot desktop-tab-status-dot--running',
            styles.statusDot,
            styles.statusRunning,
          )}
          aria-hidden="true"
        />
      )}
      {isUnseen && (
        <span
          className={classNames(
            'desktop-tab-status-dot desktop-tab-status-dot--unseen',
            styles.statusDot,
            styles.statusUnseen,
          )}
          aria-hidden="true"
        />
      )}
    </>
  );
}

function TabIcon({ route, active }: { route: string; active: boolean }) {
  const Icon = TAB_ICONS[tabKind(route)];
  const symbol = symbolFromRoute(route);
  return (
    <span
      className={classNames(
        'desktop-tab-icon-wrap',
        styles.tabIconWrap,
        active ? styles.tabIconWrapActive : undefined,
      )}
    >
      <Icon
        className={classNames(
          'desktop-tab-icon',
          styles.tabIcon,
          active ? styles.tabIconActive : undefined,
        )}
        size={12}
      />
      {symbol && <TabStatusDots symbol={symbol} />}
    </span>
  );
}

const HUB_STATUS_META: Record<
  HubStatus,
  { label: string; tone?: 'accent' | 'ok'; pulse?: boolean }
> = {
  connected: { label: '行情已连接', tone: 'ok' },
  connecting: { label: '行情连接中…', tone: 'accent' },
  reconnecting: { label: '行情已断开，重连中…', tone: 'accent', pulse: true },
};

function HubStatusDot() {
  const status = useHubStatus();
  const meta = HUB_STATUS_META[status];
  return (
    <Tooltip content={meta.label} placement="bottom">
      <span className={classNames('desktop-hub-status', styles.hubStatus)}>
        <Dot tone={meta.tone} pulse={meta.pulse} aria-label={meta.label} role="status" />
      </span>
    </Tooltip>
  );
}

function PopoutTitlebarButton({ symbol }: { symbol: string }) {
  const bridge = getPopoutBridge();
  if (!bridge) return null;

  return (
    <button
      className={classNames('desktop-titlebar-settings', styles.settings)}
      type="button"
      aria-label="弹出盯盘小窗"
      title="弹出盯盘小窗"
      onClick={() => {
        void bridge.openPopout(symbol);
      }}
    >
      <span className={classNames('desktop-titlebar-action-visual', styles.actionVisual)}>
        <PictureInPicture2 size={14} />
      </span>
    </button>
  );
}

function Tab({
  tab,
  active,
  pinned,
  onActivate,
  onClose,
  onContextMenu,
}: {
  tab: TabState;
  active: boolean;
  pinned: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: () => void;
}) {
  const button = (
    <button
      type="button"
      className={classNames(
        `desktop-tab${active ? ' desktop-tab--active' : ''}${pinned ? ' desktop-tab--pinned' : ''}`,
        styles.tab,
        active ? styles.tabActive : undefined,
        pinned ? styles.tabPinned : undefined,
      )}
      aria-label={pinned ? PINNED_TAB_LABEL : undefined}
      onClick={onActivate}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu();
      }}
    >
      <TabIcon route={pinned ? '/' : tab.route} active={active} />
      {!pinned && (
        <>
          <span className={classNames('desktop-tab-title', styles.tabTitle)}>{tab.title}</span>
          <span
            className={classNames(
              'desktop-tab-close',
              styles.tabClose,
              active ? styles.tabCloseActive : undefined,
            )}
            role="button"
            aria-label="关闭标签页"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X size={11} />
          </span>
        </>
      )}
    </button>
  );

  if (!pinned) return button;
  return (
    <Tooltip
      content={PINNED_TAB_LABEL}
      placement="bottom"
      className={classNames('desktop-tab-anchor', styles.tabAnchor)}
    >
      {button}
    </Tooltip>
  );
}

function useUpdaterStatus(): UpdaterUiStatus | null {
  const [status, setStatus] = useState<UpdaterUiStatus | null>(null);

  useEffect(() => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge) return;
    let cancelled = false;
    void bridge.getStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    const unsubscribe = bridge.onStatus((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return status;
}

export function DesktopTitlebar({ controller }: { controller: TabsController }) {
  const {
    snapshot,
    activateTab,
    closeTabById,
    closeOtherTabs,
    closeTabsToRight,
    newTabLauncherOpen,
    setNewTabLauncherOpen,
    openTab,
    focusOrOpenHome,
    focusOrOpenResearch,
    focusOrOpenSettings,
    focusOrOpenChat,
  } = controller;
  const updaterStatus = useUpdaterStatus();
  const showUpdateBadge = isAvailableStatus(updaterStatus);
  const activeSymbol = symbolFromRoute(controller.activeTab.route);
  const { pro, licensed } = useCapabilities();
  const trainerBridge = getOpenTrainerBridge();
  const openTrainer =
    trainerBridge && pro ? () => requestTrainerWindow(trainerBridge, { pro, licensed }) : null;

  const openTabMenu = (tab: TabState, index: number) => {
    const tabId = tab.id;
    const pinned = index === 0;
    const multi = snapshot.tabs.length > 1;
    const isLast = index === snapshot.tabs.length - 1;
    const symbol = symbolFromRoute(tab.route);
    const popoutBridge = symbol ? getPopoutBridge() : null;
    const openWindowBridge = getOpenWindowBridge();
    const items: ContextMenuItem[] = [
      {
        key: 'close',
        label: '关闭标签页',
        accelerator: 'CmdOrCtrl+W',
        disabled: pinned,
        onClick: () => closeTabById(tabId),
      },
      {
        key: 'close-others',
        label: '关闭其他标签页',
        disabled: !multi,
        onClick: () => closeOtherTabs(tabId),
      },
      {
        key: 'close-right',
        label: '关闭右侧标签页',
        disabled: isLast,
        onClick: () => closeTabsToRight(tabId),
      },
      { type: 'divider' },
      {
        key: 'new',
        label: '新建标签页',
        accelerator: 'CmdOrCtrl+T',
        onClick: () => setNewTabLauncherOpen(true),
      },
      ...(openWindowBridge
        ? [
            {
              key: 'open-in-window',
              label: '在新窗口中打开',
              onClick: () => {
                void openWindowBridge.openWindow(tabId);
              },
            },
          ]
        : []),
      ...(popoutBridge && symbol
        ? [
            { type: 'divider' as const },
            {
              key: 'popout',
              label: '弹出盯盘小窗',
              onClick: () => {
                void popoutBridge.openPopout(symbol);
              },
            },
          ]
        : []),
    ];
    showContextMenu(items);
  };

  return (
    <div className={classNames('desktop-titlebar', styles.titlebar)}>
      <div className={classNames('desktop-titlebar-traffic-spacer', styles.trafficSpacer)} />
      <ScrollArea
        className={classNames('desktop-tabstrip', styles.tabstrip)}
        viewportClassName={classNames('desktop-tabstrip-viewport', styles.viewport)}
        contentClassName={classNames('desktop-tabstrip-content', styles.content)}
        scrollbarClassName={stylex.props(styles.scrollbar).className}
        orientation="horizontal"
      >
        {snapshot.tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === snapshot.activeTabId}
            pinned={index === 0}
            onActivate={() => activateTab(tab.id)}
            onClose={() => closeTabById(tab.id)}
            onContextMenu={() => openTabMenu(tab, index)}
          />
        ))}
        <NewTabLauncher
          open={newTabLauncherOpen}
          onOpenChange={setNewTabLauncherOpen}
          onOpenHome={focusOrOpenHome}
          onOpenChat={focusOrOpenChat}
          onOpenResearch={focusOrOpenResearch}
          onOpenSymbol={openTab}
          onOpenTrainer={openTrainer}
        />
      </ScrollArea>
      <div className={classNames('desktop-titlebar-actions', styles.titlebarActions)}>
        {showUpdateBadge && (
          <button
            className={classNames('desktop-update-badge', styles.updateBadge)}
            type="button"
            aria-label="有更新可用"
            title="有更新可用"
            onClick={() => {
              void getDesktopUpdaterBridge()?.installNow();
            }}
          >
            <ArrowUpCircle size={16} />
          </button>
        )}
        {activeSymbol && <PopoutTitlebarButton symbol={activeSymbol} />}
        <button
          className={classNames(
            `desktop-titlebar-settings${tabKind(controller.activeTab.route) === 'settings' ? ' desktop-titlebar-settings--active' : ''}`,
            styles.settings,
            tabKind(controller.activeTab.route) === 'settings' ? styles.settingsActive : undefined,
          )}
          type="button"
          aria-label="设置"
          title="设置（⌘,）"
          onClick={focusOrOpenSettings}
        >
          <span
            className={classNames(
              'desktop-titlebar-action-visual',
              styles.actionVisual,
              tabKind(controller.activeTab.route) === 'settings'
                ? styles.actionVisualActive
                : undefined,
            )}
          >
            <Settings size={14} />
          </span>
        </button>
        <HubStatusDot />
      </div>
    </div>
  );
}
