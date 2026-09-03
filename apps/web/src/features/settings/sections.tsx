import type { ComponentType } from 'react';
import { BadgeCheck, Bot, Monitor, Plug, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { AiSettingsPane } from './AiSettingsPane';
import { AdvancedPane, ConnectionsPane, DisplayPane, LicensePane } from './panes';
import type { SettingsSectionId } from './types';

export interface SettingsSectionDef {
  id: SettingsSectionId;
  label: string;
  description: string;
  Icon: LucideIcon;
  Pane: ComponentType;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  {
    id: 'ai',
    label: 'AI 模型',
    description: '角色分配、Provider 凭据与今日用量',
    Icon: Bot,
    Pane: AiSettingsPane,
  },
  {
    id: 'display',
    label: '显示',
    description: '时间口径与关注的市场',
    Icon: Monitor,
    Pane: DisplayPane,
  },
  {
    id: 'connections',
    label: '连接',
    description: '行情来源、本地工作区与同步',
    Icon: Plug,
    Pane: ConnectionsPane,
  },
  {
    id: 'license',
    label: '订阅与授权',
    description: '当前方案、设备与付费功能',
    Icon: BadgeCheck,
    Pane: LicensePane,
  },
  {
    id: 'advanced',
    label: '高级',
    description: '技能模板、离线训练与诊断',
    Icon: SlidersHorizontal,
    Pane: AdvancedPane,
  },
];

export function findSettingsSection(id: string | undefined): SettingsSectionDef | null {
  return SETTINGS_SECTIONS.find((section) => section.id === id) ?? null;
}
