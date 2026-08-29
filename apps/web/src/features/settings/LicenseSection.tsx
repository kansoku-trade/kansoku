import * as stylex from '@stylexjs/stylex';
import { Card, SectionTitle } from '@web/ui';
import { LicensePanel } from './LicensePanel';

const styles = stylex.create({
  card: {
    minWidth: 0,
    overflow: 'hidden',
    padding: 0,
  },
});

export function LicenseSection() {
  return (
    <Card
      className={`settings-license-card ${stylex.props(styles.card).className}`}
      id="license-section"
    >
      <div className="settings-card-heading">
        <SectionTitle>订阅与授权</SectionTitle>
      </div>
      <LicensePanel />
    </Card>
  );
}
