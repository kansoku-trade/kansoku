import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { ROLE_LABEL, type Role, type RoleMode } from './types';

const MODE_OPTIONS = [
  { value: 'inherit', label: '跟随主模型' },
  { value: 'custom', label: '自定义' },
  { value: 'disabled', label: '停用' },
] satisfies readonly SegmentedControlOption<RoleMode>[];

const styles = stylex.create({
  root: {
    'width': '236px',
    'height': '30px',
    'gridTemplateColumns': '1.35fr 1fr 0.75fr',
    '@media (max-width: 560px)': { width: 'min(100%, 260px)' },
  },
});

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
      ariaLabel={ROLE_LABEL[role] + '分配方式'}
      className={stylex.props(styles.root).className}
      value={value}
      options={MODE_OPTIONS}
      onChange={onChange}
    />
  );
}
