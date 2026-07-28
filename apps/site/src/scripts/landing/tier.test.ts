import { describe, expect, it } from 'vitest';

import type { Capabilities } from './tier';
import { resolveTier } from './tier';

function caps(overrides: Partial<Capabilities>): Capabilities {
  return {
    pointerFine: true,
    viewportWidth: 1440,
    webgl2: true,
    reducedMotion: false,
    ...overrides,
  };
}

describe('resolveTier', () => {
  it('returns full when every capability is satisfied', () => {
    expect(resolveTier(caps({}))).toBe('full');
  });

  it('returns lite for a narrow viewport', () => {
    expect(resolveTier(caps({ viewportWidth: 768 }))).toBe('lite');
  });

  it('returns lite for a coarse pointer', () => {
    expect(resolveTier(caps({ pointerFine: false }))).toBe('lite');
  });

  it('returns lite without webgl2', () => {
    expect(resolveTier(caps({ webgl2: false }))).toBe('lite');
  });

  it('returns still when reducedMotion is set, even with every other capability satisfied', () => {
    expect(resolveTier(caps({ reducedMotion: true }))).toBe('still');
  });

  it('returns still when reducedMotion is set, even with every other capability failing', () => {
    expect(
      resolveTier(
        caps({ reducedMotion: true, pointerFine: false, viewportWidth: 320, webgl2: false }),
      ),
    ).toBe('still');
  });

  it('treats viewportWidth 1024 as full', () => {
    expect(resolveTier(caps({ viewportWidth: 1024 }))).toBe('full');
  });

  it('treats viewportWidth 1023 as lite', () => {
    expect(resolveTier(caps({ viewportWidth: 1023 }))).toBe('lite');
  });
});
