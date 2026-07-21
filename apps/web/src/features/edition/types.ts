import type { ComponentType } from 'react';

export interface WebProComposition {
  routes: Readonly<Record<string, ComponentType>>;
}
