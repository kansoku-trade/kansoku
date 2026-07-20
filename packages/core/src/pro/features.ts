import {
  FEATURES,
  type FeatureKey,
  type FeatureState,
  type FeatureTier,
} from '@kansoku/pro-api/features';
import { ClientError } from '../platform/errors.js';
import { isLicensed } from '../license/licenseGate.js';
import { getPro, hasEncBundle } from './registry.js';

const featureCatalog: Record<FeatureKey, { tier: FeatureTier }> = FEATURES;

function resolveState(
  tier: FeatureTier,
  proPresent: boolean,
  licensed: boolean,
  encBundlePresent: boolean,
): FeatureState {
  if (tier === 'free') return 'active';
  if (!proPresent) return encBundlePresent ? 'locked' : 'absent';
  return licensed ? 'active' : 'locked';
}

export async function featureState(key: FeatureKey): Promise<FeatureState> {
  const tier = featureCatalog[key].tier;
  if (tier === 'free') return 'active';
  return resolveState(tier, getPro() != null, isLicensed(), hasEncBundle());
}

export async function featureStates(): Promise<Record<FeatureKey, FeatureState>> {
  const proPresent = getPro() != null;
  const licensed = isLicensed();
  const encBundlePresent = hasEncBundle();
  const keys = Object.keys(featureCatalog) as FeatureKey[];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      resolveState(featureCatalog[key].tier, proPresent, licensed, encBundlePresent),
    ]),
  ) as Record<FeatureKey, FeatureState>;
}

export async function isFeatureActive(key: FeatureKey): Promise<boolean> {
  return (await featureState(key)) === 'active';
}

export async function requireFeature(key: FeatureKey): Promise<void> {
  const state = await featureState(key);
  if (state === 'absent') {
    throw new ClientError('AI features are not available in this build', undefined, 404);
  }
  if (state === 'locked') {
    throw new ClientError(
      'AI features require an active license',
      `feature: ${key}`,
      403,
      'LICENSE_REQUIRED',
    );
  }
}
