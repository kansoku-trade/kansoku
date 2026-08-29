import { useEffect, useSyncExternalStore } from 'react';
import { ContextMenu } from '@base-ui/react/context-menu';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';
import { resolveShortcutDisplay } from './accelerator';
import { hasContextMenuSubmenu, isContextMenuDivider, type ContextMenuItem } from './types';
import {
  closeWebContextMenu,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateLastPointer,
} from './webHost';

const styles = stylex.create({
  positioner: {
    zIndex: 300,
    outline: 'none',
  },
  popup: {
    minWidth: '168px',
    padding: '4px',
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    outline: 'none',
  },
  item: {
    'display': 'flex',
    'alignItems': 'center',
    'gap': '8px',
    'padding': '5px 8px',
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'userSelect': 'none',
    'outline': 'none',
    '[data-highlighted]': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
    '[data-disabled]': {
      color: colors.textMuted,
      cursor: 'default',
    },
  },
  danger: {
    'color': colors.down,
    '[data-highlighted]': {
      color: colors.backgroundCanvas,
      backgroundColor: colors.down,
    },
  },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    opacity: 0.8,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  shortcut: {
    marginLeft: '16px',
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
  },
  submenuTrigger: {
    width: '100%',
  },
  submenuChevron: {
    marginLeft: '12px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1,
  },
  separator: {
    height: '1px',
    margin: '4px 2px',
    backgroundColor: colors.border,
  },
});

export function ContextMenuHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const handler = (event: PointerEvent | MouseEvent) => updateLastPointer(event);
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('contextmenu', handler, true);
    return () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('contextmenu', handler, true);
    };
  }, []);

  if (!state.open && state.items.length === 0) return null;

  return (
    <ContextMenu.Root
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeWebContextMenu();
      }}
    >
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          className={`ui-context-menu-positioner ${stylex.props(styles.positioner).className}`}
          anchor={state.anchor ?? undefined}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <ContextMenu.Popup
            className={`ui-context-menu-popup ${stylex.props(styles.popup).className}`}
          >
            {state.items.map((item, i) => (
              <MenuNode key={itemKey(item, i)} item={item} index={i} />
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MenuNode({ item, index: _index }: { item: ContextMenuItem; index: number }) {
  if (item.visible === false) return null;

  if (isContextMenuDivider(item)) {
    return (
      <ContextMenu.Separator
        className={`ui-context-menu-separator ${stylex.props(styles.separator).className}`}
      />
    );
  }

  if (hasContextMenuSubmenu(item)) {
    return (
      <ContextMenu.SubmenuRoot>
        <ContextMenu.SubmenuTrigger
          className={`ui-context-menu-item ui-context-menu-submenu-trigger ${stylex.props(styles.item, styles.submenuTrigger).className}`}
          disabled={item.disabled}
        >
          {item.icon ? (
            <span className={`ui-context-menu-item-icon ${stylex.props(styles.icon).className}`}>
              {item.icon}
            </span>
          ) : null}
          <span className={`ui-context-menu-item-label ${stylex.props(styles.label).className}`}>
            {item.label}
          </span>
          <span
            className={`ui-context-menu-submenu-chevron ${stylex.props(styles.submenuChevron).className}`}
            aria-hidden
          >
            ›
          </span>
        </ContextMenu.SubmenuTrigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner
            className={`ui-context-menu-positioner ${stylex.props(styles.positioner).className}`}
            side="right"
            align="start"
            sideOffset={4}
          >
            <ContextMenu.Popup
              className={`ui-context-menu-popup ${stylex.props(styles.popup).className}`}
            >
              {item.submenu.map((child, i) => (
                <MenuNode key={itemKey(child, i)} item={child} index={i} />
              ))}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.SubmenuRoot>
    );
  }

  const shortcut = resolveShortcutDisplay(item);
  return (
    <ContextMenu.Item
      className={`ui-context-menu-item${item.danger ? ' ui-context-menu-item--danger' : ''} ${stylex.props(styles.item, item.danger && styles.danger).className}`}
      disabled={item.disabled}
      onClick={() => item.onClick?.()}
    >
      {item.icon ? (
        <span className={`ui-context-menu-item-icon ${stylex.props(styles.icon).className}`}>
          {item.icon}
        </span>
      ) : null}
      <span className={`ui-context-menu-item-label ${stylex.props(styles.label).className}`}>
        {item.label}
      </span>
      {shortcut ? (
        <span
          className={`ui-context-menu-item-shortcut ${stylex.props(styles.shortcut).className}`}
        >
          {shortcut}
        </span>
      ) : null}
    </ContextMenu.Item>
  );
}

function itemKey(item: ContextMenuItem, index: number): string {
  if (item.key) return item.key;
  if (isContextMenuDivider(item)) return `divider-${index}`;
  return `item-${index}`;
}
