import { useId, type ReactNode } from 'react';

export interface SegmentedControlOption<Value extends string> {
  label: ReactNode;
  value: Value;
}

interface SegmentedControlProps<Value extends string> {
  ariaLabel: string;
  className?: string;
  fit?: boolean;
  onChange: (value: Value) => void;
  options: readonly SegmentedControlOption<Value>[];
  size?: 'sm';
  value: Value;
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  className,
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
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <label className="ui-segmented-control-option" key={option.value}>
          <input
            checked={value === option.value}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
