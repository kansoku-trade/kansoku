import { localTimeZone } from '@kansoku/shared/time';
import * as stylex from '@stylexjs/stylex';
import {
  setTimeDisplayPreference,
  type TimeDisplayPreference,
  useTimeDisplayPreference,
} from '@web/lib/timeDisplayPreference';
import { Card, SectionTitle, SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { colors, fontSizes, fonts, sizes } from '../../theme/tokens.stylex';

const OPTIONS = [
  { value: 'market', label: '美东时间' },
  { value: 'local', label: '本地时间' },
] satisfies readonly SegmentedControlOption<TimeDisplayPreference>[];

const styles = stylex.create({
  card: {
    minWidth: 0,
    overflow: 'hidden',
    padding: 0,
  },
  heading: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    minHeight: '34px',
    padding: '0 11px',
  },
  headingTitle: {
    margin: 0,
  },
  timePreference: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'space-between',
    'padding': '11px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  preferenceCopy: {
    minWidth: 0,
  },
  preferenceName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  preferenceDescription: {
    color: colors.textMuted,
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  timeMode: {
    'width': '168px',
    'flex': '0 0 auto',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 560px)': { width: '100%' },
  },
});

export function TimeDisplaySettingsCard() {
  const preference = useTimeDisplayPreference();
  const timeZone = localTimeZone();

  return (
    <Card className={`settings-display-card ${stylex.props(styles.card).className}`}>
      <div className={`settings-card-heading ${stylex.props(styles.heading).className}`}>
        <SectionTitle className={stylex.props(styles.headingTitle).className}>显示</SectionTitle>
      </div>
      <div className={`settings-time-preference ${stylex.props(styles.timePreference).className}`}>
        <div
          className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
        >
          <div
            className={`settings-preference-name ${stylex.props(styles.preferenceName).className}`}
          >
            优先显示的时间
          </div>
          <div
            className={`settings-preference-description ${stylex.props(styles.preferenceDescription).className}`}
          >
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
