import { describe, expect, it } from 'vitest';
import { resolveRenderStep } from './stepResolution';

describe('resolveRenderStep', () => {
  it('renders longbridge whenever the gate says longbridge, regardless of local progress', () => {
    expect(resolveRenderStep('longbridge', 'ai')).toBe('longbridge');
    expect(resolveRenderStep('longbridge', 'twitter')).toBe('longbridge');
  });

  it('renders local progress once the gate has moved past longbridge', () => {
    expect(resolveRenderStep('ai', 'ai')).toBe('ai');
    expect(resolveRenderStep('ai', 'twitter')).toBe('twitter');
  });
});
