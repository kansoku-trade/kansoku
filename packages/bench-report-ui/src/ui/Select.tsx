import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from './icons';

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(next) => onChange((next as string | null) ?? '')}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={className ? `ui-select ${className}` : 'ui-select'}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon className="ui-select-icon">
          <ChevronDown />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-select-positioner" sideOffset={4}>
          <BaseSelect.Popup className="ui-select-popup">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item key={option.value} value={option.value} className="ui-select-item">
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="ui-select-check">
                    <Check />
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
