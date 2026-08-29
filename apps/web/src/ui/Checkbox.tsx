import * as stylex from '@stylexjs/stylex';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import { colors, radii } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundElement,
    'borderStyle': 'none',
    'borderWidth': 0,
    'boxSizing': 'border-box',
    'borderRadius': radii.default,
    'boxShadow': `0 0 0 1px ${colors.borderStrong}`,
    'color': colors.backgroundCanvas,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'justifyContent': 'center',
    'padding': 0,
    'transition': 'background 120ms ease, box-shadow 120ms ease',
    ':hover:not([data-disabled])': {
      boxShadow: `0 0 0 1px ${colors.textMuted}`,
    },
    ':focus-visible': {
      outline: colors.focusOutline,
      outlineOffset: '1px',
    },
  },
  sm: {
    height: '12px',
    width: '12px',
  },
  md: {
    height: '15px',
    width: '15px',
  },
  checked: {
    backgroundColor: colors.accent,
    boxShadow: 'none',
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
  },
  indicator: {
    display: 'inline-flex',
  },
});

export type CheckboxSize = 'sm' | 'md';

const ICON_SIZE: Record<CheckboxSize, number> = { sm: 9, md: 11 };

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  size = 'md',
  ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: CheckboxSize;
  ariaLabel?: string;
  className?: string;
}) {
  const styleClassName = stylex.props(
    styles.root,
    styles[size],
    checked && styles.checked,
    disabled && styles.disabled,
  ).className;

  return (
    <BaseCheckbox.Root
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      className={`ui-checkbox ui-checkbox--${size} ${styleClassName}${className ? ` ${className}` : ''}`}
      onCheckedChange={onCheckedChange}
    >
      <BaseCheckbox.Indicator
        className={`ui-checkbox-indicator ${stylex.props(styles.indicator).className}`}
      >
        <Check size={ICON_SIZE[size]} strokeWidth={3} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
