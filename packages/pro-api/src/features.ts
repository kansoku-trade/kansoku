export type FeatureTier = 'free' | 'pro';
export type FeatureState = 'active' | 'locked' | 'absent';

export const FEATURES = {
  'symbol-follow': { tier: 'pro' },
  'deep-dive': { tier: 'pro' },
  'research-ai': { tier: 'pro' },
  'memory': { tier: 'pro' },
  'auto-patterns': { tier: 'pro' },
  'options-walls': { tier: 'pro' },
} as const satisfies Record<string, { tier: FeatureTier }>;

export type FeatureKey = keyof typeof FEATURES;
