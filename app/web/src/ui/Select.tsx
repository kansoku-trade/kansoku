import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

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
        className={className ? `ui-select-trigger ${className}` : "ui-select-trigger"}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className="ui-select-icon">
          <ChevronDown size={12} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-select-positioner" sideOffset={4}>
          <BaseSelect.Popup className="ui-select-popup">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} className="ui-select-item">
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="ui-select-item-check">
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
