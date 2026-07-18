import { useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  Circle,
  House,
  Library,
  MessageCircle,
  ScrollText,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react'
import { useHubStatus } from '../useHubStatus'
import type { HubStatus } from '../wsHub'
import { Dot, ScrollArea, showContextMenu, Tooltip, type ContextMenuItem } from '../ui'
import { useAnalystRunIndicator } from '../analystRunsStore'
import { symbolFromRoute } from '../lib/symbol'
import { getOpenWindowBridge, getPopoutBridge } from './desktopWindowsBridge'
import {
  getDesktopUpdaterBridge,
  isAvailableStatus,
  type UpdaterUiStatus,
} from './desktopUpdater'
import { tabKind, type TabState } from './tabsStore'
import type { TabsController } from './tabsController'
import { NewTabLauncher } from './NewTabLauncher'

const TAB_ICONS: Record<ReturnType<typeof tabKind>, typeof House> = {
  home: House,
  research: Library,
  chat: MessageCircle,
  settings: Settings,
  logs: ScrollText,
  symbol: TrendingUp,
  other: Circle,
}

function TabStatusDots({ symbol }: { symbol: string }) {
  const [running, isUnseen] = useAnalystRunIndicator(symbol)
  if (!running && !isUnseen) return null
  return (
    <>
      {running && <span className="desktop-tab-status-dot desktop-tab-status-dot--running" aria-hidden="true" />}
      {isUnseen && <span className="desktop-tab-status-dot desktop-tab-status-dot--unseen" aria-hidden="true" />}
    </>
  )
}

function TabIcon({ route }: { route: string }) {
  const Icon = TAB_ICONS[tabKind(route)]
  const symbol = symbolFromRoute(route)
  return (
    <span className="desktop-tab-icon-wrap">
      <Icon className="desktop-tab-icon" size={12} />
      {symbol && <TabStatusDots symbol={symbol} />}
    </span>
  )
}

const HUB_STATUS_META: Record<HubStatus, { label: string; tone?: 'accent' | 'ok'; pulse?: boolean }> = {
  connected: { label: '行情已连接', tone: 'ok' },
  connecting: { label: '行情连接中…', tone: 'accent' },
  reconnecting: { label: '行情已断开，重连中…', tone: 'accent', pulse: true },
}

function HubStatusDot() {
  const status = useHubStatus()
  const meta = HUB_STATUS_META[status]
  return (
    <Tooltip content={meta.label} placement="bottom">
      <span className="desktop-hub-status">
        <Dot tone={meta.tone} pulse={meta.pulse} aria-label={meta.label} role="status" />
      </span>
    </Tooltip>
  )
}

function Tab({
  tab,
  active,
  closable,
  onActivate,
  onClose,
  onContextMenu,
}: {
  tab: TabState
  active: boolean
  closable: boolean
  onActivate: () => void
  onClose: () => void
  onContextMenu: () => void
}) {
  return (
    <button
      type="button"
      className={`desktop-tab${active ? ' desktop-tab--active' : ''}`}
      onClick={onActivate}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu()
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
            event.stopPropagation()
            onClose()
          }}
        >
          <X size={11} />
        </span>
      )}
    </button>
  )
}

function useUpdaterStatus(): UpdaterUiStatus | null {
  const [status, setStatus] = useState<UpdaterUiStatus | null>(null)

  useEffect(() => {
    const bridge = getDesktopUpdaterBridge()
    if (!bridge) return
    let cancelled = false
    void bridge.getStatus().then((next) => {
      if (!cancelled) setStatus(next)
    })
    const unsubscribe = bridge.onStatus((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return status
}

export function DesktopTitlebar({
  controller,
}: {
  controller: TabsController
}) {
  const {
    snapshot,
    activateTab,
    closeTabById,
    closeOtherTabs,
    closeTabsToRight,
    openHomeTab,
    openTab,
    focusOrOpenHome,
    focusOrOpenResearch,
    focusOrOpenSettings,
    focusOrOpenChat,
  } = controller
  const updaterStatus = useUpdaterStatus()
  const showUpdateBadge = isAvailableStatus(updaterStatus)

  const openTabMenu = (tab: TabState, index: number) => {
    const tabId = tab.id
    const multi = snapshot.tabs.length > 1
    const isLast = index === snapshot.tabs.length - 1
    const symbol = symbolFromRoute(tab.route)
    const popoutBridge = symbol ? getPopoutBridge() : null
    const openWindowBridge = getOpenWindowBridge()
    const items: ContextMenuItem[] = [
      {
        key: 'close',
        label: '关闭标签页',
        accelerator: 'CmdOrCtrl+W',
        disabled: !multi,
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
        onClick: openHomeTab,
      },
      ...(openWindowBridge
        ? [
            {
              key: 'open-in-window',
              label: '在新窗口中打开',
              onClick: () => {
                void openWindowBridge.openWindow(tabId)
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
                void popoutBridge.openPopout(symbol)
              },
            },
          ]
        : []),
    ]
    showContextMenu(items)
  }

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
            onContextMenu={() => openTabMenu(tab, index)}
          />
        ))}
        <NewTabLauncher
          onOpenHome={focusOrOpenHome}
          onOpenChat={focusOrOpenChat}
          onOpenResearch={focusOrOpenResearch}
          onOpenSymbol={openTab}
        />
      </ScrollArea>
      <div className="desktop-titlebar-actions">
        {showUpdateBadge && (
          <button
            className="desktop-update-badge"
            type="button"
            aria-label="有更新可用"
            title="有更新可用"
            onClick={() => {
              void getDesktopUpdaterBridge()?.installNow()
            }}
          >
            <ArrowUpCircle size={16} />
          </button>
        )}
        <button
          className={`desktop-titlebar-settings${tabKind(controller.activeTab.route) === 'settings' ? ' desktop-titlebar-settings--active' : ''}`}
          type="button"
          aria-label="设置"
          title="设置（⌘,）"
          onClick={focusOrOpenSettings}
        >
          <span className="desktop-titlebar-action-visual">
            <Settings size={14} />
          </span>
        </button>
        <HubStatusDot />
      </div>
    </div>
  )
}
