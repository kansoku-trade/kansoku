import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '../../lib/api';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { Paywall } from '../edition/LicenseModal';
import { Card } from '../../ui';

const styles = stylex.create({
  card: {
    maxWidth: '480px',
    width: '100%',
  },
  skipRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '14px',
  },
  skipLink: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'padding': 0,
    ':hover:not(:disabled)': {
      color: colors.textPrimary,
    },
    ':disabled': {
      cursor: 'default',
      opacity: 0.5,
    },
  },
});

export function StepPro({ onComplete }: { onComplete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card {...stylex.props(styles.card)}>
      <Paywall onActivated={() => void finish()} />
      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}
      <div {...stylex.props(styles.skipRow)}>
        <button {...stylex.props(styles.skipLink)} disabled={busy} onClick={() => void finish()}>
          跳过，先免费使用
        </button>
      </div>
    </Card>
  );
}
