import type { ReactNode } from 'react';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { useFeature } from './useFeature';

export function FeatureGate({
  feature,
  locked = null,
  children,
}: {
  feature: FeatureKey;
  locked?: ReactNode;
  children: ReactNode;
}) {
  const { state } = useFeature(feature);
  if (state === 'absent') return null;
  if (state === 'locked') return <>{locked}</>;
  return <>{children}</>;
}
