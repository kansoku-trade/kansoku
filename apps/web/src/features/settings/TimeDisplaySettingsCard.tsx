import { localTimeZone } from '@kansoku/shared/time';
import * as stylex from '@stylexjs/stylex';
import {
  setTimeDisplayPreference,
  useTimeDisplayPreference,
  type TimeDisplayPreference,
} from '@web/lib/timeDisplayPreference';
import { SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const OPTIONS = [
  { value: 'market', label: '美东时间' },
  { value: 'local', label: '本地时间' },
] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

const styles = stylex.create({
  mode: {
    'width': '168px',
    'flex': '0 0 auto',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 560px)': { width: '100%' },
  },
});

export function TimeDisplaySettingsCard() {
  const preference = useTimeDisplayPreference();

  return (
    <SettingsGroup name="时间显示">
      <SettingsRow
        label="优先显示的时间"
        description={`本地时区 ${localTimeZone()}，鼠标停上去看另一个时区`}
      >
        <SegmentedControl
          ariaLabel="优先显示的时间"
          className={stylex.props(styles.mode).className}
          value={preference}
          options={OPTIONS}
          onChange={setTimeDisplayPreference}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
