import * as stylex from '@stylexjs/stylex';
import { Card, SectionTitle } from '@web/ui';
import { LicensePanel } from './LicensePanel';
import { colors } from '../../theme/tokens.stylex';

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
});

export function LicenseSection() {
  return (
    <Card
      className={`settings-license-card ${stylex.props(styles.card).className}`}
      id="license-section"
    >
      <div className={`settings-card-heading ${stylex.props(styles.heading).className}`}>
        <SectionTitle className={stylex.props(styles.headingTitle).className}>
          订阅与授权
        </SectionTitle>
      </div>
      <LicensePanel />
    </Card>
  );
}
