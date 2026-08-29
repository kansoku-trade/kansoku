import { localTimeZone } from '@kansoku/shared/time';
import * as stylex from '@stylexjs/stylex';
import {
  setTimeDisplayPreference,
  type TimeDisplayPreference,
  useTimeDisplayPreference,
} from '@web/lib/timeDisplayPreference';
import { Card, SectionTitle, SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { sizes } from '../../theme/tokens.stylex';

const OPTIONS = [
  { value: 'market', label: '美东时间' },
  { value: 'local', label: '本地时间' },
] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

const styles = stylex.create({
  timeMode: {
    'width': '168px',
    'height': sizes.controlHeight,
    'flex': '0 0 auto',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 560px)': { width: '100%' },
  },
});

export function TimeDisplaySettingsCard() {
  const preference = useTimeDisplayPreference();
  const timeZone = localTimeZone();

  return (
    <Card className="settings-display-card">
      <div className="settings-card-heading">
        <SectionTitle>显示</SectionTitle>
      </div>
      <div className="settings-time-preference">
        <div className="settings-preference-copy">
          <div className="settings-preference-name">优先显示的时间</div>
          <div className="settings-preference-description">
            本地时区：{timeZone}。悬停时显示另一时区。
          </div>
        </div>
        <SegmentedControl
          ariaLabel="优先显示的时间"
          className={stylex.props(styles.timeMode).className}
          value={preference}
          options={OPTIONS}
          onChange={setTimeDisplayPreference}
        />
      </div>
    </Card>
  );
}
