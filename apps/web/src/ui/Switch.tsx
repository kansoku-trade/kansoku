import { Switch as BaseSwitch } from "@base-ui/react/switch";

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
      className="ui-switch"
      onCheckedChange={onCheckedChange}
    >
      <BaseSwitch.Thumb className="ui-switch-thumb" />
    </BaseSwitch.Root>
  );
}
