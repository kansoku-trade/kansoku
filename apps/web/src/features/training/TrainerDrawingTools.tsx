import type { DrawingTool } from '../charts/drawings/drawingsMachine';
import { TrainerOverlayPortal } from './trainerOverlay';
import type { TrainerDrawingsApi } from './useTrainerDrawings';

const TOOLS: { tool: DrawingTool; label: string; path: string }[] = [
  { tool: 'cursor', label: '选择', path: 'M4 2 L4 14 L7.4 11 L9.6 15 L11.4 14 L9.2 10.2 L13 10 Z' },
  { tool: 'trendline', label: '趋势线', path: 'M2.5 13.5 L13.5 2.5' },
  { tool: 'hline', label: '水平线', path: 'M2 8 L14 8' },
  { tool: 'rect', label: '矩形', path: 'M3 4 H13 V12 H3 Z' },
];

const CLEAR_PATH = 'M4 4 L12 12 M12 4 L4 12';

export function TrainerDrawingTools({ api }: { api: TrainerDrawingsApi }) {
  return (
    <TrainerOverlayPortal slot="rail">
      {TOOLS.map(({ tool, label, path }) => (
        <button
          key={tool}
          className="trainer-rail-tool"
          aria-pressed={api.tool === tool}
          aria-label={label}
          title={
            api.tool === tool
              ? `${label} · 再按一次退出绘图，把图交还给下单`
              : `${label}（本局有效）`
          }
          onClick={() => api.setTool(api.tool === tool ? 'off' : tool)}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d={path} />
          </svg>
        </button>
      ))}
      <div className="trainer-rail-sep" />
      <button
        className="trainer-rail-tool"
        aria-label="清除绘图"
        title="清除本局所有绘图"
        disabled={api.count === 0}
        onClick={api.clear}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d={CLEAR_PATH} />
        </svg>
      </button>
    </TrainerOverlayPortal>
  );
}
