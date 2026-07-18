import { SegmentedControl, type SegmentedControlOption } from "@web/ui";
import { ROLE_LABEL, type Role, type RoleMode } from "./types";

const MODE_OPTIONS = [
  { value: "inherit", label: "跟随主模型" },
  { value: "custom", label: "自定义" },
  { value: "disabled", label: "停用" },
] satisfies readonly SegmentedControlOption<RoleMode>[];

export function RoleModeControl({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: RoleMode;
  onChange: (mode: RoleMode) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel={ROLE_LABEL[role] + "分配方式"}
      className="settings-role-mode"
      value={value}
      options={MODE_OPTIONS}
      onChange={onChange}
    />
  );
}
