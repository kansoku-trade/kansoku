import { useId, type ReactNode } from 'react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'grid',
    gridAutoColumns: '1fr',
    gridAutoFlow: 'column',
  },
  rootSolid: {
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  rootOpen: {
    columnGap: '20px',
  },
  rootPlain: {
    columnGap: '18px',
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
  labelUnderline: {
    'borderBottomColor': 'transparent',
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '2px',
    'fontSize': fontSizes.control,
    'padding': '2px 0',
    ':hover': {
      color: colors.textSecondary,
    },
  },
  labelPlain: {
    'fontSize': fontSizes.control,
    'padding': 0,
    ':hover': {
      color: colors.textSecondary,
    },
  },
  selectedUnderline: {
    backgroundColor: 'transparent',
    borderBottomColor: colors.accent,
    color: colors.textPrimary,
  },
  selectedPlain: {
    backgroundColor: 'transparent',
    color: colors.textPrimary,
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
    fontSize: fontSizes.control,
    gap: '5px',
    height: '100%',
    justifyContent: 'center',
    minHeight: '30px',
    padding: '0 12px',
    whiteSpace: 'nowrap',
  },
  compactLabel: {
    minHeight: '26px',
    padding: '0 10px',
  },
  largeLabel: {
    fontSize: fontSizes.lg,
  },
  selected: {
    backgroundColor: colors.backgroundHover,
    color: colors.textPrimary,
    fontWeight: 600,
  },
});

export type SegmentedControlVariant = 'solid' | 'underline' | 'plain';

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
  size?: 'sm' | 'lg';
  value: Value;
  variant?: SegmentedControlVariant;
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
  variant = 'solid',
}: SegmentedControlProps<Value>) {
  const name = useId();
  const solid = variant === 'solid';
  const classes = clsx(
    'ui-segmented-control',
    `ui-segmented-control--${variant}`,
    size && `ui-segmented-control--${size}`,
    (fit || !solid) && 'ui-segmented-control--fit',
    stylex.props(
      styles.root,
      solid && styles.rootSolid,
      variant === 'underline' && styles.rootOpen,
      variant === 'plain' && styles.rootPlain,
      (fit || !solid) && styles.fit,
    ).className,
    className,
  );

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
              solid && index > 0 && styles.optionAdjacent,
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
                variant === 'underline' && styles.labelUnderline,
                variant === 'plain' && styles.labelPlain,
                size === 'sm' && styles.compactLabel,
                size === 'lg' && styles.largeLabel,
                value === option.value && styles.selected,
                value === option.value && variant === 'underline' && styles.selectedUnderline,
                value === option.value && variant === 'plain' && styles.selectedPlain,
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
