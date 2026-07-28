import { StylePanel } from '../charts/drawings/StylePanel';
import type { DrawingTool } from '../charts/drawings/drawingsMachine';
import { TrainerOverlayPortal } from './trainerOverlay';
import type { TrainerDrawingsApi } from './useTrainerDrawings';

const TOOLS: { tool: DrawingTool; label: string; path: string }[] = [
  { tool: 'cursor', label: '选择', path: 'M4 2 L4 14 L7.4 11 L9.6 15 L11.4 14 L9.2 10.2 L13 10 Z' },
  { tool: 'measure', label: '测量', path: 'M3 13 L13 3 M5.5 10.5 L7 12 M8 8 L9.5 9.5 M10.5 5.5 L12 7' },
  { tool: 'trendline', label: '趋势线', path: 'M2.5 13.5 L13.5 2.5' },
  { tool: 'polyline', label: '多段线', path: 'M2 12 L6 6 L9 9 L14 3' },
  { tool: 'hline', label: '水平线', path: 'M2 8 L14 8' },
  { tool: 'rect', label: '矩形', path: 'M3 4 H13 V12 H3 Z' },
  { tool: 'fib', label: '斐波那契', path: 'M2 4 H14 M2 8 H14 M2 12 H14' },
];

const CLEAR_PATH = 'M4 4 L12 12 M12 4 L4 12';
const UNDO_PATH = 'M6 3 L3 6 L6 9 M3 6 H10 A3.5 3.5 0 0 1 10 13 H7';
const REDO_PATH = 'M10 3 L13 6 L10 9 M13 6 H6 A3.5 3.5 0 0 0 6 13 H9';

const isMac =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
const UNDO_LABEL = isMac ? '撤销（⌘Z）' : '撤销（Ctrl+Z）';
const REDO_LABEL = isMac ? '重做（⇧⌘Z）' : '重做（Ctrl+Shift+Z）';

export function TrainerDrawingTools({ api }: { api: TrainerDrawingsApi }) {
  return (
    <>
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
          aria-label={UNDO_LABEL}
          title={UNDO_LABEL}
          disabled={!api.canUndo}
          onClick={api.undo}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d={UNDO_PATH} />
          </svg>
        </button>
        <button
          className="trainer-rail-tool"
          aria-label={REDO_LABEL}
          title={REDO_LABEL}
          disabled={!api.canRedo}
          onClick={api.redo}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d={REDO_PATH} />
          </svg>
        </button>
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
      <TrainerOverlayPortal slot="pinned">
        {api.selected ? (
          <StylePanel
            style={api.selected.style}
            showArrow={api.selected.kind === 'trendline' || api.selected.kind === 'polyline'}
            onPatch={(patch) => api.updateStyle(api.selected!.id, patch)}
            className="trainer-style-panel"
          />
        ) : (
          api.tool !== 'off' &&
          api.tool !== 'cursor' &&
          api.tool !== 'measure' && (
            <StylePanel
              style={api.draftStyle}
              showArrow={api.tool === 'trendline' || api.tool === 'polyline'}
              onPatch={api.updateDraftStyle}
              className="trainer-style-panel"
            />
          )
        )}
      </TrainerOverlayPortal>
    </>
  );
}
