import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../../theme/tokens.stylex';
import { formatRuntime } from './presentTranscript.js';

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '2px 0 4px',
  },
  label: {
    color: colors.textMuted,
    flexShrink: 0,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  line: {
    backgroundColor: colors.border,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    height: '1px',
  },
});

export function TurnRuntime({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = now - Date.parse(startedAt);
  return (
    <div className={`chat-runtime ${stylex.props(styles.row).className}`}>
      <span className={stylex.props(styles.label).className}>{formatRuntime(elapsed)}</span>
      <span className={stylex.props(styles.line).className} aria-hidden="true" />
    </div>
  );
}
