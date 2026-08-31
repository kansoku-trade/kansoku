// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_COMPONENT_NAMES, CANVAS_NON_COMPONENT_EXPORTS } from '@kansoku/canvas/names';
import { checkCanvasSource } from '@kansoku/core/canvas/check';
import source from './kitchenSink.canvas.tsx?raw';

vi.mock('lightweight-charts', () => ({
  createChart: () => {
    throw new Error('jsdom has no chart backend');
  },
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  createSeriesMarkers: () => {},
}));

const sdk = await import('@kansoku/canvas');
const { loadCanvasComponent } = await import('../canvasRuntime');

const names = Object.values(CANVAS_COMPONENT_NAMES).flat();

afterEach(() => {
  cleanup();
});

describe('canvas kitchen sink demo', () => {
  it('is a source the canvas checker accepts', () => {
    expect(checkCanvasSource(source)).toEqual([]);
  });

  it('compiles and renders through the real canvas pipeline', () => {
    const result = loadCanvasComponent(source);
    if (!result.ok) throw new Error(result.issues.join('\n'));
    render(<result.Component />);
    expect(screen.getByText('Canvas 组件总览')).toBeTruthy();
  });

  it('exercises every component the SDK exports', () => {
    const missing = names.filter((name) => !new RegExp(`<${name}[\\s/>]`).test(source));
    expect(missing).toEqual([]);
  });
});

describe('component name registry', () => {
  it('matches the SDK entry point in both directions', () => {
    const exported = Object.keys(sdk).filter(
      (key) => !(CANVAS_NON_COMPONENT_EXPORTS as readonly string[]).includes(key),
    );
    expect([...names].sort()).toEqual(exported.sort());
  });
});
