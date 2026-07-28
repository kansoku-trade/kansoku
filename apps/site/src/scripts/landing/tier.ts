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

const detectWebgl2 = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
};

export const detectCapabilities = (): Capabilities => ({
  pointerFine: window.matchMedia('(pointer: fine)').matches,
  viewportWidth: window.innerWidth,
  webgl2: detectWebgl2(),
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
