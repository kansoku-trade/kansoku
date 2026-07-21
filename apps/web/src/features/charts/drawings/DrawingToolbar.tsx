import {
  AlignJustify,
  Eraser,
  Minus,
  MousePointer2,
  Ruler,
  Spline,
  Square,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANNOTATION_PALETTE } from '@kansoku/shared/drawings';
import type { AnnotationStyle } from '@kansoku/shared/types';
import type { DrawingsApi } from './useDrawings';
import type { DrawingTool } from './drawingsMachine';

const TOOLS: { tool: DrawingTool; icon: typeof MousePointer2; label: string }[] = [
  { tool: 'cursor', icon: MousePointer2, label: '选择' },
  { tool: 'measure', icon: Ruler, label: '测量' },
  { tool: 'trendline', icon: TrendingUp, label: '趋势线' },
  { tool: 'polyline', icon: Spline, label: '多段线' },
  { tool: 'hline', icon: Minus, label: '水平线' },
  { tool: 'rect', icon: Square, label: '矩形' },
  { tool: 'fib', icon: AlignJustify, label: '斐波那契' },
];

const WIDTHS = [1, 2, 3] as const;
const CLEAR_ARM_MS = 3000;

function useArmedConfirm(ms: number): [boolean, (onConfirm: () => void) => void] {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(
    (onConfirm: () => void) => {
      if (!armed) {
        setArmed(true);
        timerRef.current = setTimeout(() => setArmed(false), ms);
        return;
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
    },
    [armed, ms],
  );

  return [armed, trigger];
}

export function DrawingToolbar({ api }: { api: DrawingsApi }) {
  const [armedAll, triggerAll] = useArmedConfirm(CLEAR_ARM_MS);
  const [armedAi, triggerAi] = useArmedConfirm(CLEAR_ARM_MS);

  return (
    <>
      <div className="drawing-toolbar" aria-label="标注工具">
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            aria-pressed={api.activeTool === tool}
            onClick={() => api.setActiveTool(tool)}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
        <div className="drawing-toolbar-sep" />
        <button
          className={armedAll ? 'drawing-toolbar-clear-armed' : undefined}
          disabled={api.count === 0}
          onClick={() => triggerAll(api.clearAll)}
          title={armedAll ? '再次点击确认清除全部' : '清除全部'}
        >
          <Trash2 size={16} />
        </button>
        {api.hasAi && (
          <button
            className={armedAi ? 'drawing-toolbar-clear-armed' : undefined}
            onClick={() => triggerAi(api.clearAi)}
            title={armedAi ? '再次点击确认清除 AI 画线' : '清 AI'}
          >
            <Eraser size={16} />
          </button>
        )}
      </div>
      {api.selected ? (
        <StylePanel
          style={api.selected.style}
          showArrow={api.selected.kind === 'trendline' || api.selected.kind === 'polyline'}
          onPatch={(patch) => api.updateStyle(api.selected!.id, patch)}
        />
      ) : (
        api.activeTool !== 'cursor' &&
        api.activeTool !== 'measure' && (
          <StylePanel
            style={api.draftStyle}
            showArrow={api.activeTool === 'trendline' || api.activeTool === 'polyline'}
            onPatch={api.updateDraftStyle}
          />
        )
      )}
    </>
  );
}

function StylePanel({
  style,
  showArrow,
  onPatch,
}: {
  style: AnnotationStyle | undefined;
  showArrow: boolean;
  onPatch: (patch: Partial<AnnotationStyle>) => void;
}) {
  return (
    <div className="drawing-style-panel" aria-label="样式">
      <div className="drawing-style-row">
        {ANNOTATION_PALETTE.map((color) => (
          <button
            key={color}
            className={`drawing-style-swatch${style?.color === color ? ' active' : ''}`}
            style={{ background: color }}
            title={color}
            onClick={() => onPatch({ color })}
          />
        ))}
      </div>
      <div className="drawing-style-row">
        {WIDTHS.map((width) => (
          <button
            key={width}
            className={`drawing-style-width${style?.width === width ? ' active' : ''}`}
            title={`粗细 ${width}`}
            onClick={() => onPatch({ width })}
          >
            {width}
          </button>
        ))}
        <button
          className={`drawing-style-dash${style?.dash ? ' active' : ''}`}
          title="虚线开关"
          onClick={() => onPatch({ dash: !style?.dash })}
        >
          虚线
        </button>
        {showArrow && (
          <button
            className={`drawing-style-arrow${style?.arrow ? ' active' : ''}`}
            title="箭头开关"
            onClick={() => onPatch({ arrow: !style?.arrow })}
          >
            箭头
          </button>
        )}
      </div>
    </div>
  );
}
