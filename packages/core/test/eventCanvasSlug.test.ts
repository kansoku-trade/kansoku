import { describe, expect, it } from 'vitest';
import { eventCanvasSlug } from '../src/events/eventCanvasSlug.js';

describe('eventCanvasSlug', () => {
  it('binds a kebab-case slug to the event id so retries overwrite the same file', () => {
    expect(eventCanvasSlug('a1b2c3d4e5f60718293a4b5c')).toBe('event-a1b2c3d4e5f60718293a4b5c');
  });

  it('rejects an id that would produce an invalid canvas slug', () => {
    expect(() => eventCanvasSlug('Not A Slug')).toThrow(/kebab-case/);
  });
});
