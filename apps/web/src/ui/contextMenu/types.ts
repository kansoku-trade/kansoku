import type { ReactNode } from 'react';

/**
 * Command-layer menu item. Platform adapters map this to Base UI (web) or
 * Electron Menu (desktop). Keep labels as plain strings so native menus work.
 */
export type ContextMenuCommandItem = {
  key?: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** When set, item is checkbox-like. Prefer radioGroup for exclusive options. */
  checked?: boolean;
  /** Electron radio group id; implies radio item when present. */
  radioGroup?: string;
  /**
   * Accelerator in Electron form, e.g. `CmdOrCtrl+W`, `Shift+CmdOrCtrl+]`.
   * Desktop: bound on native MenuItem. Web: shown as a hint (not yet wired as
   * a global keybinding — that stays with the app menu / command layer).
   */
  accelerator?: string;
  /**
   * Optional pre-formatted shortcut label for Web (e.g. `⌘W`). When omitted,
   * Web derives a display string from `accelerator`.
   */
  shortcut?: string;
  /** Default true. Filtered out during prepare. */
  visible?: boolean;
  /** Nested items; when present, this row is a submenu trigger (onClick ignored). */
  submenu?: ContextMenuItem[];
};

export type ContextMenuDivider = {
  type: 'divider';
  key?: string;
  visible?: boolean;
};

export type ContextMenuItem = ContextMenuCommandItem | ContextMenuDivider;

export type ContextMenuPoint = {
  x: number;
  y: number;
};

/** Wire-safe menu payload (no functions / React nodes). */
export type SerializableContextMenuItem =
  | {
      type: 'item';
      key: string;
      label: string;
      enabled: boolean;
      checked?: boolean;
      radioGroup?: string;
      accelerator?: string;
      shortcut?: string;
      danger?: boolean;
    }
  | {
      type: 'divider';
      key: string;
    }
  | {
      type: 'submenu';
      key: string;
      label: string;
      enabled: boolean;
      items: SerializableContextMenuItem[];
    };

export type ElectronContextMenuPopupRequest = {
  items: SerializableContextMenuItem[];
  x: number;
  y: number;
};

export type ElectronContextMenuPopupResult = {
  selectedKey: string | null;
};

export type ContextMenuAdapter = {
  readonly kind: 'web' | 'electron';
  show(items: ContextMenuItem[], point: ContextMenuPoint): void | Promise<void>;
  close(): void;
};

export function isContextMenuDivider(item: ContextMenuItem): item is ContextMenuDivider {
  return 'type' in item && item.type === 'divider';
}

export function isContextMenuSubmenu(
  item: ContextMenuItem,
): item is ContextMenuCommandItem & { submenu: ContextMenuItem[] } {
  return !isContextMenuDivider(item) && Array.isArray(item.submenu) && item.submenu.length >= 0;
}

export function hasContextMenuSubmenu(
  item: ContextMenuItem,
): item is ContextMenuCommandItem & { submenu: ContextMenuItem[] } {
  return !isContextMenuDivider(item) && Array.isArray(item.submenu);
}
