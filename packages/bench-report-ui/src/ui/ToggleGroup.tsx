import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';

export function ToggleGroup<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  ariaLabel: string;
}) {
  return (
    <BaseToggleGroup
      className="ui-toggle-group"
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0];
        if (picked) onChange(picked);
      }}
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} className="ui-toggle">
          {option.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
