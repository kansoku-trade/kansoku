import { Switch as BaseSwitch } from '@base-ui/react/switch';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    'position': 'relative',
    'display': 'inline-flex',
    'alignItems': 'center',
    'width': '28px',
    'height': '16px',
    'padding': '2px',
    'boxSizing': 'border-box',
    'border': `1px solid ${colors.borderStrong}`,
    'borderRadius': '2px',
    'backgroundColor': colors.backgroundCanvas,
    'cursor': 'pointer',
    'transitionProperty': 'background, border-color',
    'transitionDuration': '120ms',
    'transitionTimingFunction': 'ease',
    ':hover:not([data-disabled])': {
      borderColor: colors.textMuted,
    },
    ':focus-visible': {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: '2px',
    },
  },
  checked: {
    'borderColor': `color-mix(in srgb, ${colors.accent} 68%, ${colors.borderStrong})`,
    'backgroundColor': `color-mix(in srgb, ${colors.accent} 12%, ${colors.backgroundCanvas})`,
    ':hover:not([data-disabled])': {
      borderColor: colors.accent,
    },
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  thumb: {
    width: '10px',
    height: '10px',
    borderRadius: '1px',
    backgroundColor: colors.textMuted,
    transform: 'translateX(0)',
    transitionProperty: 'transform, background',
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease',
  },
  thumbChecked: {
    backgroundColor: colors.accent,
    transform: 'translateX(12px)',
  },
});

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <BaseSwitch.Root
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      className={`ui-switch ${stylex.props(styles.root, checked && styles.checked, disabled && styles.disabled).className}`}
      onCheckedChange={onCheckedChange}
    >
      <BaseSwitch.Thumb
        className={`ui-switch-thumb ${stylex.props(styles.thumb, checked && styles.thumbChecked).className}`}
      />
    </BaseSwitch.Root>
  );
}
