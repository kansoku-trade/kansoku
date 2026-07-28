import type { ReplicaChart } from '../replica/chart';
import type { DrawingTool } from '../replica/drawingShapes';

export interface ToolbarControls {
  select: (tool: DrawingTool) => void;
  destroy: () => void;
}

export const mountToolbarControls = (
  root: ParentNode,
  chart: ReplicaChart | null,
  onUserPick?: () => void,
): ToolbarControls | null => {
  const toolbar = root.querySelector<HTMLElement>('[data-demo-toolbar]');
  if (!toolbar || !chart) return null;

  const buttons = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-demo-tool]'));
  if (buttons.length === 0) return null;

  const select = (tool: DrawingTool): void => {
    for (const button of buttons) {
      const active = button.dataset.demoTool === tool;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    chart.drawings.setTool(tool);
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-demo-clear]')) {
      chart.drawings.clear();
      return;
    }
    const button = target.closest<HTMLElement>('[data-demo-tool]');
    const tool = button?.dataset.demoTool as DrawingTool | undefined;
    if (!tool) return;
    onUserPick?.();
    // Pressing the live tool again returns the chart to panning, matching the app's rail.
    select(tool === chart.drawings.tool() && tool !== 'cursor' ? 'cursor' : tool);
  };

  toolbar.addEventListener('click', onClick);
  select('cursor');

  return {
    select,
    destroy: () => toolbar.removeEventListener('click', onClick),
  };
};
