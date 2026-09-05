import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { ANNOTATION_PALETTE } from '@kansoku/shared/drawings';
import type { AnnotationStyle } from '@kansoku/shared/types';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';

const WIDTHS = [1, 2, 3] as const;

const styles = stylex.create({
  panel: {
    position: 'absolute',
    top: '40px',
    left: '46px',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    backgroundColor: 'rgba(10, 10, 10, 0.9)',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  swatch: {
    width: '16px',
    height: '16px',
    borderRadius: radii.full,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    cursor: 'pointer',
    padding: 0,
  },
  swatchActive: {
    outline: `2px solid ${colors.textPrimary}`,
    outlineOffset: '1px',
  },
  control: {
    'height': '22px',
    'padding': '0 6px',
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'fontSize': fontSizes.xs,
    'cursor': 'pointer',
    ':hover': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
  },
  width: {
    width: '22px',
    padding: 0,
  },
  active: {
    color: colors.accent,
    borderColor: colors.accent,
  },
});

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
    <div
      className={clsx(stylex.props(styles.panel).className, className)}
      aria-label="样式"
    >
      <div className={stylex.props(styles.row).className}>
        {ANNOTATION_PALETTE.map((color) => (
          <button
            key={color}
            className={
              stylex.props(styles.swatch, style?.color === color && styles.swatchActive).className
            }
            style={{ background: color }}
            title={color}
            onClick={() => onPatch({ color })}
          />
        ))}
      </div>
      <div className={stylex.props(styles.row).className}>
        {WIDTHS.map((width) => (
          <button
            key={width}
            className={
              stylex.props(styles.control, styles.width, style?.width === width && styles.active)
                .className
            }
            title={`粗细 ${width}`}
            onClick={() => onPatch({ width })}
          >
            {width}
          </button>
        ))}
        <button
          className={stylex.props(styles.control, style?.dash && styles.active).className}
          title="虚线开关"
          onClick={() => onPatch({ dash: !style?.dash })}
        >
          虚线
        </button>
        {showArrow && (
          <button
            className={stylex.props(styles.control, style?.arrow && styles.active).className}
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
