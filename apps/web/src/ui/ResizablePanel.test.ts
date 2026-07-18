import { describe, expect, it } from 'vitest';
import { panelSizeFromKey, panelSizeFromPointer } from './ResizablePanel.js';

describe('resizable panel pointer behavior', () => {
  it('moves a start-side separator with the pointer and respects width limits', () => {
    expect(
      panelSizeFromPointer({
        side: 'start',
        startSize: 320,
        startPosition: 320,
        currentPosition: 400,
        minSize: 240,
        maxSize: 480,
      }),
    ).toBe(400);
    expect(
      panelSizeFromPointer({
        side: 'start',
        startSize: 320,
        startPosition: 320,
        currentPosition: 80,
        minSize: 240,
        maxSize: 480,
      }),
    ).toBe(240);
  });

  it('reverses the width delta for an end-side panel', () => {
    expect(
      panelSizeFromPointer({
        side: 'end',
        startSize: 300,
        startPosition: 900,
        currentPosition: 850,
        minSize: 220,
        maxSize: 500,
      }),
    ).toBe(350);
  });
});

describe('resizable panel keyboard behavior', () => {
  it('moves the physical separator in the arrow direction for either side', () => {
    expect(
      panelSizeFromKey({ key: 'ArrowRight', side: 'start', size: 300, minSize: 220, maxSize: 500 }),
    ).toBe(316);
    expect(
      panelSizeFromKey({ key: 'ArrowRight', side: 'end', size: 300, minSize: 220, maxSize: 500 }),
    ).toBe(284);
  });

  it('supports direct minimum and maximum positions', () => {
    expect(
      panelSizeFromKey({ key: 'Home', side: 'start', size: 300, minSize: 220, maxSize: 500 }),
    ).toBe(220);
    expect(
      panelSizeFromKey({ key: 'End', side: 'start', size: 300, minSize: 220, maxSize: 500 }),
    ).toBe(500);
    expect(
      panelSizeFromKey({ key: 'Enter', side: 'start', size: 300, minSize: 220, maxSize: 500 }),
    ).toBeNull();
  });
});
