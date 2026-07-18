import type { MenuItemConstructorOptions } from "electron";

export type NativeContextMenuItem =
  | {
      type: "item";
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
      type: "divider";
      key: string;
    }
  | {
      type: "submenu";
      key: string;
      label: string;
      enabled: boolean;
      items: NativeContextMenuItem[];
    };

export function buildNativeContextMenuTemplate(
  items: NativeContextMenuItem[],
  onSelect: (key: string) => void,
): MenuItemConstructorOptions[] {
  return items.map((item) => mapItem(item, onSelect));
}

function mapItem(
  item: NativeContextMenuItem,
  onSelect: (key: string) => void,
): MenuItemConstructorOptions {
  if (item.type === "divider") {
    return { type: "separator" };
  }

  if (item.type === "submenu") {
    return {
      label: item.label,
      enabled: item.enabled,
      submenu: buildNativeContextMenuTemplate(item.items, onSelect),
    };
  }

  const base: MenuItemConstructorOptions = {
    label: item.label,
    enabled: item.enabled,
    accelerator: item.accelerator,
    click: () => onSelect(item.key),
  };

  if (item.radioGroup) {
    return {
      ...base,
      type: "radio",
      checked: Boolean(item.checked),
    };
  }

  if (item.checked !== undefined) {
    return {
      ...base,
      type: "checkbox",
      checked: item.checked,
    };
  }

  return {
    ...base,
    type: "normal",
  };
}
