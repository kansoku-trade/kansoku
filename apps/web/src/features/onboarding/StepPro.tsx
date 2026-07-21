import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { Paywall } from '../edition/LicenseModal';
import { Card } from '../../ui';

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
    <Card className="onboarding-card">
      <Paywall onActivated={() => void finish()} />
      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}
      <div className="onboarding-skip-row">
        <button className="onboarding-skip-link" disabled={busy} onClick={() => void finish()}>
          跳过，先免费使用
        </button>
      </div>
    </Card>
  );
}
