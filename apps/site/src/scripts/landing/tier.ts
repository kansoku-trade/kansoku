export type Tier = 'full' | 'lite' | 'still';

export interface Capabilities {
  pointerFine: boolean;
  viewportWidth: number;
  webgl2: boolean;
  reducedMotion: boolean;
}

export const resolveTier = (caps: Capabilities): Tier => {
  if (caps.reducedMotion) return 'still';
  if (!caps.pointerFine || caps.viewportWidth < 1024 || !caps.webgl2) return 'lite';
  return 'full';
};
