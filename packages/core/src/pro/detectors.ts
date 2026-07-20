import type { ProDetectors } from '@kansoku/pro-api';
import { featureStateSync } from './features.js';

let activeDetectors: Partial<ProDetectors> = {};

export function registerProDetectors(d: ProDetectors): void {
  activeDetectors = d;
}

export function resetProDetectorsForTests(): void {
  activeDetectors = {};
}

export function currentProDetectors(): Partial<ProDetectors> {
  return activeDetectors;
}

const PATTERN_KEYS = [
  'findPriceDivergence',
  'findMacdBeichi',
  'detect123Patterns',
  'detectSecondBreakouts',
  'detectCandlePatterns',
  'enrichCandlePatterns',
] as const satisfies readonly (keyof ProDetectors)[];

export function activeProDetectors(): Partial<ProDetectors> {
  const out: Partial<ProDetectors> = {};
  if (featureStateSync('auto-patterns') === 'active') {
    for (const key of PATTERN_KEYS) {
      const impl = activeDetectors[key];
      if (impl) Object.assign(out, { [key]: impl });
    }
  }
  if (featureStateSync('options-walls') === 'active' && activeDetectors.getOptionsLevels) {
    out.getOptionsLevels = activeDetectors.getOptionsLevels;
  }
  return out;
}
