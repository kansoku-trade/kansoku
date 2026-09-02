import type { ComponentType } from 'react';
import type { ResearchAssistantProps } from '@web/features/research/ResearchAssistant';

export interface WebProComposition {
  researchAssistantPanel: ComponentType<ResearchAssistantProps>;
  settingsSections?: readonly ComponentType[];
}
