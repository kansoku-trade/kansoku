import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii, sizes } from '../theme/tokens.stylex';

const styles = stylex.create({
  trigger: {
    'alignItems': 'center',
    'backgroundColor': colors.backgroundElement,
    'border': `1px solid ${colors.borderStrong}`,
    'borderRadius': radii.default,
    'boxSizing': 'border-box',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.base,
    'fontVariantNumeric': 'tabular-nums',
    'gap': '5px',
    'height': sizes.controlHeight,
    'padding': '0 9px',
    'whiteSpace': 'nowrap',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    '[data-popup-open]': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: 'none',
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
      opacity: 0.7,
    },
  },
  icon: {
    color: colors.textSecondary,
    display: 'inline-flex',
  },
  positioner: {
    zIndex: 60,
  },
  popup: {
    backgroundColor: colors.backgroundSurface,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.default,
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.35)',
    overflowY: 'auto',
    padding: '3px',
  },
  item: {
    'alignItems': 'center',
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'flex',
    'fontSize': fontSizes.sm,
    'fontVariantNumeric': 'tabular-nums',
    'gap': '10px',
    'justifyContent': 'space-between',
    'minHeight': '26px',
    'padding': '4px 8px',
    'whiteSpace': 'nowrap',
    '[data-highlighted]': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    '[data-selected]': {
      color: colors.textPrimary,
    },
  },
  itemCheck: {
    color: colors.accent,
    display: 'inline-flex',
  },
});

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  options,
  onChange,
  className,
  disabled = false,
  ariaLabel,
  placeholder,
  onOpenChange,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BaseSelect.Root
      items={options}
      value={value || null}
      disabled={disabled}
      onValueChange={(v) => onChange(v as string)}
      onOpenChange={(open) => onOpenChange?.(open)}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={`ui-select-trigger ${stylex.props(styles.trigger).className}${className ? ` ${className}` : ''}`}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className={`ui-select-icon ${stylex.props(styles.icon).className}`}>
          <ChevronDown size={12} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={`ui-select-positioner ${stylex.props(styles.positioner).className}`}
          sideOffset={4}
        >
          <BaseSelect.Popup className={`ui-select-popup ${stylex.props(styles.popup).className}`}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className={`ui-select-item ${stylex.props(styles.item).className}`}
                >
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator
                    className={`ui-select-item-check ${stylex.props(styles.itemCheck).className}`}
                  >
                    <Check size={11} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
