import type { ComponentType } from 'react';
import type { ResearchAssistantProps } from '@web/features/research/ResearchAssistant';
import type { SettingsSectionId } from '@web/features/settings/types';

export interface ProSettingsSection {
  id: string;
  section: SettingsSectionId;
  Component: ComponentType;
}

export interface WebProComposition {
  researchAssistantPanel: ComponentType<ResearchAssistantProps>;
  settingsSections?: readonly ProSettingsSection[];
}
