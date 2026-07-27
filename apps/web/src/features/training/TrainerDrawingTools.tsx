import type { DrawingTool } from '../charts/drawings/drawingsMachine';
import type { TrainerDrawingsApi } from './useTrainerDrawings';

const TOOLS: { tool: DrawingTool; label: string }[] = [
  { tool: 'cursor', label: '选择' },
  { tool: 'trendline', label: '趋势线' },
  { tool: 'hline', label: '水平线' },
  { tool: 'rect', label: '矩形' },
];

export function TrainerDrawingTools({ api }: { api: TrainerDrawingsApi }) {
  return (
    <div className="trainer-draw-tools">
      <span className="trainer-size-label">绘图</span>
      {TOOLS.map(({ tool, label }) => (
        <button
          key={tool}
          className="btn"
          aria-pressed={api.tool === tool}
          onClick={() => api.setTool(api.tool === tool ? 'off' : tool)}
        >
          {label}
        </button>
      ))}
      <button className="btn" disabled={api.count === 0} onClick={api.clear}>
        清除
      </button>
      <span className="trainer-order-hint">
        {api.tool === 'off'
          ? '本局内有效，收盘随案例丢弃；下单时会自动让出图上的拖拽'
          : '再按一次同一个工具可以退出绘图，把图交还给下单'}
      </span>
    </div>
  );
}
