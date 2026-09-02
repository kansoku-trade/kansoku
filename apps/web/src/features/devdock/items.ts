import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Cpu, Gauge, Gpu, MemoryStick, Route, Ruler, ScanEye } from 'lucide-react';
import { getDevDockState, updateDevDock, type DevDockState } from './devDockStore';

interface DevDockItemBase {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultPinned?: boolean;
}

export interface DevDockReadoutItem extends DevDockItemBase {
  type: 'readout';
  slot: 'center' | 'right';
  load: () => Promise<{ default: ComponentType }>;
}

export interface DevDockToggleItem extends DevDockItemBase {
  type: 'toggle';
  getChecked: (state: DevDockState) => boolean;
  onToggle: (checked: boolean) => void;
}

export type DevDockItem = DevDockReadoutItem | DevDockToggleItem;

export const DEV_DOCK_ITEMS: DevDockItem[] = [
  {
    type: 'readout',
    id: 'route-path',
    label: '路由',
    icon: Route,
    slot: 'center',
    defaultPinned: true,
    load: () => import('./widgets/RoutePathWidget').then((m) => ({ default: m.RoutePathWidget })),
  },
  {
    type: 'readout',
    id: 'fps',
    label: 'FPS',
    icon: Gauge,
    slot: 'right',
    defaultPinned: true,
    load: () => import('./widgets/FpsWidget').then((m) => ({ default: m.FpsWidget })),
  },
  {
    type: 'readout',
    id: 'memory',
    label: '内存',
    icon: MemoryStick,
    slot: 'right',
    defaultPinned: true,
    load: () => import('./widgets/MemoryWidget').then((m) => ({ default: m.MemoryWidget })),
  },
  {
    type: 'readout',
    id: 'cpu',
    label: 'CPU',
    icon: Cpu,
    slot: 'right',
    defaultPinned: true,
    load: () => import('./widgets/CpuWidget').then((m) => ({ default: m.CpuWidget })),
  },
  {
    type: 'readout',
    id: 'gpu',
    label: 'GPU',
    icon: Gpu,
    slot: 'right',
    defaultPinned: true,
    load: () => import('./widgets/GpuWidget').then((m) => ({ default: m.GpuWidget })),
  },
  {
    type: 'toggle',
    id: 'react-scan',
    label: 'React Scan',
    icon: ScanEye,
    getChecked: (state) => state.reactScan,
    onToggle: (reactScan) => updateDevDock({ reactScan }),
  },
  {
    type: 'toggle',
    id: 'mesurer',
    label: '标尺',
    icon: Ruler,
    getChecked: (state) => state.mesurer,
    onToggle: (mesurer) => updateDevDock({ mesurer }),
  },
];

export function isItemPinned(
  item: DevDockItem,
  overrides = getDevDockState().pinOverrides,
): boolean {
  return overrides[item.id] ?? item.defaultPinned ?? false;
}

export interface DevDockBarLayout {
  center?: DevDockReadoutItem;
  right: DevDockItem[];
}

export function selectBarLayout(
  items: DevDockItem[],
  overrides: Record<string, boolean>,
): DevDockBarLayout {
  const pinned = items.filter((item) => isItemPinned(item, overrides));
  return {
    center: pinned.find(
      (item): item is DevDockReadoutItem => item.type === 'readout' && item.slot === 'center',
    ),
    right: pinned.filter((item) => item.type !== 'readout' || item.slot === 'right'),
  };
}
