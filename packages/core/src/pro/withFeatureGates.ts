import type { RouteGroup } from '../contract/defineRoutes.js';
import { requireFeature } from './features.js';

export function withFeatureGates<Api>(group: RouteGroup<Api>, impl: Api): Api {
  const result = { ...impl };
  for (const key of Object.keys(group.routes) as (keyof Api)[]) {
    const feature = group.routes[key].feature;
    if (!feature) continue;
    const original = impl[key] as unknown as (...args: unknown[]) => unknown;
    result[key] = (async (...args: unknown[]) => {
      await requireFeature(feature);
      return original(...args);
    }) as Api[typeof key];
  }
  return result;
}
