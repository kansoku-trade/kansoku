import * as stylex from '@stylexjs/stylex';
import { ChevronDown, Ellipsis, Wrench } from 'lucide-react';
import {
  Component,
  Fragment,
  lazy,
  Suspense,
  type ComponentType,
  type PropsWithChildren,
} from 'react';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { showContextMenu, Switch, type ContextMenuItem } from '../../ui';
import { getDevDockState, setDevDockPinned, updateDevDock, useDevDock } from './devDockStore';
import {
  DEV_DOCK_ITEMS,
  isItemPinned,
  selectBarLayout,
  type DevDockItem,
  type DevDockReadoutItem,
  type DevDockToggleItem,
} from './items';

export const BAR_HEIGHT = 28;

const styles = stylex.create({
  bar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    height: `${BAR_HEIGHT}px`,
    paddingInline: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSurface,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  center: { display: 'flex', flex: 1, alignItems: 'center', minWidth: 0 },
  divider: { flexShrink: 0, width: '1px', height: '12px', backgroundColor: colors.border },
  iconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    color: { 'default': colors.textMuted, ':hover': colors.textPrimary },
    backgroundColor: { 'default': 'transparent', ':hover': colors.backgroundHover },
    cursor: 'pointer',
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  pill: {
    position: 'fixed',
    zIndex: 1100,
    bottom: 0,
    left: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '18px',
    paddingInline: '8px',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    fontSize: fontSizes.xs,
    color: colors.backgroundCanvas,
    backgroundColor: colors.textPrimary,
    opacity: { 'default': 1, ':hover': 0.85 },
    cursor: 'pointer',
  },
});

class WidgetBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const componentCache = new Map<string, ComponentType>();

function WidgetSlot({ item }: { item: DevDockReadoutItem }) {
  let Widget = componentCache.get(item.id);
  if (!Widget) {
    Widget = lazy(item.load);
    componentCache.set(item.id, Widget);
  }
  return (
    <WidgetBoundary>
      <Suspense fallback={null}>
        <Widget />
      </Suspense>
    </WidgetBoundary>
  );
}

function PinnedToggle({ item }: { item: DevDockToggleItem }) {
  const checked = useDevDock(item.getChecked);
  return (
    <label {...stylex.props(styles.toggle)}>
      <Switch checked={checked} onCheckedChange={item.onToggle} ariaLabel={item.label} />
      <span>{item.label}</span>
    </label>
  );
}

function overflowMenuItems(): ContextMenuItem[] {
  const state = getDevDockState();
  const toggles = DEV_DOCK_ITEMS.filter(
    (item): item is DevDockToggleItem => item.type === 'toggle',
  );
  return [
    ...toggles.map((item) => ({
      key: item.id,
      label: item.label,
      checked: item.getChecked(state),
      onClick: () => item.onToggle(!item.getChecked(getDevDockState())),
    })),
    { type: 'divider' },
    {
      key: 'pin',
      label: '钉到底栏',
      submenu: DEV_DOCK_ITEMS.map((item: DevDockItem) => ({
        key: `pin:${item.id}`,
        label: item.label,
        checked: isItemPinned(item, state.pinOverrides),
        onClick: () => setDevDockPinned(item.id, !isItemPinned(item)),
      })),
    },
  ];
}

export function DevDockBar() {
  const expanded = useDevDock((s) => s.expanded);
  const pinOverrides = useDevDock((s) => s.pinOverrides);

  if (!expanded) {
    return (
      <button
        type="button"
        {...stylex.props(styles.pill)}
        title="打开 DevDock"
        onClick={() => updateDevDock({ expanded: true })}
      >
        <Wrench size={10} />
        <span>dev</span>
      </button>
    );
  }

  const { center, right } = selectBarLayout(DEV_DOCK_ITEMS, pinOverrides);

  return (
    <div {...stylex.props(styles.bar)}>
      <button
        type="button"
        {...stylex.props(styles.iconButton)}
        title="收起 DevDock"
        onClick={() => updateDevDock({ expanded: false })}
      >
        <ChevronDown size={12} />
      </button>
      {center ? (
        <div {...stylex.props(styles.center)}>
          <WidgetSlot item={center} />
        </div>
      ) : (
        <span style={{ flex: 1 }} />
      )}
      {right.map((item, index) => {
        const previous = right[index - 1];
        const needsDivider = index > 0 && item.type === 'readout' && previous?.type === 'readout';
        return (
          <Fragment key={item.id}>
            {needsDivider && <span {...stylex.props(styles.divider)} />}
            {item.type === 'readout' ? <WidgetSlot item={item} /> : <PinnedToggle item={item} />}
          </Fragment>
        );
      })}
      {right.length > 0 && <span {...stylex.props(styles.divider)} />}
      <button
        type="button"
        {...stylex.props(styles.iconButton)}
        title="更多工具"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          showContextMenu(overflowMenuItems(), { x: rect.right, y: rect.top });
        }}
      >
        <Ellipsis size={13} />
      </button>
    </div>
  );
}
