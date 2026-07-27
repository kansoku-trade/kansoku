// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawingsPrimitive, DrawingsState } from '../charts/drawings/drawingsPrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { useTrainerDrawings, type TrainerDrawingsApi } from './useTrainerDrawings';

const BAR_TIMES = [1000, 2000, 3000, 4000];

// x maps straight onto a bar index and y = 300 - price, so every drawn point is checkable by hand.
function makeHandle() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(container);
  const attached: DrawingsPrimitive[] = [];
  const series = {
    attachPrimitive: (p: DrawingsPrimitive) => attached.push(p),
    detachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => 300 - price,
    coordinateToPrice: (y: number) => 300 - y,
  };
  const chart = {
    applyOptions: vi.fn(),
    timeScale: () => ({
      coordinateToLogical: (x: number) => x,
      logicalToCoordinate: (logical: number) => logical,
    }),
  };
  const handle = { chart, series, container } as unknown as DrawingChartHandle;
  return { handle, container, chart, attached };
}

function renderHook(handle: DrawingChartHandle, caseId: string) {
  const api: { current: TrainerDrawingsApi | null } = { current: null };
  function Host({ id }: { id: string }) {
    api.current = useTrainerDrawings(handle, BAR_TIMES, id);
    return null;
  }
  const view = render(<Host id={caseId} />);
  return { api, rerender: (id: string) => view.rerender(<Host id={id} />) };
}

function state(attached: DrawingsPrimitive[]): DrawingsState {
  return attached[0].state().state;
}

function drawTwoPoint(container: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(container, { clientX: from[0], clientY: from[1] });
  fireEvent.pointerDown(container, { clientX: to[0], clientY: to[1] });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useTrainerDrawings', () => {
  it('starts with the chart handed to the order tools, drawing nothing', () => {
    const { handle, container, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    expect(api.current!.tool).toBe('off');
    drawTwoPoint(container, [1, 210], [2, 190]);

    expect(state(attached).annotations).toEqual([]);
    expect(api.current!.count).toBe(0);
  });

  it('draws a trend line from two presses', () => {
    const { handle, container, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    api.current!.setTool('trendline');
    drawTwoPoint(container, [1, 210], [2, 190]);

    const [drawn] = state(attached).annotations;
    expect(drawn.kind).toBe('trendline');
    expect(drawn.points).toEqual([
      { time: 2000, price: 90 },
      { time: 3000, price: 110 },
    ]);
  });

  it('draws a horizontal line from one press', () => {
    const { handle, container, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    api.current!.setTool('hline');
    fireEvent.pointerDown(container, { clientX: 1, clientY: 205 });

    expect(state(attached).annotations[0]).toMatchObject({
      kind: 'hline',
      points: [{ time: 2000, price: 95 }],
    });
  });

  it('draws a rectangle from two presses', () => {
    const { handle, container, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    api.current!.setTool('rect');
    drawTwoPoint(container, [0, 210], [3, 180]);

    expect(state(attached).annotations[0].kind).toBe('rect');
    expect(api.current!.count).toBe(1);
  });

  it('keeps what was drawn across a step within the same case', () => {
    const { handle, container, attached } = makeHandle();
    const { api, rerender } = renderHook(handle, 'case-1');

    api.current!.setTool('hline');
    fireEvent.pointerDown(container, { clientX: 1, clientY: 205 });
    rerender('case-1');

    expect(state(attached).annotations).toHaveLength(1);
    expect(api.current!.count).toBe(1);
  });

  it('discards everything when a new case arrives, and hands the chart back', () => {
    const { handle, container, attached } = makeHandle();
    const { api, rerender } = renderHook(handle, 'case-1');

    api.current!.setTool('hline');
    fireEvent.pointerDown(container, { clientX: 1, clientY: 205 });
    rerender('case-2');

    expect(state(attached).annotations).toEqual([]);
    expect(api.current!.count).toBe(0);
    expect(api.current!.tool).toBe('off');
  });

  it('clears on demand without touching the tool', () => {
    const { handle, container, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    api.current!.setTool('hline');
    fireEvent.pointerDown(container, { clientX: 1, clientY: 205 });
    api.current!.clear();

    expect(state(attached).annotations).toEqual([]);
    expect(api.current!.tool).toBe('hline');
  });

  // Escape resets the shared interaction layer to 'cursor'; in 'off' the order tools hold the
  // pointer and only the toolbar may hand it over.
  it('does not let the interaction layer take the chart back on Escape', () => {
    const { handle, attached } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(api.current!.tool).toBe('off');
    expect(state(attached).annotations).toEqual([]);
  });

  it('never writes the chart pan/zoom flags — the panel owns that lock', () => {
    const { handle, container, chart } = makeHandle();
    const { api } = renderHook(handle, 'case-1');

    api.current!.setTool('trendline');
    drawTwoPoint(container, [1, 210], [2, 190]);
    api.current!.setTool('off');

    expect(chart.applyOptions).not.toHaveBeenCalled();
  });

  // A second attach would paint the same shapes twice and leak the first layer, which is what
  // happens the moment any callback handed to the interaction layer stops being referentially
  // stable.
  it('attaches exactly one paint layer across re-renders and tool changes', () => {
    const { handle, attached } = makeHandle();
    const { api, rerender } = renderHook(handle, 'case-1');

    api.current!.setTool('rect');
    rerender('case-1');
    api.current!.setTool('off');
    rerender('case-1');

    expect(attached).toHaveLength(1);
  });
});
