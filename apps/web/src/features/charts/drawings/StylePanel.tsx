import { ANNOTATION_PALETTE } from '@kansoku/shared/drawings';
import type { AnnotationStyle } from '@kansoku/shared/types';

const WIDTHS = [1, 2, 3] as const;

export function StylePanel({
  style,
  showArrow,
  onPatch,
  className,
}: {
  style: AnnotationStyle | undefined;
  showArrow: boolean;
  onPatch: (patch: Partial<AnnotationStyle>) => void;
  className?: string;
}) {
  return (
    <div className={`drawing-style-panel${className ? ` ${className}` : ''}`} aria-label="样式">
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
