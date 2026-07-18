import { resolveShortcutDisplay } from "./accelerator";
import {
  hasContextMenuSubmenu,
  isContextMenuDivider,
  type ContextMenuItem,
  type SerializableContextMenuItem,
} from "./types";

export type PreparedContextMenu = {
  serializable: SerializableContextMenuItem[];
  actions: Map<string, () => void>;
};

/**
 * Normalize command items for transport / native menus:
 * - drop invisible rows
 * - assign stable keys
 * - strip callbacks into an actions map (keyed by item key)
 * - nest submenus
 * - collapse leading / trailing / duplicate dividers
 * - surface accelerator + display shortcut for both platforms
 */
export function prepareContextMenuItems(items: ContextMenuItem[]): PreparedContextMenu {
  const actions = new Map<string, () => void>();
  const serializable = normalizeDividers(prepareList(items, "", actions));
  return { serializable, actions };
}

function prepareList(
  items: ContextMenuItem[],
  keyPrefix: string,
  actions: Map<string, () => void>,
): SerializableContextMenuItem[] {
  const out: SerializableContextMenuItem[] = [];

  items.forEach((item, index) => {
    if (item.visible === false) return;

    if (isContextMenuDivider(item)) {
      out.push({ type: "divider", key: item.key ?? `${keyPrefix}divider-${index}` });
      return;
    }

    if (hasContextMenuSubmenu(item)) {
      const key = item.key ?? `${keyPrefix}menu-${index}`;
      const children = normalizeDividers(prepareList(item.submenu, `${key}.`, actions));
      if (children.length === 0) return;
      out.push({
        type: "submenu",
        key,
        label: item.label,
        enabled: !item.disabled,
        items: children,
      });
      return;
    }

    const key = item.key ?? `${keyPrefix}item-${index}`;
    const shortcut = resolveShortcutDisplay(item);
    out.push({
      type: "item",
      key,
      label: item.label,
      enabled: !item.disabled,
      checked: item.checked,
      radioGroup: item.radioGroup,
      accelerator: item.accelerator,
      shortcut,
      danger: item.danger,
    });
    if (item.onClick) actions.set(key, item.onClick);
  });

  return out;
}

/** Drop empty edges and collapse consecutive dividers (recurses into submenus). */
export function normalizeDividers(
  items: SerializableContextMenuItem[],
): SerializableContextMenuItem[] {
  const mapped = items.map((item) => {
    if (item.type !== "submenu") return item;
    return { ...item, items: normalizeDividers(item.items) };
  });

  const compact: SerializableContextMenuItem[] = [];
  for (const item of mapped) {
    if (item.type === "divider") {
      if (compact.length === 0) continue;
      if (compact[compact.length - 1]?.type === "divider") continue;
      compact.push(item);
      continue;
    }
    if (item.type === "submenu" && item.items.length === 0) continue;
    compact.push(item);
  }
  while (compact.length > 0 && compact[compact.length - 1]?.type === "divider") {
    compact.pop();
  }
  return compact;
}
