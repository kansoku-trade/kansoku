import { useId, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'grid',
    gridAutoColumns: '1fr',
    gridAutoFlow: 'column',
  },
  fit: {
    gridAutoColumns: 'auto',
  },
  option: {
    'cursor': 'pointer',
    'minWidth': 0,
    'position': 'relative',
    ':focus-within': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      zIndex: 1,
    },
  },
  optionAdjacent: {
    borderLeftColor: colors.borderStrong,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  optionDisabled: {
    cursor: 'default',
    opacity: 0.55,
  },
  input: {
    height: '1px',
    opacity: 0,
    pointerEvents: 'none',
    position: 'absolute',
    width: '1px',
  },
  label: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    height: '100%',
    justifyContent: 'center',
    padding: '4px 10px',
    whiteSpace: 'nowrap',
  },
  compactLabel: {
    padding: '2px 8px',
  },
  selected: {
    backgroundColor: colors.backgroundHover,
    color: colors.textPrimary,
    fontWeight: 600,
  },
});

export interface SegmentedControlOption<Value extends string> {
  label: ReactNode;
  value: Value;
}

interface SegmentedControlProps<Value extends string> {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  fit?: boolean;
  onChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  size?: 'sm';
  value: Value;
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  className,
  disabled,
  fit,
  onChange,
  options,
  size,
  value,
}: SegmentedControlProps<Value>) {
  const name = useId();
  const classes = [
    'ui-segmented-control',
    size === 'sm' && 'ui-segmented-control--sm',
    fit && 'ui-segmented-control--fit',
    stylex.props(styles.root, fit && styles.fit).className,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {options.map((option, index) => (
        <label
          className={
            stylex.props(
              styles.option,
              index > 0 && styles.optionAdjacent,
              disabled && styles.optionDisabled,
            ).className
          }
          key={option.value}
        >
          <input
            className={stylex.props(styles.input).className}
            checked={value === option.value}
            disabled={disabled}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span
            className={
              stylex.props(
                styles.label,
                size === 'sm' && styles.compactLabel,
                value === option.value && styles.selected,
              ).className
            }
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
